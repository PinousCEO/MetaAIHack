namespace Depth;

public static class CompilerConfigurationTest
{
    public static void Run(string directory, Action<bool,string> check, Action<Action,string> reject)
    {
        var root=Path.Combine(directory,"project");Directory.CreateDirectory(root);
        var csproj=Path.Combine(root,"Probe.csproj");
        File.WriteAllText(csproj,"<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><DefineConstants>FEATURE</DefineConstants></PropertyGroup><ItemGroup><Compile Remove=\"Excluded.cs\" /></ItemGroup></Project>");
        File.WriteAllText(Path.Combine(root,"Included.cs"),"""
        public class Included {
        #if FEATURE
            public const int Value=25;
            public List<int> Run() => new List<int> { Value };
        #else
            public MissingType WrongBranch;
        #endif
        }
        """);
        File.WriteAllText(Path.Combine(root,"Excluded.cs"),"class Excluded { Unknown Wrong; }");
        var build=Processes.Run(Environment.GetEnvironmentVariable("DOTNET_HOST_PATH")??"dotnet",["build","--nologo","--ignore-failed-sources","-p:NuGetAudit=false","--disable-build-servers"],root,"",60);
        check(build.ExitCode==0,"Real conditional-compilation fixture builds with generated implicit usings and Compile Remove");
        var capture=CompilerConfiguration.Capture(root,["Probe.csproj"]);
        var ws=new Workspace(Path.Combine(directory,"state"));var graph=ws.Import(root);
        check(graph.Entities.Any(e=>e.Name=="Run")&&!graph.Entities.Any(e=>e.Name is "WrongBranch" or "Excluded"),"Captured compiler source list and defines control indexed declarations");
        check(!graph.Diagnostics.Any(d=>d.Contains("error CS"))&&capture.Projects.Single().References.Length>0,"Captured reference assemblies and generated global usings bind without source-only errors");
        var property=ws.Index.Build(graph).Cards.Single(c=>c.Name=="Value");
        check(property.Properties.Single().Value=="25","Property controls use the same captured conditional parse options as the index");
        var p=ws.Index.ProposeProperty(ws,new(property.Id,"30",graph.Revision));
        check(ws.Preview(p.Id).Assessment.ChangedIds.SequenceEqual(new[]{property.Id}),"Review maps an edit in the active conditional branch to its canonical ID");
        ws.Validation.SaveProfile(new("Captured project copy",true,[new("build",Environment.GetEnvironmentVariable("DOTNET_HOST_PATH")??"dotnet",["build","--nologo","--ignore-failed-sources","-p:NuGetAudit=false","--disable-build-servers"],".",60)]));
        var validation=ws.Validation.Run(p.Id,true).GetAwaiter().GetResult();
        check(validation.Commands.Single().Status=="passed"&&ws.Preview(p.Id).Assessment.CanApply,"Configured analysis inputs survive isolated target validation including generated compiler files");
        File.AppendAllText(csproj,"\n<!-- changed -->");
        reject(()=>ws.Refresh(),"Changed project settings cannot silently reuse captured compiler assumptions");
        var multi=Path.Combine(directory,"multi");var lib=Path.Combine(multi,"Lib");var app=Path.Combine(multi,"App");Directory.CreateDirectory(lib);Directory.CreateDirectory(app);
        File.WriteAllText(Path.Combine(lib,"Lib.csproj"),"<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>");
        File.WriteAllText(Path.Combine(app,"App.csproj"),"<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><ProjectReference Include=\"../Lib/Lib.csproj\" /></ItemGroup></Project>");
        File.WriteAllText(Path.Combine(lib,"Shared.cs"),"public class Shared { public static int Value() => 1; }");
        File.WriteAllText(Path.Combine(app,"Caller.cs"),"public class Caller { public int Run() => Shared.Value(); }");
        var multiBuild=Processes.Run(Environment.GetEnvironmentVariable("DOTNET_HOST_PATH")??"dotnet",["build","App/App.csproj","--nologo","--ignore-failed-sources","-p:NuGetAudit=false","--disable-build-servers"],multi,"",60);
        check(multiBuild.ExitCode==0,"Two-project fixture builds before capturing the resolved compiler inputs");
        CompilerConfiguration.Capture(multi,["Lib/Lib.csproj","App/App.csproj"]);
        // The on-disk Lib DLL still declares Value. Both current source projects now use Renamed.
        File.WriteAllText(Path.Combine(lib,"Shared.cs"),"public class Shared { public static int Renamed() => 1; }");
        File.WriteAllText(Path.Combine(app,"Caller.cs"),"public class Caller { public int Run() => Shared.Renamed(); }");
        var linked=new Indexer().Scan(multi);var shared=linked.Entities.Single(e=>e.Name=="Renamed");
        check(!linked.Diagnostics.Any(d=>d.Contains("error CS"))&&linked.Relations.Any(r=>r.To==shared.Id&&r.Kind=="calls"),"Captured project references bind current source across assemblies instead of a stale dependency DLL");
    }
}
