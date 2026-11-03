using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace DepthLens;
// Explicit verification terminal, not a replacement for Windows Terminal or a full VT emulator.
// It displays the actual command adapter's stdout/stderr from a separate OS process.
internal sealed class CliAcceptanceHost:Window {
    Process? child;
    readonly TextBox output=new(){IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,Background=new SolidColorBrush(Color.FromRgb(20,25,33)),Foreground=new SolidColorBrush(Color.FromRgb(224,234,240)),FontFamily=new FontFamily("Consolas"),FontSize=14,BorderThickness=new Thickness(0),Padding=new Thickness(18)};
    readonly DispatcherTimer timer=new(){Interval=TimeSpan.FromMilliseconds(250)};
    public CliAcceptanceHost(){
        Title=Program.Arg("--title","Depth Lens CLI acceptance host");Width=600;Height=800;Content=output;Background=output.Background;
        Loaded+=async(_,_)=>await Run();Closing+=(_,_)=>{timer.Stop();if(child is {HasExited:false})child.Kill(true);child?.Dispose();};
        timer.Tick+=(_,_)=>{string signal=System.IO.Path.Combine(Program.Arg("--signals"),"capture-cli");if(File.Exists(signal)){Capture(System.IO.Path.Combine(Program.Arg("--signals"),"screenshots","00-actual-cli-output.png"));File.Delete(signal);}};timer.Start();
    }
    async Task Run(){try{
        string node=System.IO.Path.Combine(AppContext.BaseDirectory,"runtime","node.exe"),adapter=System.IO.Path.Combine(AppContext.BaseDirectory,"lens","cli.cjs"),probe=System.IO.Path.Combine(AppContext.BaseDirectory,"lens","companion-probe.cjs");
        var start=new ProcessStartInfo(node){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=AppContext.BaseDirectory,RedirectStandardOutput=true,RedirectStandardError=true};
        foreach(string arg in new[]{adapter,"--connection",Program.Arg("--connection"),"--intent","Validate input before saving","--rationale","Reject invalid values before mutating storage","--files","pipeline.js,validate.js","--",node,probe,"--folder",Program.Arg("--folder"),"--signals",Program.Arg("--signals")})start.ArgumentList.Add(arg);
        output.Text="VERIFICATION CLI · actual process output\n\nnode cli.cjs --intent \"Validate input before saving\"\n  --files pipeline.js,validate.js\n  -- node companion-probe.cjs\n\n";
        child=Process.Start(start)??throw new Exception("CLI could not start.");
        async Task Read(StreamReader stream){while(await stream.ReadLineAsync() is string line){output.AppendText(line+Environment.NewLine);output.ScrollToEnd();}}
        await Task.WhenAll(Read(child.StandardOutput),Read(child.StandardError),child.WaitForExitAsync());output.AppendText("\nProcess exit code: "+child.ExitCode+"\n");
    }catch(Exception e){output.AppendText(e.Message);}}
    void Capture(string path){UpdateLayout();var bitmap=new RenderTargetBitmap((int)ActualWidth,(int)ActualHeight,96,96,PixelFormats.Pbgra32);bitmap.Render(this);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));using var stream=File.Create(path);encoder.Save(stream);}
}
