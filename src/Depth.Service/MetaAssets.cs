using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Buffers.Binary;

namespace Depth;

public record MetaAssetConnection(string Endpoint=MetaConfiguration.OfficialEndpoint,string ApiKey="",string Protocol="meta-api",string Model="");
public record MetaAssetRequest(MetaAssetConnection Connection,string ProjectId,string Revision,string Kind,string Prompt,int Seed=42,string ImagePath="",string MaskPath="",string Style="2d");
public record MetaAssetImport(string Id,string ProjectId,string Revision,string Destination,bool Approved);
public record MetaAssetRecord(string Id,string ProjectId,string Revision,string Kind,string Model,string Prompt,int Seed,
    string Hash,string Format,long Bytes,string Status,string ImportedPath,SourceFile[] Inputs,DateTimeOffset At,string GenerationMethod="legacy-worker",string Style="");
record MetaAssetResponse(string Protocol,string Provider,string Model,string Format,string ContentBase64);

/// <summary>Muse Image on Meta Model API. Earlier research workers are opt-in compatibility adapters only.</summary>
public sealed class MetaAssets(string storage,Workspace workspace,HttpClient? client=null,MetaConfiguration? configuration=null)
{
    readonly MetaConfiguration config=configuration??new();
    string DirectoryPath(string project)=>Path.Combine(storage,"meta-assets",project);
    string JobPath(string project,string id)=>Path.Combine(DirectoryPath(project),id);
    static void Id(string id){if(!Guid.TryParseExact(id,"N",out _))throw new InvalidOperationException("Invalid asset job ID.");}
    public MetaAssetRecord[] List(){lock(workspace.Sync){var directory=DirectoryPath(workspace.Require().ProjectId);return Directory.Exists(directory)?Directory.GetFiles(directory,"record.json",SearchOption.AllDirectories).Select(p=>JsonSerializer.Deserialize<MetaAssetRecord>(File.ReadAllText(p),Wire.Json)!).OrderByDescending(r=>r.At).Take(50).ToArray():[];}}
    MetaAssetRecord Read(string project,string id){Id(id);return JsonSerializer.Deserialize<MetaAssetRecord>(File.ReadAllText(Path.Combine(JobPath(project,id),"record.json")),Wire.Json)??throw new InvalidOperationException("Missing asset record.");}
    public (byte[] Bytes,string Type) Content(string id)
    {
        lock(workspace.Sync){var item=Read(workspace.Require().ProjectId,id);var data=File.ReadAllBytes(Path.Combine(JobPath(item.ProjectId,id),"output."+item.Format));Validate(data,item.Format);
            if(SourceHash(data)!=item.Hash)throw new InvalidOperationException("Staged asset changed after generation.");return(data,item.Format=="png"?"image/png":"model/gltf-binary");}
    }
    static string SourceHash(byte[] data)=>Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(data)).ToLowerInvariant();
    internal static void Validate(byte[] bytes,string format)
    {
        if(bytes.Length is <20 or >67108864)throw new InvalidOperationException("Generated assets must be 20 bytes–64 MiB.");
        if(format=="png"){
            PngValidation.Validate(bytes);
        }else if(format=="glb"){
            if(Encoding.ASCII.GetString(bytes,0,4)!="glTF"||BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(4,4))!=2||BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(8,4))!=bytes.Length)
                throw new InvalidOperationException("Worker returned an invalid GLB 2 header.");
            int length=checked((int)BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(12,4)));
            if(length<=0||length>bytes.Length-20||Encoding.ASCII.GetString(bytes,16,4)!="JSON")throw new InvalidOperationException("GLB JSON chunk is missing.");
            using var json=JsonDocument.Parse(bytes.AsMemory(20,length));
            if(!json.RootElement.TryGetProperty("meshes",out var meshes)||meshes.GetArrayLength()==0)throw new InvalidOperationException("GLB contains no mesh.");
        }else throw new InvalidOperationException("Only generated PNG / GLB assets are supported.");
    }
    public async Task<MetaAssetRecord> Generate(MetaAssetRequest request,CancellationToken cancel=default)
    {
        if(request.Connection.Protocol=="meta-api")return await GenerateImage(request,cancel);
        if(request.Connection.Protocol!="worker")throw new InvalidOperationException("Choose Meta Model API; a research worker requires explicit worker protocol.");
        if(request.Kind is not ("image" or "object3d"))throw new InvalidOperationException("Choose image or object3d.");
        MetaModel.Endpoint(new("asset-worker",request.Connection.ApiKey,request.Connection.Endpoint,"llama-compatible"));var uri=new Uri(new Uri(request.Connection.Endpoint.TrimEnd('/')+"/"),"generate");
        if(request.Prompt.Length>4000||request.Kind=="image"&&string.IsNullOrWhiteSpace(request.Prompt))throw new InvalidOperationException("Enter an image prompt of at most 4,000 characters.");
        Graph graph;var inputs=new List<SourceFile>();string image="",mask="";
        lock(workspace.Sync){workspace.RequireSnapshot(request.ProjectId,request.Revision);graph=workspace.Require();
            string Input(string path){var file=graph.Files.SingleOrDefault(f=>f.Path==path&&f.Language=="asset")??throw new InvalidOperationException("Select an indexed project image or mask.");
                if(Path.GetExtension(path).ToLowerInvariant() is not (".png" or ".jpg" or ".jpeg"))throw new InvalidOperationException("3D inputs must be PNG/JPEG images.");
                var full=SourceAccess.Resolve(graph.Root,path);if(new FileInfo(full).Length>8*1024*1024)throw new InvalidOperationException("Each 3D input is limited to 8 MiB.");
                var bytes=File.ReadAllBytes(full);if(SourceHash(bytes)!=file.Hash)throw new InvalidOperationException("3D input image changed.");inputs.Add(file);return Convert.ToBase64String(bytes);}
            if(request.Kind=="object3d"){image=Input(request.ImagePath);mask=Input(request.MaskPath);}
        }
        using var owned=client==null?new HttpClient(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromMinutes(30)}:null;
        using var message=new HttpRequestMessage(HttpMethod.Post,uri);
        if(request.Connection.ApiKey!="")message.Headers.Authorization=new AuthenticationHeaderValue("Bearer",request.Connection.ApiKey);
        message.Content=new StringContent(JsonSerializer.Serialize(new{protocol="depth-meta-assets/v1",kind=request.Kind,prompt=request.Prompt,seed=request.Seed,imageBase64=image,maskBase64=mask},Wire.CompactJson),Encoding.UTF8,"application/json");
        using var response=await(client??owned!).SendAsync(message,HttpCompletionOption.ResponseHeadersRead,cancel);
        if(!response.IsSuccessStatusCode)throw new InvalidOperationException("Meta asset worker returned HTTP "+(int)response.StatusCode+". Check the configured worker/model; no fallback was used.");
        if(response.Content.Headers.ContentLength>90*1024*1024)throw new InvalidOperationException("Asset response exceeds 90 MiB.");
        using var stream=await response.Content.ReadAsStreamAsync(cancel);using var buffer=new MemoryStream();var block=new byte[65536];int read;
        while((read=await stream.ReadAsync(block,cancel))>0){if(buffer.Length+read>90*1024*1024)throw new InvalidOperationException("Asset response exceeds 90 MiB.");buffer.Write(block,0,read);}
        var answer=JsonSerializer.Deserialize<MetaAssetResponse>(buffer.ToArray(),Wire.Json)??throw new InvalidOperationException("Empty Meta asset response.");
        var expectedModel=request.Kind=="image"?"chameleon":"sam-3d-objects";var format=request.Kind=="image"?"png":"glb";
        if(answer.Protocol!="depth-meta-assets/v1"||answer.Provider!="meta"||answer.Model!=expectedModel||answer.Format!=format)throw new InvalidOperationException("Worker provenance/format does not match the selected Meta generator.");
        var output=Convert.FromBase64String(answer.ContentBase64);Validate(output,format);
        lock(workspace.Sync){workspace.RequireSnapshot(graph.ProjectId,graph.Revision);var id=Guid.NewGuid().ToString("N");var dir=JobPath(graph.ProjectId,id);Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir,"output."+format),output);var record=new MetaAssetRecord(id,graph.ProjectId,graph.Revision,request.Kind,answer.Model,request.Prompt,request.Seed,SourceHash(output),format,output.Length,"staged","",inputs.ToArray(),DateTimeOffset.UtcNow);
            AtomicJson.Write(Path.Combine(dir,"record.json"),record);return record;}
    }
    async Task<MetaAssetRecord> GenerateImage(MetaAssetRequest request,CancellationToken cancel)
    {
        if(request.Kind!="image")throw new InvalidOperationException("Meta Model API generates raster images, including 3D-style images. It does not expose a GLB mesh generation endpoint; no SAM worker is required or started.");
        if(request.Style is not ("2d" or "3d"))throw new InvalidOperationException("Choose 2d or 3d image style.");
        if(string.IsNullOrWhiteSpace(request.Prompt)||request.Prompt.Length>4000)throw new InvalidOperationException("Enter an image prompt of at most 4,000 characters.");
        var connection=config.Resolve(new(string.IsNullOrWhiteSpace(request.Connection.Model)?config.ImageModel:request.Connection.Model,request.Connection.ApiKey,request.Connection.Endpoint,"meta-api"));
        MetaModel.Endpoint(connection);Graph graph;
        lock(workspace.Sync){workspace.RequireSnapshot(request.ProjectId,request.Revision);graph=workspace.Require();}
        var prompt=(request.Style=="3d"?"Create a 3D-render-style raster image with depth, volume and lighting. ":"Create a 2D image. ")+request.Prompt;
        using var owned=client==null?new HttpClient(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromMinutes(10)}:null;
        using var message=new HttpRequestMessage(HttpMethod.Post,new Uri(MetaConfiguration.RequireOfficial(connection.Endpoint),"images/generations"));
        message.Headers.Authorization=new AuthenticationHeaderValue("Bearer",connection.ApiKey);
        message.Content=new StringContent(JsonSerializer.Serialize(new{model=connection.Model,prompt,n=1,response_format="b64_json",output_format="png"},Wire.CompactJson),Encoding.UTF8,"application/json");
        using var response=await(client??owned!).SendAsync(message,HttpCompletionOption.ResponseHeadersRead,cancel);
        if(!response.IsSuccessStatusCode)throw new InvalidOperationException("Meta image generation returned HTTP "+(int)response.StatusCode+". Check this account's model access. No other generator was used.");
        if(response.Content.Headers.ContentLength>90*1024*1024)throw new InvalidOperationException("Image response exceeds 90 MiB.");
        using var stream=await response.Content.ReadAsStreamAsync(cancel);using var buffer=new MemoryStream();var block=new byte[65536];int read;
        while((read=await stream.ReadAsync(block,cancel))>0){if(buffer.Length+read>90*1024*1024)throw new InvalidOperationException("Image response exceeds 90 MiB.");buffer.Write(block,0,read);}
        using var json=JsonDocument.Parse(buffer.ToArray());
        if(!json.RootElement.TryGetProperty("data",out var data)||data.ValueKind!=JsonValueKind.Array||data.GetArrayLength()!=1||!data[0].TryGetProperty("b64_json",out var encoded)||encoded.ValueKind!=JsonValueKind.String)
            throw new InvalidOperationException("Meta did not return the requested single base64 image. No remote image URL was followed.");
        var output=Convert.FromBase64String(encoded.GetString()!);Validate(output,"png");
        lock(workspace.Sync){workspace.RequireSnapshot(graph.ProjectId,graph.Revision);var id=Guid.NewGuid().ToString("N");var dir=JobPath(graph.ProjectId,id);Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir,"output.png"),output);var record=new MetaAssetRecord(id,graph.ProjectId,graph.Revision,"image",connection.Model,request.Prompt,0,SourceHash(output),"png",output.Length,"staged","",[],DateTimeOffset.UtcNow,"meta-model-api",request.Style);
            AtomicJson.Write(Path.Combine(dir,"record.json"),record);return record;}
    }
    public MetaAssetRecord Import(MetaAssetImport request)
    {
        if(!request.Approved)throw new InvalidOperationException("Review the generated asset before importing it.");
        lock(workspace.Sync){workspace.RequireSnapshot(request.ProjectId,request.Revision);var graph=workspace.Require();var record=Read(graph.ProjectId,request.Id);
            if(record.Status!="staged")throw new InvalidOperationException("This generated asset was already imported.");
            foreach(var input in record.Inputs)if(SourceAccess.HashFile(SourceAccess.Resolve(graph.Root,input.Path))!=input.Hash)throw new InvalidOperationException("Generation input changed; review a newly generated asset.");
            var full=SourceAccess.Resolve(graph.Root,request.Destination);
            if(Path.GetExtension(full)!="."+record.Format||request.Destination.Split('/','\\').SkipLast(1).Any(p=>!SourceAccess.IndexedPath(p+"/asset.cs")))throw new InvalidOperationException("Choose an indexed destination with the generated extension.");
            if(File.Exists(full)||Directory.Exists(full))throw new InvalidOperationException("Asset destination already exists. Overwrite is not supported.");
            var bytes=Content(record.Id).Bytes;Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            // No overwrite; write a complete staged file first, then atomically rename within the destination directory.
            var temporary=full+"."+Guid.NewGuid().ToString("N")+".tmp";File.WriteAllBytes(temporary,bytes);File.Move(temporary,full,false);
            record=record with{Status="imported",ImportedPath=Path.GetRelativePath(graph.Root,full).Replace('\\','/')};AtomicJson.Write(Path.Combine(JobPath(graph.ProjectId,record.Id),"record.json"),record);workspace.Refresh();return record;}
    }
}
