using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace DepthLens;
public sealed partial class LensWindow {
    async Task CompanionScenario(){
        var checks=new List<string>();Process? terminal=null;NativeWindows.WindowInfo? target=null;
        string folder=System.IO.Path.Combine(statePath,"owned-project"),screens=System.IO.Path.Combine(statePath,"screenshots");Directory.CreateDirectory(folder);Directory.CreateDirectory(screens);
        async Task Until(Func<bool> condition,string error,int milliseconds=20000){var end=DateTime.UtcNow.AddMilliseconds(milliseconds);while(DateTime.UtcNow<end){await Task.Delay(150);await Poll();if(condition())return;}throw new Exception(error);}
        void Check(bool pass,string text){if(!pass)throw new Exception(text);checks.Add(text);}
        try{
            await File.WriteAllTextAsync(System.IO.Path.Combine(folder,"pipeline.js"),"import { save } from './store.js';\nexport function submit(value) { return save(value); }\n");
            await File.WriteAllTextAsync(System.IO.Path.Combine(folder,"store.js"),"const values = [];\nexport function save(value) { values.push(value); return values.length; }\n");
            await File.WriteAllTextAsync(System.IO.Path.Combine(folder,"unrelated.js"),"export const unrelated = 'must not appear in this action';\n");
            await Post("/settings",new{autoExplain=false});await Open(folder);
            string node=System.IO.Path.Combine(AppContext.BaseDirectory,"runtime","node.exe"),adapter=System.IO.Path.Combine(AppContext.BaseDirectory,"lens","cli.cjs"),probe=System.IO.Path.Combine(AppContext.BaseDirectory,"lens","companion-probe.cjs");
            string title="Depth Lens owned CLI "+Guid.NewGuid().ToString("N"),command=System.IO.Path.Combine(statePath,"run-owned-cli.cmd");
            // All command paths belong to this acceptance fixture; no project command text is interpolated.
            foreach(string text in new[]{node,adapter,probe,connectionPath,folder,statePath})if(text.IndexOfAny(['"','%','\r','\n'])>=0)throw new Exception("Acceptance path cannot be quoted safely.");
            await File.WriteAllTextAsync(command,$"@echo off\r\ntitle {title}\r\n\"{node}\" \"{adapter}\" --connection \"{connectionPath}\" --intent \"Validate input before saving\" --rationale \"Reject invalid values before mutating storage\" --files pipeline.js,validate.js -- \"{node}\" \"{probe}\" --folder \"{folder}\" --signals \"{statePath}\"\r\n");
            if(Program.Args.Contains("--external-console")){terminal=NativeWindows.StartConsole(command,folder);await Task.Delay(1000);File.WriteAllText(System.IO.Path.Combine(statePath,"window-diagnostic.json"),JsonSerializer.Serialize(NativeWindows.Diagnostic(terminal.Id)));}
            else{var host=new ProcessStartInfo(Environment.ProcessPath!){UseShellExecute=false,CreateNoWindow=true};foreach(string arg in new[]{"--acceptance-cli-host","--folder",folder,"--signals",statePath,"--connection",connectionPath,"--title",title})host.ArgumentList.Add(arg);terminal=Process.Start(host)??throw new Exception("Verification CLI host did not start.");}
            await Until(()=>{target=NativeWindows.List().FirstOrDefault(w=>w.Title.Contains(title));return target!=null;},"No visible native CLI window was available.");
            var area=System.Windows.Forms.Screen.FromHandle(target!.Handle).WorkingArea;
            NativeWindows.ShowWindow(target.Handle,9);NativeWindows.SetWindowPos(target.Handle,IntPtr.Zero,area.Left+20,area.Top+25,Math.Min(600,area.Width-580),Math.Min(800,area.Height-50),0x0010|0x0004);
            await Until(()=>cliWindow?.Handle==target.Handle,"CLI transport was not automatically linked to its actual terminal window.");
            Check(companion,"Actual CLI process automatically links the exact native window");
            await Until(()=>workView!=null&&Str(workView,"phase")=="started","Reported CLI action did not appear automatically.");
            Check(Arr(workView,"changes").Count==0,"Reported targets are not falsely presented as source changes");
            await File.WriteAllTextAsync(System.IO.Path.Combine(statePath,"edit"),"go");
            await Until(()=>Arr(workView,"changes").Any(c=>Str(c,"path")=="validate.js"),"First save missing from live action graph.");
            await File.WriteAllTextAsync(System.IO.Path.Combine(statePath,"second-save"),"go");
            await Until(()=>Arr(workView,"changes").Any(c=>Str(c,"path")=="pipeline.js"),"Second save missing from live action graph.");
            Check(Arr(workView,"changes").Any(c=>Str(c,"path")=="validate.js"),"Multiple saves in one CLI action retain all changed modules");
            Check(Arr(snapshot,"nodes").Any(n=>Str(n,"path")=="store.js")&&!Arr(snapshot,"nodes").Any(n=>Str(n,"path")=="unrelated.js"),"Current action shows direct dependencies and excludes unrelated modules");
            Check(connections.Count>0,"Actual changed modules display their source-derived connections");
            Capture(System.IO.Path.Combine(screens,"01-cli-working.png"));
            NativeWindows.GetWindowRect(target.Handle,out var cliBounds);NativeWindows.GetWindowRect(handle,out var panelBounds);
            var initialCliBounds=cliBounds;
            Check(panelBounds.Left>=cliBounds.Right||panelBounds.Right<=cliBounds.Left,"Panel is physically beside the actual CLI window");
            IntPtr foreground=NativeWindows.GetForegroundWindow();NativeWindows.SetWindowPos(target.Handle,IntPtr.Zero,area.Left+45,area.Top+45,520,Math.Min(760,area.Height-65),0x0010|0x0004);
            await Task.Delay(600);NativeWindows.GetWindowRect(handle,out var moved);NativeWindows.GetWindowRect(target.Handle,out cliBounds);
            Check(moved.Left>=cliBounds.Right&&moved.Left<=cliBounds.Right+12,"Panel follows a real CLI move and resize");
            Check(NativeWindows.GetForegroundWindow()==foreground,"Following a CLI move does not steal foreground focus");
            Capture(System.IO.Path.Combine(screens,"02-cli-following.png"));
            NativeWindows.ShowWindow(target.Handle,6);await Task.Delay(400);Check(hiddenForCli&&!IsVisible,"Panel hides when its CLI is minimized");
            NativeWindows.ShowWindow(target.Handle,9);await Task.Delay(400);Check(!hiddenForCli&&IsVisible,"Panel returns when its CLI is restored");
            await File.WriteAllTextAsync(System.IO.Path.Combine(statePath,"complete"),"go");
            await Until(()=>Str(workView,"phase")=="completed","CLI completion did not update the visible action.");
            Check(Arr(workView,"changes").Count>=2,"Completed CLI action retains its observed module graph");
            Capture(System.IO.Path.Combine(screens,"03-cli-completed.png"));
            await File.WriteAllTextAsync(System.IO.Path.Combine(statePath,"capture-cli"),"capture");await Task.Delay(400);
            string actionId=Str(workView,"actionId");
            if(Program.Args.Contains("--live-meta")){
                selected="";await Explain();await Until(()=>Arr(state,"explanations").Any(e=>Str(e,"actionId")==actionId),"Action explanation was not queued.");var job=Arr(state,"explanations").Last(e=>Str(e,"actionId")==actionId);string jobId=Str(job,"id");
                await Until(()=>Arr(state,"explanations").Any(e=>Str(e,"id")==jobId&&Str(e,"status")!="pending"),"Meta explanation timed out.",210000);
                var result=Arr(state,"explanations").First(e=>Str(e,"id")==jobId);Check(Str(result,"freshness")=="current","Real Meta explanation remains bound to this CLI action and revision");await RenderAction();
                Capture(System.IO.Path.Combine(screens,"04-cli-meta-explanation.png"));
            }
            SetClickThrough(true);Check((GetWindowLong(handle,-20)&0x20)!=0,"Companion click-through is an actual native window style");PostMessage(handle,0x0312,new IntPtr(74),IntPtr.Zero);await Task.Delay(100);Check(!clickThrough,"Companion interaction recovers through its registered hotkey message");
            // Work-area fallback is an explicit overlap, never a hidden CLI resize.
            NativeWindows.GetWindowRect(target.Handle,out var preserved);NativeWindows.SetWindowPos(target.Handle,IntPtr.Zero,area.Left,area.Top,area.Width,area.Height,0x0010|0x0004);await Task.Delay(500);
            Check(placement.StartsWith("No side space"),"Full-width CLI reports overlay fallback explicitly");NativeWindows.GetWindowRect(target.Handle,out var full);Check(full.Width==area.Width,"Companion never silently resizes the CLI");
            NativeWindows.SetWindowPos(target.Handle,IntPtr.Zero,preserved.Left,preserved.Top,preserved.Width,preserved.Height,0x0010|0x0004);await Task.Delay(500);
            var finalCli=cliWindow;NativeWindows.PostClose(target.Handle);await Until(()=>cliWindow==null,"Closed CLI was not released.");Check(IsVisible,"Closing the CLI leaves a recoverable panel");
            var checkedFiles=new[]{"Depth Lens.dll","lens/core.cjs","lens/server.cjs","lens/cli.cjs","lens/sessions.cjs","lens/work-view.cjs"}.ToDictionary(file=>file,file=>Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(System.IO.Path.Combine(AppContext.BaseDirectory,file)))).ToLowerInvariant());
            File.WriteAllText(System.IO.Path.Combine(statePath,"companion-result.json"),JsonSerializer.Serialize(new{ok=true,checks,pid=Environment.ProcessId,terminalPid=terminal.Id,windowPid=finalCli?.Pid,windowHandle=finalCli?.Handle.ToInt64(),initialCliBounds,panelBounds,movedCliBounds=cliBounds,movedPanelBounds=moved,actionId,checkedFiles,liveMeta=Program.Args.Contains("--live-meta"),terminalHost=Program.Args.Contains("--external-console")?"cmd console":"Separate native verification host showing actual Node CLI stdout/stderr",scope="Actual Node command adapter, native HWND association/geometry/follow/focus/minimize/restore/close, watched source changes and WPF renders. Not OS-composited desktop pixels or a third-party AI CLI configuration. External cmd console attempts remain separately recorded."},new JsonSerializerOptions{WriteIndented=true,IncludeFields=true}));
        }catch(Exception e){File.WriteAllText(System.IO.Path.Combine(statePath,"companion-result.json"),JsonSerializer.Serialize(new{ok=false,error=e.ToString(),checks},new JsonSerializerOptions{WriteIndented=true}));throw;}
        finally{if(target!=null&&NativeWindows.Same(target))NativeWindows.PostClose(target.Handle);if(terminal is {HasExited:false})terminal.Kill(true);terminal?.Dispose();}
        if(Program.Args.Contains("--exit-after-capture"))Close();
    }
}
