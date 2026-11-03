using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace Depth;

public record ValidationCommand(string Kind, string Executable, string[] Arguments, string WorkingDirectory, int TimeoutSeconds);
public record ValidationProfile(string Name, bool RequirePass, ValidationCommand[] Commands);
public record CommandValidation(string Kind, string Executable, string[] Arguments, string Status, int? ExitCode,
    string Output, string Error, bool LogTruncated, long DurationMs);
public record ProjectValidationRun(string Id, string ProjectId, string ProposalId, string Revision, string ProposalHash,
    string ProfileHash, string InputHash, string EnvironmentHash, string Directory, DateTimeOffset At, CommandValidation[] Commands);

// A disposable project COPY, not an OS security sandbox. Only explicitly configured local
// commands are executed, never imported project hooks or model-supplied command strings.
public sealed class ProjectValidation(string storage, Workspace workspace)
{
    readonly SemaphoreSlim running = new(1, 1);
    CancellationTokenSource? activeCancellation;
    string? activeProposal;
    static readonly HashSet<string> Excluded = new(StringComparer.OrdinalIgnoreCase)
        { ".git", ".depth", "Library", "Temp", "Logs", "obj", "bin", "build", "artifacts", "node_modules", ".dart_tool", ".venv", "venv", "__pycache__", ".next", ".gradle", "target" };
    string ProfilePath(Graph graph) => Path.Combine(storage, graph.ProjectId + ".validation.json");
    string LatestPath(Graph graph, string proposalId) => Path.Combine(storage, "validation", graph.ProjectId, proposalId, "latest.json");
    static string Hash<T>(T value) => Wire.Hash(JsonSerializer.Serialize(value, Wire.CompactJson));
    static string EnvironmentHash() => Hash(Environment.GetEnvironmentVariables().Keys.Cast<string>().Order(StringComparer.Ordinal)
        .Select(key => key + "=" + Environment.GetEnvironmentVariable(key)).ToArray());
    public bool Cancel(string proposalId)
    {
        lock (workspace.Sync)
        {
            if (activeProposal != proposalId || activeCancellation == null) return false;
            activeCancellation.Cancel(); return true;
        }
    }
    public ProjectValidationRun? Latest(string proposalId)
    {
        lock (workspace.Sync)
        {
            if (!workspace.Pending.Any(p => p.Id == proposalId)) throw new InvalidOperationException("Unknown pending proposal.");
            var path = LatestPath(workspace.Require(), proposalId);
            return File.Exists(path) ? JsonSerializer.Deserialize<ProjectValidationRun>(File.ReadAllText(path), Wire.Json) : null;
        }
    }
    public ValidationProfile? Profile()
    {
        lock (workspace.Sync) return ReadProfile(workspace.Require());
    }
    ValidationProfile? ReadProfile(Graph graph) => File.Exists(ProfilePath(graph))
        ? JsonSerializer.Deserialize<ValidationProfile>(File.ReadAllText(ProfilePath(graph)), Wire.Json) : null;
    public ValidationProfile SaveProfile(ValidationProfile profile)
    {
        if (string.IsNullOrWhiteSpace(profile.Name) || profile.Commands is null || profile.Commands.Length > 8)
            throw new InvalidOperationException("Use a named validation profile with up to eight commands.");
        foreach (var command in profile.Commands)
            if (command.Kind is not ("build" or "test") || string.IsNullOrWhiteSpace(command.Executable)
                || command.Arguments is null || command.TimeoutSeconds is < 1 or > 900
                || Path.IsPathRooted(command.WorkingDirectory) || command.WorkingDirectory.Split('/', '\\').Any(p => p == ".."))
                throw new InvalidOperationException("Each build/test command needs an executable, argument array, relative working directory and 1–900 second timeout.");
        lock (workspace.Sync)
        {
            var graph = workspace.Require(); Directory.CreateDirectory(storage);
            File.WriteAllText(ProfilePath(graph), JsonSerializer.Serialize(profile, Wire.Json));
            return profile;
        }
    }
    // Copy configuration and assets too: csproj/asmdef/lockfile changes must stale a pass.
    static IEnumerable<string> Files(string root)
    {
        foreach (var path in System.IO.Directory.EnumerateFileSystemEntries(root).Order(StringComparer.Ordinal))
        {
            var attributes = File.GetAttributes(path);
            if (attributes.HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Validation copy does not support linked files/directories: " + Path.GetFileName(path));
            if (attributes.HasFlag(FileAttributes.Directory))
            { if (!Excluded.Contains(Path.GetFileName(path))) foreach (var child in Files(path)) yield return child; }
            else if(!PrivateEnvironmentFile(path))yield return path;
        }
    }
    static bool PrivateEnvironmentFile(string path){var name=Path.GetFileName(path);return name.Equals(".env",StringComparison.OrdinalIgnoreCase)||name.StartsWith(".env.",StringComparison.OrdinalIgnoreCase)&&!name.Equals(".env.example",StringComparison.OrdinalIgnoreCase);}
    static string Manifest(string root, string? destination = null, CancellationToken cancel = default)
    {
        var entries = new List<string>(); long bytes = 0;
        foreach (var file in Files(root))
        {
            cancel.ThrowIfCancellationRequested();
            if (entries.Count >= 20000 || (bytes += new FileInfo(file).Length) > 512L * 1024 * 1024)
                throw new InvalidOperationException("Validation copy is limited to 20,000 files / 512 MiB; select a narrower root.");
            var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
            string input = file;
            if (destination != null)
            {
                input = SourceAccess.Resolve(destination, relative); System.IO.Directory.CreateDirectory(Path.GetDirectoryName(input)!);
                File.Copy(file, input, false);
            }
            entries.Add(relative + ":" + SourceAccess.HashFile(input));
        }
        return Wire.Hash(string.Join('\n', entries));
    }
    internal static string InputFingerprint(string root)=>Manifest(root);
    public ChangeAssessment Assess(Graph graph, Proposal proposal, ChangeAssessment assessment)
    {
        var profile = ReadProfile(graph);
        if (profile == null || profile.Commands.Length == 0) return assessment;
        var latest = LatestPath(graph, proposal.Id);
        var result = File.Exists(latest) ? JsonSerializer.Deserialize<ProjectValidationRun>(File.ReadAllText(latest), Wire.Json) : null;
        bool current = result != null && result.Revision == graph.Revision && result.ProposalHash == Hash(proposal)
            && result.ProfileHash == Hash(profile) && result.EnvironmentHash == EnvironmentHash();
        if (current) { try { current = result!.InputHash == Manifest(graph.Root); } catch (Exception e) when (e is InvalidOperationException or IOException or UnauthorizedAccessException) { current = false; } }
        var checks = assessment.Checks.Select(check => {
            string? kind = check.Name == "Target build" ? "build" : check.Name == "Behavior tests" ? "test" : null;
            if (kind == null || !profile.Commands.Any(c => c.Kind == kind)) return check;
            var commands = current ? result!.Commands.Where(c => c.Kind == kind).ToArray() : [];
            string status = commands.Length == 0 ? "not-run" : commands.All(c => c.Status == "passed") ? "passed"
                : commands.Any(c => c.Status is "failed" or "timed-out" or "canceled") ? "failed" : "not-run";
            return new ValidationCheck(check.Name, status, commands.Length == 0
                ? "Configured commands have no current result for this proposal, profile and complete project input. Run validation."
                : "Configured " + kind + " commands: " + string.Join(", ", commands.Select(c => c.Status + " (exit " + c.ExitCode + ")"))
                    + ". Run " + result!.Id + ". Executed in a project copy; passing configured tests does not prove behavior preservation.");
        }).ToArray();
        bool passed = current && result!.Commands.Length == profile.Commands.Length && result.Commands.All(c => c.Status == "passed");
        return assessment with { Checks = checks, CanApply = assessment.CanApply && (!profile.RequirePass || passed) };
    }
    public async Task<ProjectValidationRun> Run(string proposalId, bool approved, CancellationToken cancel = default)
    {
        if (!approved) throw new InvalidOperationException("Explicit command execution approval is required.");
        if (!await running.WaitAsync(0, cancel)) throw new InvalidOperationException("A project validation is already running.");
        using var canceled = CancellationTokenSource.CreateLinkedTokenSource(cancel);
        lock (workspace.Sync) { activeCancellation = canceled; activeProposal = proposalId; }
        cancel = canceled.Token;
        try
        {
            Graph graph; Proposal proposal; ValidationProfile profile;
            lock (workspace.Sync)
            {
                var review = workspace.Preview(proposalId); graph = workspace.Require(); proposal = review.Proposal;
                if (!ChangeIntelligence.Review(graph, workspace.Index.Build(graph), proposal).Assessment.CanApply)
                    throw new InvalidOperationException("Resolve stale source or syntax failures before validation.");
                profile = ReadProfile(graph) ?? throw new InvalidOperationException("Configure local build/test commands first.");
                if (profile.Commands.Length == 0) throw new InvalidOperationException("No validation commands configured.");
            }
            var runId = Guid.NewGuid().ToString("N");
            var directory = Path.GetFullPath(Path.Combine(storage, "validation", graph.ProjectId, proposal.Id, runId));
            var copy = Path.Combine(directory, "project");
            if (copy.StartsWith(Path.TrimEndingDirectorySeparator(graph.Root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                && !Path.GetRelativePath(graph.Root, copy).Split(Path.DirectorySeparatorChar).Any(p => Excluded.Contains(p)))
                throw new InvalidOperationException("Validation storage must be outside the project or inside an excluded directory.");
            System.IO.Directory.CreateDirectory(copy);
            var inputHash = await Task.Run(() => Manifest(graph.Root, copy, cancel), cancel);
            // Captured compiler inputs may include selected generated files under obj,
            // while the general copy deliberately excludes build caches.
            foreach (var file in graph.Files.Where(f => f.Language is "generated-csharp" or "analysis-config" or "compiler-reference"))
            {
                var destination = SourceAccess.Resolve(copy, file.Path);
                if (File.Exists(destination)) continue;
                Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                File.Copy(SourceAccess.Resolve(graph.Root, file.Path), destination);
            }
            var environmentHash = EnvironmentHash();
            // The copied index is checked before writing the proposal; original paths remain untouched.
            if (new Indexer().Scan(copy).Revision != graph.Revision) throw new InvalidOperationException("Source changed while copying. Refresh and retry.");
            foreach (var edit in proposal.Edits) SourceEdits.Write(copy, edit);
            var results = new List<CommandValidation>(); bool stopped = false;
            foreach (var command in profile.Commands)
            {
                if (stopped || cancel.IsCancellationRequested) results.Add(new(command.Kind, command.Executable, command.Arguments, "not-run", null, "", "Previous command stopped validation.", false, 0));
                else { var result = await Execute(command, copy, cancel); results.Add(result); stopped = result.Status != "passed"; }
            }
            var run = new ProjectValidationRun(runId, graph.ProjectId, proposal.Id, graph.Revision, Hash(proposal), Hash(profile), inputHash, environmentHash, directory, DateTimeOffset.UtcNow, results.ToArray());
            var json = JsonSerializer.Serialize(run, Wire.Json); File.WriteAllText(Path.Combine(directory, "result.json"), json);
            File.WriteAllText(LatestPath(graph, proposal.Id), json);
            return run;
        }
        finally { lock (workspace.Sync) { activeCancellation = null; activeProposal = null; } running.Release(); }
    }
    static async Task<CommandValidation> Execute(ValidationCommand command, string copy, CancellationToken cancel)
    {
        var info = new ProcessStartInfo(command.Executable) { UseShellExecute = false, CreateNoWindow = true,
            WorkingDirectory = command.WorkingDirectory is "" or "." ? copy : SourceAccess.Resolve(copy, command.WorkingDirectory),
            RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = true };
        foreach (var argument in command.Arguments) info.ArgumentList.Add(argument);
        var watch = Stopwatch.StartNew(); using var process = new Process { StartInfo = info };
        bool truncated = false;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel); timeout.CancelAfter(TimeSpan.FromSeconds(command.TimeoutSeconds));
        async Task<string> Drain(StreamReader reader)
        {
            var output = new StringBuilder(); var buffer = new char[2048]; int count;
            try { while ((count = await reader.ReadAsync(buffer.AsMemory(), timeout.Token)) > 0)
            {
                int keep = Math.Min(count, Math.Max(0, 32000 - output.Length)); output.Append(buffer, 0, keep);
                if (keep < count) truncated = true;
            } } catch (OperationCanceledException) { truncated = true; }
            return output.ToString();
        }
        try
        {
            process.Start(); process.StandardInput.Close();
            var output = Drain(process.StandardOutput); var error = Drain(process.StandardError);
            string status;
            try { await process.WaitForExitAsync(timeout.Token); status = process.ExitCode == 0 ? "passed" : "failed"; }
            catch (OperationCanceledException) { if (!process.HasExited) process.Kill(true); await process.WaitForExitAsync(); status = cancel.IsCancellationRequested ? "canceled" : "timed-out"; }
            var stdout = await output; var stderr = await error;
            if (timeout.IsCancellationRequested) status = cancel.IsCancellationRequested ? "canceled" : "timed-out";
            return new(command.Kind, command.Executable, command.Arguments, status, process.ExitCode, stdout, stderr, truncated, watch.ElapsedMilliseconds);
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or IOException or InvalidOperationException)
        { return new(command.Kind, command.Executable, command.Arguments, "failed", null, "", e.Message, truncated, watch.ElapsedMilliseconds); }
    }
}
