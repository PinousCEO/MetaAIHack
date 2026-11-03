using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using System.Windows.Media;

namespace DepthLens;
public sealed partial class LensWindow {
    Grid? mapSurface,detailsSurface;
    GridSplitter? bodySplitter;
    readonly DispatcherTimer followTimer=new(){Interval=TimeSpan.FromMilliseconds(200)};
    NativeWindows.WindowInfo? cliWindow;
    readonly Dictionary<string,NativeWindows.WindowInfo> sessionWindows=[];
    bool companion,follow=true,liveWork=true,manualDetach,hiddenForCli,previousTopmost;
    string workKey="",sessionKey="",workSelection="",chosenConnectionId="",placement="",linkState="CLI not linked · choose Link CLI";
    JsonNode? workView;
    long lastWorkSequence=-1;
    bool WorkEmpty=>workView?["empty"]?.GetValue<bool>()??false;
    void InitCompanion(){followTimer.Tick+=(_,_)=>FollowWindow();followTimer.Start();Closing+=(_,_)=>followTimer.Stop();}
    WrapPanel BuildToolbar(){
        var tools=new WrapPanel{Margin=new Thickness(0,0,0,6)};
        tools.Children.Add(Btn("Link CLI",ChooseCli));
        tools.Children.Add(Btn("Live work",async()=>{liveWork=true;workKey="";lastWorkSequence=-1;historyRevision="";scope="";search.Clear();await UpdateWork();}));
        tools.Children.Add(Btn("Overview",async()=>{liveWork=false;activeAction="";scope="";selected="";historyRevision="";snapshot=state?["snapshot"] as JsonObject;source.Clear();quick.Items.Clear();RenderGraph();FitMap();await RenderDetails();}));
        var more=Btn("Tools ▾",()=>{});var menu=new ContextMenu();
        void Item(string text,Func<Task> action){var item=new MenuItem{Header=text};item.Click+=async(_,_)=>{try{await action();}catch(Exception e){ShowStatus(e.Message);}};menu.Items.Add(item);}
        Item("Open project folder…",ChooseFolder);Item("Copy MCP configuration",()=>{ShowMcp();return Task.CompletedTask;});
        Item("Open selected source",OpenSource);Item("Export project memory",async()=>{await Post("/export",new{});ShowStatus("Project memory exported.");});
        Item("Follow / pause CLI position",()=>{follow=!follow;linkState=follow?"Following linked CLI":"Position follow paused";return Task.CompletedTask;});
        Item("Detach from CLI",()=>{DetachCli();return Task.CompletedTask;});
        Item("Focus selected module",()=>{OpenModuleScope(selected);return Task.CompletedTask;});
        Item("Fit graph",()=>{FitMap();return Task.CompletedTask;});
        Item("Pin above other windows",()=>{Topmost=!Topmost;return Task.CompletedTask;});
        Item("Light / dark",()=>{SetTheme(!light);return Task.CompletedTask;});
        more.ContextMenu=menu;more.Click+=(_,_)=>{menu.PlacementTarget=more;menu.IsOpen=true;};tools.Children.Add(more);return tools;
    }
    void OpenModuleScope(string id){if(id=="")return;liveWork=false;workKey="";activeAction="";snapshot=state?["snapshot"] as JsonObject;scope=id;selected=id;RenderGraph();FitMap();}
    Task ChooseCli(){
        var dialog=new Window{Owner=this,Title="Link the CLI window",Width=610,Height=430,WindowStartupLocation=WindowStartupLocation.CenterOwner};
        var panel=new DockPanel{Margin=new Thickness(18)};
        var info=Text("Select the terminal or editor window containing your CLI. Lens follows that window without resizing it. MCP reports identify its work; filesystem-only changes keep actor unknown.",14);info.Margin=new Thickness(0,0,0,12);DockPanel.SetDock(info,Dock.Top);panel.Children.Add(info);
        var sessionChoice=new ComboBox{Margin=new Thickness(0,0,0,12),MinHeight=32};sessionChoice.Items.Add(new ComboBoxItem{Content="Auto-match CLI connection (otherwise source observations)",Tag=""});foreach(var session in Arr(state,"sessions").Where(s=>Str(s,"phase")=="connected"))sessionChoice.Items.Add(new ComboBoxItem{Content=Str(session,"name")+" · PID "+Str(session,"pid")+" · "+Str(session,"id")[..8],Tag=Str(session,"id")});sessionChoice.SelectedIndex=sessionChoice.Items.Count==2?1:0;sessionChoice.ToolTip="Select the MCP or command adapter connection running in this window.";DockPanel.SetDock(sessionChoice,Dock.Top);panel.Children.Add(sessionChoice);
        var list=new ListBox();var windows=NativeWindows.List().Where(w=>w.Process!="explorer").OrderBy(w=>w.Process).ToList();foreach(var window in windows)list.Items.Add(new ListBoxItem{Content=Text(window.Process+" · PID "+window.Pid+"\n"+window.Title,13),Tag=window,Padding=new Thickness(6)});
        var buttons=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Right};
        buttons.Children.Add(Btn("Link selected CLI",()=>{if(list.SelectedItem is ListBoxItem item&&item.Tag is NativeWindows.WindowInfo window){AttachCli(window,"Selected CLI");chosenConnectionId=(sessionChoice.SelectedItem as ComboBoxItem)?.Tag?.ToString()??"";if(chosenConnectionId!="")sessionWindows[chosenConnectionId]=window;dialog.Close();}}));buttons.Children.Add(Btn("Cancel",dialog.Close));DockPanel.SetDock(buttons,Dock.Bottom);panel.Children.Add(buttons);panel.Children.Add(list);dialog.Content=panel;dialog.ShowDialog();return Task.CompletedTask;
    }
    void AttachCli(NativeWindows.WindowInfo window,string reason){
        if(!NativeWindows.Same(window))throw new InvalidOperationException("The selected window has closed. Choose the current CLI window.");
        cliWindow=window;chosenConnectionId="";manualDetach=false;follow=true;liveWork=true;lastWorkSequence=-1;workKey="";workSelection="";SetCompanionLayout(true);linkState=reason+" · "+window.Process+" · PID "+window.Pid;FollowWindow();
    }
    void DetachCli(){cliWindow=null;manualDetach=true;hiddenForCli=false;Show();SetCompanionLayout(false);linkState="CLI detached · Link CLI to reconnect";lastWorkSequence=-1;}
    void SetCompanionLayout(bool enabled){
        if(companion==enabled)return;if(enabled){previousTopmost=Topmost;Topmost=true;}else Topmost=previousTopmost;companion=enabled;body.RowDefinitions.Clear();body.ColumnDefinitions.Clear();
        if(enabled){MinWidth=420;MinHeight=480;Width=570;Height=850;body.ColumnDefinitions.Add(new(){Width=new GridLength(1,GridUnitType.Star)});body.RowDefinitions.Add(new(){Height=new GridLength(3,GridUnitType.Star),MinHeight=140});body.RowDefinitions.Add(new(){Height=new GridLength(5)});body.RowDefinitions.Add(new(){Height=new GridLength(2,GridUnitType.Star),MinHeight=140});Grid.SetRow(mapSurface!,0);Grid.SetColumn(mapSurface!,0);Grid.SetRow(bodySplitter!,1);Grid.SetColumn(bodySplitter!,0);Grid.SetRow(detailsSurface!,2);Grid.SetColumn(detailsSurface!,0);bodySplitter!.Width=double.NaN;bodySplitter.Height=4;bodySplitter.ResizeDirection=GridResizeDirection.Rows;detailsSurface!.Margin=new Thickness(0,8,0,0);selection.FontSize=17;selection.Margin=new Thickness(0,0,0,4);shell.Padding=new Thickness(14);}
        else{MinWidth=850;MinHeight=580;Width=1250;Height=810;body.ColumnDefinitions.Add(new(){Width=new GridLength(1,GridUnitType.Star)});body.ColumnDefinitions.Add(new(){Width=new GridLength(5)});body.ColumnDefinitions.Add(new(){Width=new GridLength(335),MinWidth=280});Grid.SetRow(mapSurface!,0);Grid.SetColumn(mapSurface!,0);Grid.SetRow(bodySplitter!,0);Grid.SetColumn(bodySplitter!,1);Grid.SetRow(detailsSurface!,0);Grid.SetColumn(detailsSurface!,2);bodySplitter!.Width=4;bodySplitter.Height=double.NaN;bodySplitter.ResizeDirection=GridResizeDirection.Columns;detailsSurface!.Margin=new Thickness(18,0,0,0);selection.FontSize=24;shell.Padding=new Thickness(20);}
        if(enabled){body.RowDefinitions[0].Height=new GridLength(1,GridUnitType.Star);body.RowDefinitions[2].Height=new GridLength(1,GridUnitType.Star);}quick.Visibility=enabled?Visibility.Collapsed:Visibility.Visible;
        foreach(var actions in detailsSurface!.Children.OfType<WrapPanel>())foreach(var button in actions.Children.OfType<Button>().Where(b=>b.Content?.ToString() is "Open source" or "Export memory"))button.Visibility=enabled?Visibility.Collapsed:Visibility.Visible;
        positionView="";positions.Clear();RenderGraph();Dispatcher.BeginInvoke(FitMap,DispatcherPriority.Loaded);
    }
    void FollowWindow(){
        if(cliWindow==null||closing)return;
        if(!NativeWindows.Same(cliWindow)){cliWindow=null;hiddenForCli=false;Show();linkState="Linked CLI closed · choose Link CLI";return;}
        if(!follow)return;
        if(NativeWindows.IsIconic(cliWindow.Handle)||!NativeWindows.IsWindowVisible(cliWindow.Handle)){if(!hiddenForCli){Hide();hiddenForCli=true;}return;}
        if(hiddenForCli){ShowActivated=false;Show();hiddenForCli=false;}
        if(!NativeWindows.GetWindowRect(cliWindow.Handle,out var target))return;
        var area=System.Windows.Forms.Screen.FromHandle(cliWindow.Handle).WorkingArea;
        double dpi=Math.Max(96,NativeWindows.GetDpiForWindow(cliWindow.Handle))/96.0;
        var result=NativeWindows.Place(target,new NativeWindows.Bounds{Left=area.Left,Top=area.Top,Right=area.Right,Bottom=area.Bottom},(int)(570*dpi),(int)Math.Max(700*dpi,Math.Min(target.Height,900*dpi)),(int)(420*dpi));
        var next=result.Bounds;placement=result.Overlap?"No side space · edge overlay (CLI size preserved)":"Beside CLI · "+result.Side;
        NativeWindows.GetWindowRect(handle,out var current);
        if(current.Left!=next.Left||current.Top!=next.Top||current.Width!=next.Width||current.Height!=next.Height){NativeWindows.SetWindowPos(handle,IntPtr.Zero,next.Left,next.Top,next.Width,next.Height,0x0010|0x0004);Dispatcher.BeginInvoke(FitMap,DispatcherPriority.Loaded);}
        // Do not Activate() or change the user's CLI geometry.
    }
    async Task UpdateCompanion(){
        var sessions=Arr(state,"sessions");string signature=Str(state?["project"],"id")+string.Join("|",sessions.Select(s=>Str(s,"id")+Str(s,"phase")+Str(s,"projectId")));
        if(signature!=sessionKey){sessionKey=signature;var windows=NativeWindows.List();foreach(var s in sessions.Where(s=>Str(s,"phase")=="connected")){string id=Str(s,"id");if(sessionWindows.ContainsKey(id))continue;int.TryParse(Str(s,"pid"),out int pid);double.TryParse(Str(s,"startedAt"),out double time);var window=NativeWindows.Resolve(pid,time,windows);if(window!=null)sessionWindows[id]=window;}
            if(cliWindow==null&&!manualDetach&&state?["project"]!=null){string root=Str(state["project"],"root").TrimEnd('\\','/');var candidates=sessions.Where(s=>Str(s,"phase")=="connected"&&(Str(s,"projectId")==Str(state["project"],"id")||Str(s,"cwd").Equals(root,StringComparison.OrdinalIgnoreCase)||Str(s,"cwd").StartsWith(root+"\\",StringComparison.OrdinalIgnoreCase))&&sessionWindows.ContainsKey(Str(s,"id"))).Select(s=>sessionWindows[Str(s,"id")]).Where(NativeWindows.Same).DistinctBy(w=>w.Handle).ToList();if(candidates.Count==1)AttachCli(candidates[0],"Detected CLI");else if(candidates.Count>1)linkState="Multiple CLI windows · choose Link CLI";}
        }
        await UpdateWork();
        if(cliWindow!=null)ShowStatus(linkState+" · "+placement);else if(liveWork)ShowStatus(linkState+" · File watcher active");
    }
    async Task UpdateWork(){
        if(!liveWork||state?["snapshot"]==null)return;
        var ids=cliWindow==null?Array.Empty<string>():sessionWindows.Where(p=>p.Value.Handle==cliWindow.Handle&&p.Value.Started==cliWindow.Started).Select(p=>p.Key).ToArray();
        if(chosenConnectionId!=""&&cliWindow!=null)ids=[chosenConnectionId];
        // A manually chosen window with no mapped transport must not inherit another CLI's reports.
        if(cliWindow!=null&&ids.Length==0)ids=["unmapped-selected-window"];
        string filter=Str(state?["project"],"id")+"|"+string.Join("|",ids);long seq=state?["sequence"]?.GetValue<long>()??0;
        if(lastWorkSequence==seq&&filter==workSelection)return;
        var work=await Post("/work",new{connectionIds=ids});if(!liveWork)return;lastWorkSequence=seq;workSelection=filter;workView=work;
        if(WorkEmpty){snapshot=new JsonObject{["nodes"]=new JsonArray(),["edges"]=new JsonArray()};graph.Children.Clear();boxes.Clear();connections.Clear();lines.Clear();count.Text="WAITING FOR CLI WORK";selection.Text="Your CLI's next action";detail.Text=Str(work,"message")+"\n\n"+linkState;source.Clear();quick.Items.Clear();return;}
        string next=Str(work,"key");if(workKey==next)return;workKey=next;activeAction=Str(work,"actionId");scope="";historyRevision="";snapshot=work?["snapshot"] as JsonObject;search.Clear();RenderGraph();FitMap();
        if(activeAction!="")await RenderAction();else{selection.Text="Source observation · actor unknown";detail.Text=Str(work,"message")+"\n\n"+string.Join("\n",Arr(work,"changes").Select(c=>Str(c,"kind")+" · "+Str(c,"path")));quick.Items.Clear();source.Clear();}
        tabs.SelectedIndex=0;
    }
}
