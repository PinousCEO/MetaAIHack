using System.Diagnostics;
using System.Net;
using System.Text.Json;

namespace Depth;

/// <summary>Explicit live-test transport for hosts where Windows Schannel is unavailable.
/// Uses Python's verified TLS, the original proxy environment and the same official API.
/// Never selected automatically by the application and never supplies simulated responses.</summary>
sealed class LiveHttpsTransport : HttpMessageHandler
{
    const string Script="""
import base64, json, sys, urllib.request, urllib.error
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None
try:
    item=json.load(sys.stdin)
    url=item['url']
    if url not in ('https://api.meta.ai/v1/models','https://api.meta.ai/v1/chat/completions','https://api.meta.ai/v1/images/generations'):
        raise ValueError('Unsupported official endpoint')
    data=base64.b64decode(item['body']) if item['body'] is not None else None
    req=urllib.request.Request(url,data=data,headers=item['headers'],method=item['method'])
    opener=urllib.request.build_opener(NoRedirect())
    try: response=opener.open(req,timeout=600)
    except urllib.error.HTTPError as error: response=error
    with response:
        body=response.read(90*1024*1024+1)
        if len(body)>90*1024*1024: raise ValueError('Response exceeds limit')
        json.dump({'status':response.code,'body':base64.b64encode(body).decode(),'contentType':response.headers.get('Content-Type','application/json')},sys.stdout)
except Exception as error:
    json.dump({'errorType':type(error).__name__},sys.stdout)
    sys.exit(1)
""";
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancel)
    {
        if(request.RequestUri?.Host!="api.meta.ai"||request.RequestUri.Scheme!="https")throw new InvalidOperationException("Live test TLS transport only accepts the official Meta host.");
        var start=new ProcessStartInfo("python"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
        start.ArgumentList.Add("-c");start.ArgumentList.Add(Script);
        using var process=Process.Start(start)??throw new InvalidOperationException("Python HTTPS process did not start.");
        try{
            var headers=request.Headers.ToDictionary(p=>p.Key,p=>string.Join(",",p.Value));
            if(request.Content!=null)headers["Content-Type"]=request.Content.Headers.ContentType?.ToString()??"application/json";
            var data=new{url=request.RequestUri.AbsoluteUri,method=request.Method.Method,headers,body=request.Content==null?null:Convert.ToBase64String(await request.Content.ReadAsByteArrayAsync(cancel))};
            var output=process.StandardOutput.ReadToEndAsync(cancel);var errors=process.StandardError.ReadToEndAsync(cancel);
            await process.StandardInput.WriteAsync(JsonSerializer.Serialize(data).AsMemory(),cancel);process.StandardInput.Close();
            await process.WaitForExitAsync(cancel);var text=await output;await errors;
            if(process.ExitCode!=0)throw new HttpRequestException("Verified Python HTTPS request failed; no response was substituted.");
            using var json=JsonDocument.Parse(text);var root=json.RootElement;
            return new HttpResponseMessage((HttpStatusCode)root.GetProperty("status").GetInt32()){Content=new ByteArrayContent(Convert.FromBase64String(root.GetProperty("body").GetString()!)),RequestMessage=request};
        }finally{if(!process.HasExited){process.Kill(entireProcessTree:true);await process.WaitForExitAsync();}}
    }
}
