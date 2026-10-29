using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Depth;

public static class McpBridge
{
    public static async Task Run(string connectionFile)
    {
        var connection = JsonSerializer.Deserialize<Connection>(File.ReadAllText(connectionFile), Wire.Json) ?? throw new InvalidOperationException("Missing connection.");
        var uri = new Uri(connection.Endpoint);
        if (!uri.IsLoopback || uri.Scheme != "http") throw new InvalidOperationException("Expected a local Depth service.");
        using var http = new HttpClient { BaseAddress = uri, Timeout = TimeSpan.FromSeconds(60) };
        http.DefaultRequestHeaders.Add("X-Depth-Token", connection.Token);
        string? line;
        while ((line = await Console.In.ReadLineAsync()) != null)
        {
            JsonElement id = default;
            try
            {
                if (line.Length > 4000000) throw new InvalidOperationException("MCP request too large.");
                using var request = JsonDocument.Parse(line); var root = request.RootElement;
                if (!root.TryGetProperty("id", out id)) continue;
                id = id.Clone();
                var method = root.GetProperty("method").GetString(); object result;
                switch (method)
                {
                    case "initialize":
                        var protocol = root.GetProperty("params").GetProperty("protocolVersion").GetString();
                        if (protocol is not ("2024-11-05" or "2025-03-26" or "2025-06-18")) protocol = "2025-06-18";
                        result = new { protocolVersion = protocol, capabilities = new { tools = new { listChanged = false } }, serverInfo = new { name = "depth-ai", version = "0.2.0" } }; break;
                    case "ping": result = new { }; break;
                    case "tools/list": result = new { tools = ContextTools.Definitions() }; break;
                    case "tools/call":
                        try
                        {
                            var parameters = root.GetProperty("params");
                            using var response = await http.PostAsJsonAsync("/context/call", new ToolRequest(parameters.GetProperty("name").GetString()!, parameters.GetProperty("arguments").GetRawText()), Wire.Json);
                            var text = await response.Content.ReadAsStringAsync();
                            result = new { content = new[] { new { type = "text", text } }, isError = !response.IsSuccessStatusCode };
                        }
                        catch (Exception e) { result = new { content = new[] { new { type = "text", text = e.Message } }, isError = true }; }
                        break;
                    default:
                        Console.WriteLine(JsonSerializer.Serialize(new { jsonrpc = "2.0", id, error = new { code = -32601, message = "Method not found" } }, Wire.CompactJson)); continue;
                }
                Console.WriteLine(JsonSerializer.Serialize(new { jsonrpc = "2.0", id, result }, Wire.CompactJson));
            }
            catch (Exception e)
            {
                if (id.ValueKind != JsonValueKind.Undefined) Console.WriteLine(JsonSerializer.Serialize(new { jsonrpc = "2.0", id, error = new { code = -32602, message = e.Message } }, Wire.CompactJson));
            }
        }
    }
    sealed record Connection(string Endpoint, string Token);
}
