using System.Text;

namespace Depth;

public static class SourceOperationsTest
{
    public static void Run(string directory,Action<bool,string> check,Action<Action,string> reject)
    {
        var root=Path.Combine(directory,"project");var state=Path.Combine(directory,"state");Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root,"App.csproj"),"<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>");
        var caller=Path.Combine(root,"App.cs");var oldFile=Path.Combine(root,"Old.cs");var added=Path.Combine(root,"Modules","Shared.cs");
        File.WriteAllText(caller,"public class App { public static int Main() => Old.Value()-1; }");
        File.WriteAllText(oldFile,"public class Old { public static int Value() => 1; }",new UTF8Encoding(true));
        var oldBytes=File.ReadAllBytes(oldFile);var callerBytes=File.ReadAllBytes(caller);
        var ws=new Workspace(state);var graph=ws.Import(root);
        string Hash(string path)=>graph.Files.Single(f=>f.Path==path).Hash;
        var edits=new Edit[]{new("Modules/Shared.cs","","public class Shared { public static int Value() => 1; }","create"),
            new("App.cs",Hash("App.cs"),"public class App { public static int Main() => Shared.Value()-1; }"),new("Old.cs",Hash("Old.cs"),"","delete")};
        var p=ws.Register(new("",graph.Revision,"Move shared implementation to its own source",edits,[]));
        var review=ws.Preview(p.Id);
        check(review.Changes.Any(c=>c.Operation=="create"&&c.Before=="")&&review.Changes.Any(c=>c.Operation=="delete"&&c.After==""),"Review explicitly distinguishes new source and deleted source with full line diffs");
        check(!File.Exists(added)&&File.ReadAllBytes(oldFile).SequenceEqual(oldBytes),"Create/delete proposals do not touch original files before approval");
        reject(()=>ws.Register(new("",graph.Revision,"Collision",[new("App.cs","","class Other {}","create")],[])),"New source cannot overwrite an existing path");
        reject(()=>ws.Register(new("",graph.Revision,"Escape",[new("../Escape.cs","","class Escape {}","create")],[])),"New source cannot escape the imported root");
        reject(()=>ws.Register(new("",graph.Revision,"Ignored",[new("obj/Hidden.cs","","class Hidden {}","create")],[])),"New source cannot hide outside the indexed source inventory");
        reject(()=>ws.Register(new("",graph.Revision,"Alias",[new("Modules/X.cs","","class X {}","create"),new("Modules/./X.cs","","class X {}","create")],[])),"Equivalent new file paths cannot bypass duplicate-operation checks");
        var journal=new WorkspaceJournal(state);var before=new Dictionary<string,byte[]>{{"Modules/Shared.cs",[]},{"App.cs",callerBytes},{"Old.cs",oldBytes}};
        journal.Prepare(graph,p,before);SourceEdits.Write(root,edits[0]);SourceEdits.Write(root,edits[2]); // Crash after create+delete, before updating caller.
        var restarted=new Workspace(state);restarted.Import(root);
        check(restarted.Recovery().Single().CanRestore,"Interrupted creates and deletes are recoverable after process restart");
        File.AppendAllText(added,"// external edit");
        reject(()=>restarted.Restore(p.Id,true),"Recovery will not delete a newly created file that an external editor changed");
        File.WriteAllText(added,edits[0].Content);restarted.Restore(p.Id,true);
        check(!File.Exists(added)&&File.ReadAllBytes(oldFile).SequenceEqual(oldBytes)&&File.ReadAllBytes(caller).SequenceEqual(callerBytes),"Recovery removes only the proposed new file and restores deleted original bytes including BOM");
        var host=Environment.GetEnvironmentVariable("DOTNET_HOST_PATH")??"dotnet";
        restarted.Validation.SaveProfile(new("Create and delete fixture",true,[new("build",host,["build","--nologo","--ignore-failed-sources","-p:NuGetAudit=false","--disable-build-servers"],".",60),new("test",host,["bin/Debug/net8.0/App.dll"],".",10)]));
        var result=restarted.Validation.Run(p.Id,true).GetAwaiter().GetResult();
        check(result.Commands.All(c=>c.Status=="passed")&&!File.Exists(added)&&File.Exists(oldFile),"Copy validation builds and executes a real new shared implementation while originals remain unchanged");
        restarted.Apply(p.Id,true);var after=restarted.Require();var shared=after.Entities.Single(e=>e.Name=="Value");
        check(File.Exists(added)&&!File.Exists(oldFile)&&after.Relations.Any(r=>r.To==shared.Id&&r.Kind=="calls"),"Approved create/delete/update reindexes a single shared implementation and its caller");
        var undo=restarted.ProposeUndo(p.Id);
        check(undo.Edits.Single(e=>e.Path=="Modules/Shared.cs").Operation=="delete"&&undo.Edits.Single(e=>e.Path=="Old.cs").Operation=="create","Undo reverses source file creation and deletion through an ordinary proposal");
        restarted.Validation.Run(undo.Id,true).GetAwaiter().GetResult();restarted.Apply(undo.Id,true);
        check(!File.Exists(added)&&File.ReadAllText(oldFile)==Encoding.UTF8.GetString(oldBytes).TrimStart('\uFEFF')&&File.ReadAllBytes(caller).SequenceEqual(callerBytes),"Validated undo restores the former file layout and source text");
        var empty=Path.Combine(directory,"empty");Directory.CreateDirectory(empty);var first=new Workspace(Path.Combine(directory,"first-state"));var initial=first.Import(empty);
        var firstFile=first.Register(new("",initial.Revision,"First module",[new("First.cs","","public class First {}","create")],[]));
        check(first.Preview(firstFile.Id).Assessment.CanApply&&first.Apply(firstFile.Id,true).Paths.Single()=="First.cs"&&first.Require().Entities.Any(e=>e.Name=="First"),"An empty project can review and apply its first source module without a pre-existing selection");
    }
}
