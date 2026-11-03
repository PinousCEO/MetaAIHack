// Opt-in .NET 8+ WinForms runtime adapter. Actual client pixels and control
// objects are used; handler source locations come from the app's portable PDB.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Depth.RuntimePreview;
internal static class WinFormsBridge
{
    record Config(string protocol, string url, string token, string session, string root);
    record Source(string path, int line);
    static Config? config;
    static readonly HttpClient client = new() { Timeout = TimeSpan.FromSeconds(5) };
    record CachedSource(Source? value, string? file, DateTime modified);
    static readonly Dictionary<MethodBase, CachedSource> sourceCache = new();
    static System.Windows.Forms.Timer? timer;
    static bool busy;
    static int sequence;
    static object? selection;
    static Control? pressed;
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [ModuleInitializer] internal static void Initialize()
    {
        string? file = Environment.GetEnvironmentVariable("DEPTH_RUNTIME_CONFIG");
        if (string.IsNullOrEmpty(file) || !File.Exists(file)) return;
        try
        {
            var cfg = JsonSerializer.Deserialize<Config>(File.ReadAllText(file));
            if (cfg == null || cfg.protocol != "depth-runtime/1" || cfg.token.Length != 64 || !Uri.TryCreate(cfg.url, UriKind.Absolute, out var uri) || uri.Scheme != "http" || uri.Host != "127.0.0.1") return;
            config = cfg; client.DefaultRequestHeaders.Add("X-Depth-Runtime", cfg.token);
            Application.Idle += Start;
        }
        catch { /* No connection must never prevent the target from starting. */ }
    }
    static void Start(object? sender, EventArgs args)
    {
        if (Application.OpenForms.Count == 0) return;
        Application.Idle -= Start;
        timer = new System.Windows.Forms.Timer { Interval = 200 };
        timer.Tick += async (_, _) => await Frame(); timer.Start();
        Application.ApplicationExit += (_, _) => { timer?.Stop(); client.Dispose(); };
    }
    static Source? SourceOf(MethodBase method)
    {
        if (sourceCache.TryGetValue(method, out var cached) && (cached.file == null || File.GetLastWriteTimeUtc(cached.file) == cached.modified)) return cached.value;
        Source? source = null; string? sourceFile = null; DateTime modified = default;
        try
        {
            string pdb = Path.ChangeExtension(method.Module.FullyQualifiedName, ".pdb");
            if (File.Exists(pdb))
            {
                using var stream = File.OpenRead(pdb);
                using var provider = MetadataReaderProvider.FromPortablePdbStream(stream);
                var reader = provider.GetMetadataReader();
                var info = reader.GetMethodDebugInformation(MetadataTokens.MethodDebugInformationHandle(method.MetadataToken & 0x00ffffff));
                foreach (var point in info.GetSequencePoints())
                {
                    if (point.IsHidden) continue;
                    var doc = reader.GetDocument(point.Document.IsNil ? info.Document : point.Document);
                    string file = reader.GetString(doc.Name), relative = Path.GetRelativePath(config!.root, file).Replace('\\', '/');
                    if (!relative.StartsWith("../", StringComparison.Ordinal) && !Path.IsPathRooted(relative) && File.Exists(file))
                    {
                        sourceFile = file; modified = File.GetLastWriteTimeUtc(file);
                        var algorithm = reader.GetGuid(doc.HashAlgorithm);
                        var bytes = File.ReadAllBytes(file);
                        byte[]? actual = algorithm == new Guid("8829d00f-11b8-4213-878b-770e8597ac16") ? SHA256.HashData(bytes) : algorithm == new Guid("ff1816ec-aa5e-4d10-87f7-6f4963833460") ? SHA1.HashData(bytes) : null;
                        if (actual != null && actual.SequenceEqual(reader.GetBlobBytes(doc.Hash))) source = new Source(relative, point.StartLine);
                        break;
                    }
                }
            }
        }
        catch { /* Native/AOT/full-framework symbols need another source adapter. */ }
        sourceCache[method] = new CachedSource(source, sourceFile, modified); return source;
    }
    static IEnumerable<Delegate> Handlers(Control control)
    {
        // WinForms exposes no public enumeration API for registered delegates.
        // Missing/changed reflection fields yield no claimed relationship.
        object? events = typeof(System.ComponentModel.Component).GetProperty("Events", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(control);
        object? entry = events?.GetType().GetField("_head", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(events);
        for (int n = 0; entry != null && n < 256; n++)
        {
            if (entry.GetType().GetField("_handler", BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public)?.GetValue(entry) is Delegate value)
                foreach (var handler in value.GetInvocationList()) yield return handler;
            entry = entry.GetType().GetField("_next", BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public)?.GetValue(entry);
        }
    }
    static Source[] Sources(Control control)
    {
        var result = new List<Source>();
        for (Control? item = control; item != null; item = item.Parent)
        {
            foreach (var handler in Handlers(item)) { var source = SourceOf(handler.Method); if (source != null) result.Add(source); }
            foreach (var constructor in item.GetType().GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)) { var source = SourceOf(constructor); if (source != null) result.Add(source); }
            foreach (Binding binding in item.DataBindings)
            {
                var property = binding.DataSource?.GetType().GetProperty(binding.BindingMemberInfo.BindingField);
                foreach (var accessor in property?.GetAccessors(true) ?? Array.Empty<MethodInfo>()) { var source = SourceOf(accessor); if (source != null) result.Add(source); }
            }
        }
        return result.Distinct().Take(100).ToArray();
    }
    static Control At(Control root, Point position)
    {
        var child = root.GetChildAtPoint(position, GetChildAtPointSkip.Invisible | GetChildAtPointSkip.Disabled);
        return child == null ? root : At(child, child.PointToClient(root.PointToScreen(position)));
    }
    static async Task Frame()
    {
        if (busy || config == null || Application.OpenForms.Count == 0) return;
        var form = Form.ActiveForm ?? Application.OpenForms[0];
        if (form == null || form.IsDisposed || !form.Visible || form.ClientSize.Width <= 0 || form.ClientSize.Height <= 0) return;
        busy = true;
        try
        {
            using var bitmap = new Bitmap(form.ClientSize.Width, form.ClientSize.Height);
            bool captured;
            using (var graphics = Graphics.FromImage(bitmap)) { IntPtr hdc = graphics.GetHdc(); try { captured = PrintWindow(form.Handle, hdc, 1); } finally { graphics.ReleaseHdc(hdc); } }
            string captureMode = "window-client";
            if (!captured || (bitmap.GetPixel(0, 0).ToArgb() == Color.Black.ToArgb() && bitmap.GetPixel(bitmap.Width - 1, bitmap.Height - 1).ToArgb() == Color.Black.ToArgb() && form.BackColor.ToArgb() != Color.Black.ToArgb()) || bitmap.GetPixel(0, 0).A == 0)
            {
                // The control renders itself when a window-station compositor
                // cannot supply its client bitmap. This is the actual live
                // control tree, never a reconstructed HTML/projection screen.
                using var entire = new Bitmap(form.Width, form.Height);
                form.DrawToBitmap(entire, new Rectangle(Point.Empty, form.Size));
                var offset = form.PointToScreen(Point.Empty) - new Size(form.Location);
                using var graphics = Graphics.FromImage(bitmap);
                graphics.DrawImage(entire, new Rectangle(Point.Empty, bitmap.Size), new Rectangle(offset, bitmap.Size), GraphicsUnit.Pixel);
                captureMode = "live-control-render";
            }
            using var png = new MemoryStream(); bitmap.Save(png, ImageFormat.Png);
            var regions = new List<object>();
            void Visit(Control control, int depth)
            {
                if (!control.Visible || regions.Count >= 10000) return;
                var rect = Rectangle.Intersect(new Rectangle(form.PointToClient(control.PointToScreen(Point.Empty)), control.ClientSize), form.ClientRectangle);
                if (rect.Width > 0 && rect.Height > 0) regions.Add(new { id = control.Handle.ToInt64().ToString(), name = string.IsNullOrEmpty(control.Name) ? control.GetType().Name : control.Name, x = (double)rect.X / bitmap.Width, y = (double)rect.Y / bitmap.Height, width = (double)rect.Width / bitmap.Width, height = (double)rect.Height / bitmap.Height, depth, sources = Sources(control) });
                foreach (Control child in control.Controls) Visit(child, depth + 1);
            }
            Visit(form!, 0);
            var frame = new { protocol = "depth-runtime/1", engine = "native", session = config.session, sequence = ++sequence, width = bitmap.Width, height = bitmap.Height, captureMode, png = Convert.ToBase64String(png.ToArray()), regions, selection, capabilities = new { pointer = true, scroll = false, text = true, inspect = true } };
            selection = null;
            using var body = new StringContent(JsonSerializer.Serialize(frame), Encoding.UTF8, "application/json");
            using var response = await client.PostAsync(config.url + "/frame", body);
            if (!response.IsSuccessStatusCode) return;
            using var reply = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            if (reply.RootElement.GetProperty("session").GetString() != config.session) return;
            foreach (var command in reply.RootElement.GetProperty("commands").EnumerateArray()) Input(form, command);
        }
        catch (Exception ex) { System.Diagnostics.Debug.WriteLine("Depth runtime: " + ex.GetType().Name); }
        finally { busy = false; }
    }
    static void Input(Form form, JsonElement command)
    {
        string? type = command.GetProperty("type").GetString();
        if (type == "text") { Control? active = form.ActiveControl; while (active is ContainerControl container && container.ActiveControl != null) active = container.ActiveControl; if (active is TextBoxBase text) text.SelectedText = command.GetProperty("text").GetString() ?? ""; return; }
        var point = new Point((int)(command.GetProperty("x").GetDouble() * form.ClientSize.Width), (int)(command.GetProperty("y").GetDouble() * form.ClientSize.Height));
        var target = At(form, point);
        if (type == "pick") { selection = new { requestId = command.GetProperty("requestId").GetString(), name = string.IsNullOrEmpty(target.Name) ? target.GetType().Name : target.Name, sources = Sources(target) }; return; }
        var local = target.PointToClient(form.PointToScreen(point));
        if (type == "pointerDown") { target.Focus(); pressed = target; }
        if (type == "pointerUp" && pressed == target && target is ButtonBase) { pressed = null; if (target is IButtonControl button) button.PerformClick(); else target.AccessibilityObject.DoDefaultAction(); return; }
        uint message = type == "pointerDown" ? 0x0201u : type == "pointerUp" ? 0x0202u : 0x0200u;
        SendMessage(target.Handle, message, type == "pointerDown" ? new IntPtr(1) : IntPtr.Zero, new IntPtr((local.Y << 16) | (local.X & 0xffff)));
    }
}
