using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Depth;

public static class MetaConnectivity
{
    public static async Task<object> Check(bool probe=false,HttpClient? client=null)
    {
        var config=MetaConfiguration.Load();
        if(!config.HasKey)return new{status="missing-key",detail="Set MODEL_API_KEY in .env or the service environment."};
        var connection=config.Resolve(new());
        using var owned=client==null?new HttpClient(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(20)}:null;
        var http=client??owned!;
        using var request=new HttpRequestMessage(HttpMethod.Get,new Uri(MetaConfiguration.RequireOfficial(connection.Endpoint),"models"));
        request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",connection.ApiKey);
        var endpoint=request.RequestUri!;var proxy=HttpClient.DefaultProxy;var proxyUri=proxy.IsBypassed(endpoint)?null:proxy.GetProxy(endpoint);
        var route=new{destinationHost=endpoint.Host,proxyHost=proxyUri?.Host,proxyPort=proxyUri?.Port};
        string stage="model-list";
        try{
            using var response=await http.SendAsync(request);
            if(!response.IsSuccessStatusCode)return new{status="http-error",httpStatus=(int)response.StatusCode,detail="Meta returned an HTTP error; no alternate host or model was used."};
            using var json=JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var models=json.RootElement.GetProperty("data").EnumerateArray().Select(v=>v.GetProperty("id").GetString()).ToArray();
            if(!probe)return new{status="connected",models,configuredModel=config.Model,imageModel=config.ImageModel,inferenceVerified=false};
            stage="text-inference";
            var result=await new MetaModel(client,config).Complete(new(),new JsonArray(new JsonObject{["role"]="user",["content"]="Reply with just OK."}));
            bool verified=result.Text.Trim().Equals("OK",StringComparison.OrdinalIgnoreCase);
            return new{status=verified?"connected":"probe-failed",models,configuredModel=config.Model,imageModel=config.ImageModel,inferenceVerified=verified};
        }catch(Exception e)when(e is HttpRequestException or TaskCanceledException){
            SocketException? socket=null;for(Exception? cause=e;cause!=null;cause=cause.InnerException)if(cause is SocketException s)socket=s;
            return new{status="connection-failed",stage,route,category=e is HttpRequestException h?h.HttpRequestError.ToString():"TimeoutOrCancellation",socketError=socket?.SocketErrorCode.ToString(),keyValidity="unverified",
                detail="No successful response from the configured Meta route. Proxy settings were preserved; no alternate host or model was used."};
        }catch(Exception e)when(e is InvalidOperationException or JsonException){
            return new{status="probe-failed",stage,category=e.GetType().Name,detail="Meta did not complete the requested API probe. No sample transformation was run."};
        }
    }
}
