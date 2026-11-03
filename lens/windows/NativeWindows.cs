using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.ComponentModel;

namespace DepthLens;
internal static class NativeWindows {
    internal record WindowInfo(IntPtr Handle,uint Pid,string Title,string Process,long Started);
    [StructLayout(LayoutKind.Sequential)] internal struct Bounds {public int Left,Top,Right,Bottom;public int Width=>Right-Left;public int Height=>Bottom-Top;}
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Entry {public uint Size,Usage,Pid;public IntPtr Heap;public uint Module,Threads,Parent;public int Priority;public uint Flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string Exe;}
    delegate bool EnumCallback(IntPtr window,IntPtr data);
    [DllImport("user32.dll")]static extern bool EnumWindows(EnumCallback callback,IntPtr data);
    [DllImport("user32.dll")]internal static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")]internal static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]internal static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")]internal static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")]internal static extern bool GetWindowRect(IntPtr window,out Bounds bounds);
    [DllImport("user32.dll")]internal static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr window,StringBuilder text,int max);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr window,StringBuilder text,int max);
    [DllImport("user32.dll")]internal static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")]internal static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")]internal static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]static extern bool PostMessage(IntPtr window,int message,IntPtr w,IntPtr l);
    internal static void PostClose(IntPtr window)=>PostMessage(window,0x0010,IntPtr.Zero,IntPtr.Zero);
    [DllImport("user32.dll")]internal static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("kernel32.dll")]static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool Process32FirstW(IntPtr snapshot,ref Entry entry);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool Process32NextW(IntPtr snapshot,ref Entry entry);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")]static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll")]static extern bool FreeConsole();
    [DllImport("kernel32.dll")]static extern IntPtr GetConsoleWindow();
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Startup {public int Size;public string? Reserved,Desktop,Title;public int X,Y,Width,Height,CharsX,CharsY,Fill,Flags;public short Show,ReservedSize;public IntPtr ReservedData,Input,Output,Error;}
    [StructLayout(LayoutKind.Sequential)]struct ProcessInfo {public IntPtr Process,Thread;public int Pid,Tid;}
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcessW(string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out ProcessInfo info);
    internal static Process StartConsole(string batch,string directory){string cmd=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"cmd.exe");var startup=new Startup{Size=Marshal.SizeOf<Startup>(),Flags=1,Show=1};if(!CreateProcessW(cmd,new StringBuilder("\""+cmd+"\" /d /k \"\""+batch+"\"\""),IntPtr.Zero,IntPtr.Zero,false,0x10,IntPtr.Zero,directory,ref startup,out var info))throw new Win32Exception(Marshal.GetLastWin32Error());try{return Process.GetProcessById(info.Pid);}finally{CloseHandle(info.Process);CloseHandle(info.Thread);}}
    internal static void ReleaseInheritedConsole(){if(GetConsoleWindow()!=IntPtr.Zero)FreeConsole();}
    internal static object Diagnostic(int pid){int count=0,visible=0,readable=0;EnumWindows((h,_)=>{count++;if(IsWindowVisible(h))visible++;GetWindowThreadProcessId(h,out uint owner);try{using var p=Process.GetProcessById((int)owner);_=new IntPtr(p.StartTime.Ticks);readable++;}catch{}return true;},IntPtr.Zero);bool attached=AttachConsole((uint)pid);IntPtr console=IntPtr.Zero;bool shown=false;var cls=new StringBuilder(128);try{if(attached){console=GetConsoleWindow();GetClassName(console,cls,128);if(cls.ToString()=="ConsoleWindowClass")ShowWindow(console,5);shown=IsWindowVisible(console);}}finally{if(attached)FreeConsole();}return new{enumerated=count,visible,readable,attached,console=console.ToInt64(),consoleClass=cls.ToString(),consoleVisible=shown};}
    internal static List<WindowInfo> List(){var result=new List<WindowInfo>();EnumWindows((h,_)=>{if(!IsWindowVisible(h))return true;var text=new StringBuilder(512);GetWindowText(h,text,512);if(text.Length==0)return true;GetWindowThreadProcessId(h,out uint pid);if(pid==Environment.ProcessId)return true;try{using var p=Process.GetProcessById((int)pid);result.Add(new(h,pid,text.ToString(),p.ProcessName,p.StartTime.ToUniversalTime().Ticks));}catch{}return true;},IntPtr.Zero);return result;}
    internal static bool Same(WindowInfo window){if(!IsWindow(window.Handle))return false;GetWindowThreadProcessId(window.Handle,out uint pid);if(pid!=window.Pid)return false;try{using var p=Process.GetProcessById((int)pid);return p.StartTime.ToUniversalTime().Ticks==window.Started;}catch{return false;}}
    internal static List<uint> Ancestors(uint pid){var parents=new Dictionary<uint,uint>();IntPtr snapshot=CreateToolhelp32Snapshot(2,0);if(snapshot==new IntPtr(-1))return [];try{var entry=new Entry{Size=(uint)Marshal.SizeOf<Entry>(),Exe=""};if(Process32FirstW(snapshot,ref entry))do{parents[entry.Pid]=entry.Parent;}while(Process32NextW(snapshot,ref entry));}finally{CloseHandle(snapshot);}var result=new List<uint>();for(int i=0;pid>0&&i<24&&!result.Contains(pid);i++){if(pid==Environment.ProcessId)break;result.Add(pid);pid=parents.GetValueOrDefault(pid);}return result;}
    internal static WindowInfo? Resolve(int pid,double startedAt,List<WindowInfo> windows){
        try{using var p=Process.GetProcessById(pid);double actual=new DateTimeOffset(p.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds();if(Math.Abs(actual-startedAt)>5000)return null;}catch{return null;}
        var ancestors=Ancestors((uint)pid);
        // A classic console window belongs to conhost, not to the CLI process.
        // Attach only long enough to read its HWND. No input/output is injected.
        if(GetConsoleWindow()==IntPtr.Zero)foreach(uint candidate in ancestors.Take(8)){if(!AttachConsole(candidate))continue;IntPtr h;try{h=GetConsoleWindow();}finally{FreeConsole();}var found=windows.FirstOrDefault(w=>w.Handle==h);if(found!=null)return found;}
        foreach(uint ancestor in ancestors){var matches=windows.Where(w=>w.Pid==ancestor).ToList();if(matches.Count==1)return matches[0];if(matches.Count>1)return null;}
        return null;
    }
    internal static (Bounds Bounds,bool Overlap,string Side) Place(Bounds target,Bounds area,int desiredWidth,int desiredHeight,int minimumWidth){
        int gap=10,width=Math.Min(desiredWidth,area.Width),height=Math.Min(desiredHeight,area.Height),right=area.Right-target.Right-gap,left=target.Left-area.Left-gap;
        bool useRight=right>=minimumWidth&&(right>=desiredWidth||right>=left),useLeft=!useRight&&left>=minimumWidth;
        int x;if(useRight){width=Math.Min(width,right);x=target.Right+gap;}else if(useLeft){width=Math.Min(width,left);x=target.Left-gap-width;}else{x=area.Right-width;}
        int y=Math.Clamp(target.Top,area.Top,Math.Max(area.Top,area.Bottom-height));
        return(new Bounds{Left=x,Top=y,Right=x+width,Bottom=y+height},!useRight&&!useLeft,useRight?"right":useLeft?"left":"overlay");
    }
}
