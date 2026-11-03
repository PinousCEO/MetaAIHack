namespace Depth;

public static class ProjectValidationTest
{
    public static void Run(string directory, Action<bool, string> check, Action<Action, string> reject)
    {
        var root = Path.Combine(directory, "project"); Directory.CreateDirectory(root);
        const string project = "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>";
        const string source = "public class Probe { public const int Value=20; public static int Main() => Value==25 ? 0 : 3; }";
        var projectPath = Path.Combine(root, "Probe.csproj"); var sourcePath = Path.Combine(root, "Probe.cs");
        File.WriteAllText(projectPath, project); File.WriteAllText(sourcePath, source);
        File.WriteAllText(Path.Combine(root,".env"),"MODEL_API_KEY=fixture-secret\n");
        var workspace = new Workspace(Path.Combine(directory, "state")); var graph = workspace.Import(root);
        var host = Environment.GetEnvironmentVariable("DOTNET_HOST_PATH") ?? "dotnet";
        var profile = new ValidationProfile("Isolated .NET probe", true, [
            new("build", host, ["build", "Probe.csproj", "--nologo", "--ignore-failed-sources", "-p:NuGetAudit=false", "-p:UseSharedCompilation=false", "--disable-build-servers"], ".", 60),
            new("test", host, ["bin/Debug/net8.0/Probe.dll"], ".", 10)
        ]);
        workspace.Validation.SaveProfile(profile);
        var proposal = workspace.Register(new("", graph.Revision, "Use 25 in copied build", [new("Probe.cs", graph.Files.Single().Hash, source.Replace("Value=20", "Value=25"))], []));
        check(!workspace.Preview(proposal.Id).Assessment.CanApply, "Required target validation blocks apply until configured commands have current passing results");
        reject(() => workspace.Apply(proposal.Id, true), "Apply independently enforces required validation before the first command run");
        reject(() => workspace.Validation.Run(proposal.Id, false).GetAwaiter().GetResult(), "Imported projects cannot trigger validation commands without explicit execution approval");
        var result = workspace.Validation.Run(proposal.Id, true).GetAwaiter().GetResult();
        check(result.Commands.All(c => c.Status == "passed") && File.ReadAllText(sourcePath) == source && !Directory.Exists(Path.Combine(root, "bin")), "Real dotnet build and executable assertions run against the proposed copy while originals remain untouched");
        check(!Directory.GetFiles(result.Directory,".env",SearchOption.AllDirectories).Any(),"Private .env credentials are excluded from validation copies");
        check(File.Exists(Path.Combine(result.Directory, "result.json")) && result.Commands[0].Output.Length > 0 && workspace.Preview(proposal.Id).Assessment.CanApply, "Target results retain logs and bind passing checks to proposal, profile and project input");
        File.AppendAllText(projectPath, "\n<!-- external configuration edit -->");
        check(!workspace.Preview(proposal.Id).Assessment.CanApply && workspace.Require().Revision == graph.Revision, "Build configuration edits invalidate a pass even when indexed source revision is unchanged");
        File.WriteAllText(projectPath, project);
        workspace.Validation.SaveProfile(profile with { Name = "Changed profile" });
        check(!workspace.Preview(proposal.Id).Assessment.CanApply, "Changing the validation profile invalidates the previous command result");
        workspace.Validation.SaveProfile(profile);
        var invalid = workspace.Register(new("", graph.Revision, "Type error beyond syntax parsing", [new("Probe.cs", graph.Files.Single().Hash, source.Replace("Value==25", "Missing==25"))], []));
        var failed = workspace.Validation.Run(invalid.Id, true).GetAwaiter().GetResult();
        check(failed.Commands[0].Status == "failed" && failed.Commands[0].ExitCode != 0 && failed.Commands[1].Status == "not-run", "Target compilation catches unresolved symbols and records downstream tests as not run");
        reject(() => workspace.Apply(invalid.Id, true), "Required failed target build blocks source apply independently of the UI");
        var slow = workspace.Register(new("", graph.Revision, "Slow copied executable", [new("Probe.cs", graph.Files.Single().Hash, "public class Probe { public static void Main() { System.Threading.Thread.Sleep(5000); } }")], []));
        workspace.Validation.SaveProfile(profile with { Commands = [profile.Commands[0], profile.Commands[1] with { TimeoutSeconds = 1 }] });
        var timed = workspace.Validation.Run(slow.Id, true).GetAwaiter().GetResult();
        check(timed.Commands[1].Status == "timed-out" && !workspace.Preview(slow.Id).Assessment.CanApply, "Command timeout stops the copied process and cannot become a passing test");
        workspace.Validation.SaveProfile(profile with { Commands = [profile.Commands[0], profile.Commands[1] with { TimeoutSeconds = 30 }] });
        var cancelRun = workspace.Validation.Run(slow.Id, true);
        Task.Delay(3000).GetAwaiter().GetResult();
        reject(() => workspace.Validation.Run(slow.Id, true).GetAwaiter().GetResult(), "A second validation cannot run concurrently against the same workspace");
        bool requested = workspace.Validation.Cancel(slow.Id);
        var canceled = cancelRun.GetAwaiter().GetResult();
        check(requested && canceled.Commands.Any(c => c.Status == "canceled") && !workspace.Preview(slow.Id).Assessment.CanApply && !workspace.Validation.Cancel(slow.Id), "Canceled execution retains a nonpassing command result and releases the validation runner");
    }
}
