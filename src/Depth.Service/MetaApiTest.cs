using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Depth;

public static class MetaApiTest
{
    sealed class Handler:HttpMessageHandler
    {
        public string Path="",Auth="";public JsonObject? Body;public int Calls;public bool UrlOnly;
        public const string Png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwaPj/HwAFggK/465+UQAAAABJRU5ErkJggg==";
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancel)
        {
            Calls++;Path=request.RequestUri!.AbsoluteUri;Auth=request.Headers.Authorization?.Parameter??"";Body=JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancel))!.AsObject();
            object result;
            if(Path.EndsWith("/images/generations"))result=UrlOnly?new{data=new[]{new{url="https://not-followed.invalid/image.png"}}}:(object)new{data=new[]{new{b64_json=Png}},output_format="png"};
            else if(Body["messages"]![0]!["content"]!.GetValue<string>().Contains("organizing actual code")){
                var packet=Body["messages"]![1]!["content"]!.GetValue<string>();using var metadata=JsonDocument.Parse(packet.Split("\nSOURCE ")[0]);
                var ids=metadata.RootElement.GetProperty("entityIds").EnumerateArray().Select(v=>v.GetString()!).ToArray();
                var note=new ModuleExplanation("값 제공","상수를 반환합니다.",["계산"],[],["7"],[],[],["모의 응답"],ids,new(2,"호출자에게 값을 제공하는 코드입니다.",[]));
                result=new{choices=new[]{new{message=new{role="assistant",content=JsonSerializer.Serialize(new SemanticPartition([new(ids,note)]),Wire.Json)},finish_reason="stop"}}};
            }else result=new{choices=new[]{new{message=new{role="assistant",content="OK"},finish_reason="stop"}}};
            return new(HttpStatusCode.OK){Content=new StringContent(JsonSerializer.Serialize(result,Wire.Json),Encoding.UTF8,"application/json")};
        }
    }
    public static void Run(string directory,Action<bool,string> check,Action<Action,string> reject)
    {
        Directory.CreateDirectory(directory);var env=Path.Combine(directory,".env");const string secret="fixture-only-not-a-key";
        File.WriteAllText(env,"# local fixture\nMODEL_API_KEY='"+secret+"'\nMETA_MODEL=muse-spark-1.3\nMETA_IMAGE_MODEL=muse-image-1.0\n");
        var config=MetaConfiguration.Load(env,useEnvironment:false);var resolved=config.Resolve(new());
        check(config.HasKey&&resolved.ApiKey==secret&&resolved.Model=="muse-spark-1.3"&&resolved.Endpoint==MetaConfiguration.OfficialEndpoint,"Explicit .env config loads Meta Model API credentials and model defaults");
        var visible=JsonSerializer.Serialize(config.Public(),Wire.Json);
        check(!visible.Contains(secret)&&!JsonSerializer.Serialize(config,Wire.Json).Contains(secret),"Public configuration and accidental config serialization omit the stored key");
        reject(()=>config.Resolve(new(Endpoint:"https://other.invalid/v1/")),"Stored Meta credentials cannot be forwarded to a caller-supplied foreign host");
        check(config.Resolve(new("local",Endpoint:"http://127.0.0.1:19001/v1/",Protocol:"llama-compatible")).ApiKey=="","Self-hosted compatibility does not inherit the hosted Meta key");
        using var handler=new Handler();using var http=new HttpClient(handler);var model=new MetaModel(http,config);
        var reply=model.Complete(new(),new JsonArray(new JsonObject{["role"]="user",["content"]="Reply OK"})).GetAwaiter().GetResult();
        check(reply.Text=="OK"&&handler.Path=="https://api.meta.ai/v1/chat/completions"&&handler.Auth==secret,"Current Meta chat uses api.meta.ai, scoped authentication and choices response (fixture)");
        check(handler.Body!["max_completion_tokens"]!.GetValue<int>()==32768&&handler.Body["reasoning_effort"]!.GetValue<string>()=="medium"&&!handler.Body.ContainsKey("temperature")&&!handler.Body.ContainsKey("max_tokens"),"Muse budget includes reasoning plus structured output and uses explicit medium effort");
        var root=Path.Combine(directory,"project");Directory.CreateDirectory(root);File.WriteAllText(Path.Combine(root,"value.py"),"def value():\n    return 7\n");
        var state=Path.Combine(directory,"state");var ws=new Workspace(state);var graph=ws.Import(root);
        var analysis=ws.Knowledge.Analyze(new(new(),graph.ProjectId,graph.Revision),model).GetAwaiter().GetResult();
        check(analysis.Complete&&analysis.Catalog.Modules.All(m=>m.Provider=="meta-model-api"&&m.Model==config.Model),"Existing source-bound explanations run through the modern Meta API with server-owned credentials");
        var assets=new MetaAssets(state,ws,http,config);
        var corrupt=Convert.FromBase64String(Handler.Png);corrupt[45]^=1;
        reject(()=>MetaAssets.Validate(corrupt,"png"),"PNG data corruption fails checksum verification before staging");
        reject(()=>MetaAssets.Validate(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ9kAAAAASUVORK5CYII="),"png"),"The formerly accepted malformed fixture PNG is now rejected");
        // Independent binary fixtures constructed with Python zlib; valid variants also decoded by Pillow.
        foreach(var (name,png) in new[]{
            ("indexed palette","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAABlBMVEUAAAD///+l2Z/dAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg=="),
            ("16-bit grayscale","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABEAAAAABq7kcWAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII="),
            ("Adam7 interlace","iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAAHe9q7oAAAAFElEQVR4nGNwaPj/nwFOEGDgFAAA1yAr4WZyKTgAAAAASUVORK5CYII=")}){
            MetaAssets.Validate(Convert.FromBase64String(png),"png");check(true,"Valid PNG accepted: "+name);
        }
        foreach(var (name,png) in new[]{
            ("invalid row filter","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN1aPj/HwAFmwLE0aeFXgAAAABJRU5ErkJggg=="),
            ("short pixel data","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR4nGNwaPgPAALDAcBv0mA2AAAAAElFTkSuQmCC"),
            ("extra pixel data","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADklEQVR4nGNwaPj/nwEACEECv7+qjZgAAAAASUVORK5CYII="),
            ("invalid zlib checksum","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwaPj/HwAFggIAuHDQTAAAAABJRU5ErkJggg=="),
            ("truncated zlib trailer","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACUlEQVR4nGNwaPj/HwC6ShIuAAAAAElFTkSuQmCC")})
            reject(()=>MetaAssets.Validate(Convert.FromBase64String(png),"png"),"PNG rejects "+name+" despite valid chunk checksums");
        var two=assets.Generate(new(new(),graph.ProjectId,graph.Revision,"image","A blue application icon")).GetAwaiter().GetResult();
        check(handler.Path=="https://api.meta.ai/v1/images/generations"&&handler.Auth==secret&&handler.Body!["model"]!.GetValue<string>()==config.ImageModel&&handler.Body["output_format"]!.GetValue<string>()=="png","Muse Image shares Meta authentication and uses the documented image-generation endpoint without a worker");
        check(two.Status=="staged"&&two.GenerationMethod=="meta-model-api"&&two.Style=="2d"&&assets.Content(two.Id).Bytes.SequenceEqual(Convert.FromBase64String(Handler.Png)),"Meta image output remains staged and inspectable before approval");
        var three=assets.Generate(new(new(),graph.ProjectId,graph.Revision,"image","A pearl module",Style:"3d")).GetAwaiter().GetResult();
        check(three.Format=="png"&&three.Kind=="image"&&three.Style=="3d"&&handler.Body!["prompt"]!.GetValue<string>().Contains("3D-render-style"),"3D-style generation is explicitly a raster image, never mislabeled as a GLB model");
        int calls=handler.Calls;reject(()=>assets.Generate(new(new(),graph.ProjectId,graph.Revision,"object3d","mesh")).GetAwaiter().GetResult(),"A missing hosted mesh API cannot silently invoke SAM or another model");
        check(handler.Calls==calls,"Unsupported mesh requests fail before any provider call");
        assets.Import(new(three.Id,graph.ProjectId,graph.Revision,"Assets/pearl.png",true));graph=ws.Require();
        check(graph.Entities.Any(e=>e.Kind=="Image"&&e.Anchors[0].Path=="Assets/pearl.png"),"Reviewed Muse output becomes a real project image");
        handler.UrlOnly=true;reject(()=>assets.Generate(new(new(),graph.ProjectId,graph.Revision,"image","icon")).GetAwaiter().GetResult(),"Unexpected image URLs are not fetched or given the user's API key");
        check(!Directory.GetFiles(state,"*.json",SearchOption.AllDirectories).Any(p=>File.ReadAllText(p).Contains(secret)),"Modern model and asset workflows do not persist credentials in graph/contracts/asset history");
    }
}
