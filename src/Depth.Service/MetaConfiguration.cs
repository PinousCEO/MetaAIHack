namespace Depth;

/// <summary>Service-owned credentials. Never returned to the UI, indexed or exported to command environments.</summary>
public sealed class MetaConfiguration
{
    public const string OfficialEndpoint="https://api.meta.ai/v1/";
    public string Endpoint { get; init; }=OfficialEndpoint;
    public string Model { get; init; }="muse-spark-1.3";
    public string ImageModel { get; init; }="muse-image-1.0";
    public string ApiKey { private get; init; }="";
    public bool HasKey=>!string.IsNullOrWhiteSpace(ApiKey);
    public static MetaConfiguration Load(string? file=null,bool useEnvironment=true)
    {
        file??=Environment.GetEnvironmentVariable("DEPTH_ENV_FILE")??Path.Combine(Environment.CurrentDirectory,".env");
        var values=new Dictionary<string,string>(StringComparer.Ordinal);
        if(File.Exists(file))foreach(var raw in File.ReadLines(file)){
            var line=raw.Trim();if(line.Length==0||line.StartsWith('#'))continue;
            int split=line.IndexOf('=');if(split<1)continue;
            var name=line[..split].Trim();var value=line[(split+1)..].Trim();
            if(value.Length>=2&&(value[0]=='\''&&value[^1]=='\''||value[0]=='"'&&value[^1]=='"'))value=value[1..^1];
            values[name]=value;
        }
        string Read(string name,string fallback)=>useEnvironment&&Environment.GetEnvironmentVariable(name) is {Length:>0} env?env:values.GetValueOrDefault(name,fallback);
        var config=new MetaConfiguration{ApiKey=Read("MODEL_API_KEY",""),Endpoint=Read("META_API_BASE_URL",OfficialEndpoint),Model=Read("META_MODEL","muse-spark-1.3"),ImageModel=Read("META_IMAGE_MODEL","muse-image-1.0")};
        RequireOfficial(config.Endpoint);return config;
    }
    public static Uri RequireOfficial(string endpoint)
    {
        if(!Uri.TryCreate(endpoint.TrimEnd('/')+"/",UriKind.Absolute,out var uri)||uri.Scheme!="https"||uri.Host!="api.meta.ai"||!uri.IsDefaultPort||uri.AbsolutePath!="/v1/"||uri.UserInfo!=""||uri.Query!=""||uri.Fragment!="")
            throw new InvalidOperationException("Meta Model API uses https://api.meta.ai/v1/. No alternate host receives the configured key.");
        return uri;
    }
    public MetaConnection Resolve(MetaConnection request)
    {
        if(request.Protocol!="meta-api")return request;
        var endpoint=string.IsNullOrWhiteSpace(request.Endpoint)?Endpoint:request.Endpoint;RequireOfficial(endpoint);
        return request with{Endpoint=endpoint,Model=string.IsNullOrWhiteSpace(request.Model)?Model:request.Model,ApiKey=string.IsNullOrWhiteSpace(request.ApiKey)?ApiKey:request.ApiKey};
    }
    public object Public()=>new{provider="meta-api",Endpoint,Model,ImageModel,keyConfigured=HasKey,
        imageGeneration="Muse Image: 2D or 3D-style raster images",meshGeneration="not provided by the configured Model API"};
}
