using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using DepthClient;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UIElements;
using Debug = UnityEngine.Debug;

/// <summary>Native Depth AI workbench: source-linked preview, shared module context, spatial exploration and reviewable development.</summary>
public sealed class DepthWorkbench : MonoBehaviour
{
    UIDocument document;
    PanelSettings panelSettings;
    Font font,codeFont;
    VisualElement root,previewPanel,previewBody,agentPanel,agentTabs,projectPanel,projectBody,focusPanel,focusBody,focusHeader,focusTabs,inspector,hierarchy,modal,focusWorkspace,dock;
    VisualElement libraryPanel,libraryBody;
    Label libraryTitle;
    string libraryPath="";
    DepthConnections previewLink;
    Button previewAction;
    DepthBackdrop backdrop;
    DepthSpatialField field;
    Image fieldImage;
    Label statusLabel,contextLabel,projectTitle,previewStatus;
    ScrollView feed;
    TextField composer,search;
    Button send,reviewAction;
    WorkspaceView snapshot;
    Composition composition;
    ImpactReport impact;
    ContextPacket lastPacket;
    HashSet<string> impactScope;
    ModuleCard selected;
    Proposal proposal;
    ProposalPreview review;
    readonly Dictionary<string,Texture2D> images=new Dictionary<string,Texture2D>();
    readonly Dictionary<string,VisualElement> memberViews=new Dictionary<string,VisualElement>();
    readonly Dictionary<string,bool> treeExpansion=new Dictionary<string,bool>();
    readonly List<Tuple<VisualElement,Button>> tabButtons=new List<Tuple<VisualElement,Button>>();
    Process service;
    string token,storage,projectPath="",endpoint="http://127.0.0.1:43821",query="",activeTab="Composition",agentMode="API",apiKey="",model="",draftId="",draftValue="";
    bool modulesOnly=true,spatialTree,spatialAgent;Vector2? shelfOrigin;
    VisualElement spatialToolbar,spatialCaption;
    Label spatialCount;
    int focusTicket;
    bool ready,busy,dark,reducedMotion,focused,smoking,refreshing;
    float focusProgress,nextPoll,nextActivity;
    int sourceTicket,draftTicket;
    float previousWidth,previousHeight,previousProgress=-1;
    string lastActivity="";

    void Awake()
    {
        Application.runInBackground=true;QualitySettings.vSyncCount=1;
        var displayCamera=new GameObject("Desktop display camera").AddComponent<Camera>();
        displayCamera.cullingMask=0;displayCamera.clearFlags=CameraClearFlags.SolidColor;displayCamera.backgroundColor=new Color(.92f,.95f,1f);displayCamera.depth=-10;
        dark=PlayerPrefs.GetInt("depth.workbench23.dark",0)==1;reducedMotion=PlayerPrefs.GetInt("depth.motion.reduced",0)==1;
        font=Font.CreateDynamicFontFromOSFont(new[]{Application.platform==RuntimePlatform.OSXPlayer||Application.platform==RuntimePlatform.OSXEditor?"Arial":"Segoe UI","Arial"},18);
        codeFont=Font.CreateDynamicFontFromOSFont(new[]{Application.platform==RuntimePlatform.OSXPlayer||Application.platform==RuntimePlatform.OSXEditor?"Menlo":"Consolas","Arial"},16);
        panelSettings=ScriptableObject.CreateInstance<PanelSettings>();panelSettings.scaleMode=PanelScaleMode.ScaleWithScreenSize;
        panelSettings.referenceResolution=new Vector2Int(1680,1000);panelSettings.screenMatchMode=PanelScreenMatchMode.MatchWidthOrHeight;panelSettings.match=.5f;
        panelSettings.themeStyleSheet=Resources.Load<ThemeStyleSheet>("Depth/Theme");
        document=gameObject.AddComponent<UIDocument>();document.panelSettings=panelSettings;
        root=document.rootVisualElement;root.AddToClassList("workspace");root.style.flexGrow=1;
        root.style.position=Position.Absolute;root.style.left=0;root.style.right=0;root.style.top=0;root.style.bottom=0;
        root.styleSheets.Add(Resources.Load<StyleSheet>("Depth/Workbench23"));root.style.unityFontDefinition=FontDefinition.FromFont(font);
        root.styleSheets.Add(Resources.Load<StyleSheet>("Depth/SpatialWorkspace"));
        backdrop=new DepthBackdrop();root.Add(backdrop);BuildShell();SetTheme(dark);
        var args=Environment.GetCommandLineArgs();for(int i=0;i<args.Length-1;i++)if(args[i]=="--depth-project")projectPath=args[i+1];
        root.RegisterCallback<KeyDownEvent>(evt=>{if(evt.keyCode==KeyCode.Escape){if(modal!=null)CloseModal();else OpenSpatial();}});
        StartCoroutine(Boot());
    }
    VisualElement Box(VisualElement parent,string className)
    { var element=new VisualElement();foreach(var c in className.Split(' '))if(c.Length>0)element.AddToClassList(c);parent.Add(element);if(className=="panel")element.Add(new DepthGlass());return element; }
    Label Text(VisualElement parent,string value,string className="")
    { var label=new Label(value){enableRichText=false};foreach(var c in className.Split(' '))if(c.Length>0)label.AddToClassList(c);parent.Add(label);return label; }
    Button Action(VisualElement parent,string value,System.Action clicked,string className="action")
    { var button=new Button(clicked){text=value};foreach(var c in className.Split(' '))if(c.Length>0)button.AddToClassList(c);parent.Add(button);return button; }
    VisualElement Head(VisualElement parent,string title)
    { var h=Box(parent,"panel-head");Text(h,title,"panel-title");Box(h,"spacer");return h; }
    void BuildShell()
    {
        var top=Box(root,"topbar");top.Add(new DepthMark());Text(top,"DEPTH AI","brand");
        Action(top,"Open project",OpenProject,"action quiet");Action(top,"Spatial workspace",OpenSpatial,"action primary");Action(top,"Workbench",OpenWorkbench,"action quiet");Box(top,"spacer");
        Action(top,"Connections",OpenConnections);Action(top,"Light / Dark",()=>SetTheme(!dark));
        previewPanel=Box(root,"panel");previewPanel.AddToClassList("preview-panel");var previewHead=Head(previewPanel,"Project preview");previewStatus=Text(previewHead,"Source linked","badge");previewBody=new DepthScrollView();previewBody.AddToClassList("preview-content");previewPanel.Add(previewBody);
        agentPanel=Box(root,"panel");agentTabs=Box(agentPanel,"tabrow");BuildAgentTabs();contextLabel=Text(agentPanel,"Project context","badge");
        feed=new DepthScrollView();feed.AddToClassList("agent-feed");agentPanel.Add(feed);
        AddFeed("AI work uses the same indexed module IDs, source anchors and change review as this workspace.");
        var input=Box(agentPanel,"composer");composer=new TextField{multiline=true};composer.AddToClassList("composer-input");input.Add(composer);send=Action(input,"Send",AskAgent,"action primary");
        projectPanel=Box(root,"panel");projectPanel.AddToClassList("project-sidebar");var projectHead=Head(projectPanel,"Project hierarchy");projectTitle=projectHead.Q<Label>();
        search=new TextField{value=""};search.AddToClassList("hierarchy-search");search.tooltip="Search modules, source files and design notes";search.textEdition.placeholder="Search project…";projectPanel.Add(search);
        search.RegisterValueChangedCallback(e=>{query=e.newValue;UpdateField();});
        projectBody=Box(projectPanel,"project-body");hierarchy=Box(projectBody,"hierarchy");fieldImage=new Image{scaleMode=ScaleMode.StretchToFill};fieldImage.AddToClassList("field");projectBody.Add(fieldImage);
        root.Insert(1,fieldImage);field=new DepthSpatialField(fieldImage);field.Picked=Focus;field.LoadImage=ImageAt;dock=new DepthModuleDock();dock.AddToClassList("module-dock");projectBody.Add(dock);
        focusPanel=Box(root,"panel");focusPanel.AddToClassList("selected-workbench");focusHeader=Box(focusPanel,"focus-header");focusTabs=Box(focusPanel,"tabrow");
        foreach(var tab in new[]{"Composition","Impact","Code","AI notes","Changes"}){var name=tab;Action(focusTabs,name,()=>{activeTab=name;RenderFocus();},"tab");}
        Box(focusTabs,"spacer");Action(focusTabs,"Related modules",()=>{if(composition!=null)ShowModules(composition.memberIds);},"action quiet");
        focusWorkspace=Box(focusPanel,"focus-workspace");focusBody=Box(focusWorkspace,"focus-body");inspector=new DepthScrollView();inspector.AddToClassList("inspector-strip");focusWorkspace.Add(inspector);
        focusPanel.style.display=DisplayStyle.None;
        libraryPanel=Box(root,"panel");libraryPanel.AddToClassList("library-panel");var libraryHead=Head(libraryPanel,"Module library");libraryTitle=libraryHead.Q<Label>();
        Action(libraryHead,"All sources",()=>{libraryPath="";RenderLibrary();},"action quiet");Action(libraryHead,"Open module space",()=>{modulesOnly=true;previousWidth=0;Explore();},"action quiet");
        libraryBody=new DepthScrollView();libraryBody.AddToClassList("library-body");libraryPanel.Add(libraryBody);
        previewLink=new DepthConnections();root.Add(previewLink);
        spatialCaption=Box(root,"spatial-caption");spatialCaption.pickingMode=PickingMode.Ignore;Text(spatialCaption,"YOUR PROJECT, IN SPACE","spatial-eyebrow");spatialCount=Text(spatialCaption,"Source-linked modules","spatial-count");
        spatialToolbar=Box(root,"spatial-toolbar");spatialToolbar.Add(new DepthGlass());
        Action(spatialToolbar,"Overview",()=>{impactScope=null;Explore();field.ResetView();},"action primary");
        Action(spatialToolbar,"Project",()=>{spatialTree=!spatialTree;previousWidth=0;},"action quiet");
        Action(spatialToolbar,"More modules",()=>{impactScope=null;Explore();field.NextPage();UpdateField();},"action quiet");
        Action(spatialToolbar,"AI tools",()=>{spatialAgent=!spatialAgent;previousWidth=0;},"action quiet");
        Action(spatialToolbar,"Reset view",()=>field.ResetView(),"action quiet");
        Action(spatialToolbar,"Motion",()=>{reducedMotion=!reducedMotion;PlayerPrefs.SetInt("depth.motion.reduced",reducedMotion?1:0);},"action quiet");
        var status=Box(root,"bottom-status");statusLabel=Text(status,"Starting analysis service…");Box(status,"spacer");Text(status,"LOCAL WORKSPACE  /  PERSONAL VIEW","muted");
        RenderPreview(null);Reflow();
    }
    void OpenSpatial(){modulesOnly=true;impactScope=null;previousWidth=0;Explore();}
    void OpenWorkbench(){modulesOnly=false;previousWidth=0;if(snapshot!=null&&snapshot.cards.Length>0)Focus(selected?.id??snapshot.preview?.entryId??snapshot.cards[0].id);}
    void BuildAgentTabs()
    {
        agentTabs.Clear();
        foreach(var mode in new[]{"CLI","API"}){var selectedMode=mode;var button=Action(agentTabs,mode=="CLI"?"Codex CLI":"API Agent",()=>{agentMode=selectedMode;BuildAgentTabs();},"tab");button.EnableInClassList("selected",mode==agentMode);}
        Box(agentTabs,"spacer");Action(agentTabs,"Settings",OpenConnections,"tab");
    }
    IEnumerator Boot()
    {
        storage=Path.Combine(Application.persistentDataPath,"service");Directory.CreateDirectory(storage);
        token=Guid.NewGuid().ToString("N")+Guid.NewGuid().ToString("N");
        var executable=ServiceExecutable();
        try
        {
            var start=new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.GetDirectoryName(executable)};
            if(Path.GetFileName(executable)=="dotnet")start.Arguments="\""+Path.Combine(BundleRoot,"service/Depth.Service.dll")+"\"";
            start.EnvironmentVariables["DEPTH_TOKEN"]=token;start.EnvironmentVariables["DEPTH_STORAGE"]=storage;
            if(string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DEPTH_CODEX_EXECUTABLE")))
            {
                var cliRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"npm/node_modules/@openai/codex");
                if(Directory.Exists(cliRoot)){var cli=Directory.EnumerateFiles(cliRoot,"codex.exe",SearchOption.AllDirectories).FirstOrDefault();if(cli!=null)start.EnvironmentVariables["DEPTH_CODEX_EXECUTABLE"]=cli;}
            }
            service=Process.Start(start);
        }
        catch(Exception e){Status("Service could not start: "+e.Message);yield break;}
        for(int i=0;i<60;i++)
        {
            using(var web=UnityWebRequest.Get(endpoint+"/health")){web.SetRequestHeader("X-Depth-Token",token);web.timeout=1;yield return web.SendWebRequest();if(web.result==UnityWebRequest.Result.Success){ready=true;break;}}
            if(service.HasExited)break;yield return new WaitForSeconds(.2f);
        }
        if(!ready){Status("Analysis service unavailable. Check port43821 and the .NET8 runtime.");yield break;}
        if(projectPath.Length==0)projectPath=WorkingSample();
        Import(projectPath);
    }
    string BundleRoot => Application.platform==RuntimePlatform.OSXPlayer ? Path.GetFullPath(Path.Combine(Application.dataPath,"../..")) : Path.GetFullPath(Path.Combine(Application.dataPath,".."));
    string ServiceExecutable() => Application.isEditor ? Path.GetFullPath(Path.Combine(Application.dataPath,"../../../src/Depth.Service/bin/Debug/net8.0/Depth.Service"+(Application.platform==RuntimePlatform.WindowsEditor?".exe":""))) : Application.platform==RuntimePlatform.OSXPlayer?Path.Combine(BundleRoot,"runtime/dotnet"):Path.Combine(BundleRoot,"service/Depth.Service.exe");
    string WorkingSample()
    {
        var bundled=Application.isEditor?Path.GetFullPath(Path.Combine(Application.dataPath,"../../../samples/Checkout")):Path.Combine(BundleRoot,"sample");
        var destination=Path.Combine(Application.persistentDataPath,"projects/Checkout");
        if(!Directory.Exists(destination))CopyDirectory(bundled,destination);
        return destination;
    }
    static void CopyDirectory(string from,string to)
    {
        Directory.CreateDirectory(to);foreach(var file in Directory.GetFiles(from))File.Copy(file,Path.Combine(to,Path.GetFileName(file)),false);
        foreach(var dir in Directory.GetDirectories(from))if(!new[]{"bin","obj",".depth"}.Contains(Path.GetFileName(dir)))CopyDirectory(dir,Path.Combine(to,Path.GetFileName(dir)));
    }
    IEnumerator Api(string path,string json,System.Action<string> done,bool foreground=true)
    {
        if(foreground){busy=true;send.SetEnabled(false);}
        using(var web=new UnityWebRequest(endpoint+path,json==null?"GET":"POST"))
        {
            web.downloadHandler=new DownloadHandlerBuffer();web.timeout=260;web.SetRequestHeader("X-Depth-Token",token);
            if(json!=null){web.uploadHandler=new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));web.SetRequestHeader("Content-Type","application/json");}
            yield return web.SendWebRequest();
            if(foreground){busy=false;send.SetEnabled(true);}
            if(web.result==UnityWebRequest.Result.Success){try{done(web.downloadHandler.text);}catch(Exception e){Status("Response error: "+e.Message);Debug.LogException(e);}}
            else Status("Request failed: "+(web.downloadHandler.text.Length>0?web.downloadHandler.text:web.error));
        }
    }
    void Import(string path)
    {
        if(!ready||busy)return;projectPath=path;Status("Indexing actual project source…");proposal=null;review=null;composition=null;impact=null;impactScope=null;selected=null;focused=false;
        foreach(var image in images.Values)Destroy(image);images.Clear();
        StartCoroutine(Api("/import",JsonUtility.ToJson(new ImportRequest{path=path}),_=>LoadView()));
    }
    void LoadView()
    {
        StartCoroutine(Api("/view",null,json=>
        {
            var oldId=selected==null?"":selected.id;snapshot=JsonUtility.FromJson<WorkspaceView>(json);selected=snapshot.cards.FirstOrDefault(c=>c.id==oldId);
            RenderPreview(snapshot.preview);UpdateField();Status(snapshot.sourceCount+" source files · "+snapshot.cards.Length+" indexed elements · revision "+snapshot.revision.Substring(0,8));
            nextPoll=Time.realtimeSinceStartup+5;
            if(focused&&selected!=null)Focus(selected.id);else if(selected==null&&!modulesOnly&&snapshot.cards.Length>0)Focus(snapshot.preview?.entryId??snapshot.cards[0].id);else Explore();
            if(!smoking&&Environment.GetCommandLineArgs().Contains("--depth-smoke")){smoking=true;StartCoroutine(Smoke());}
            if(!smoking&&Environment.GetCommandLineArgs().Contains("--depth-spatial-smoke")){smoking=true;StartCoroutine(SpatialSmoke());}
            if(!smoking&&Environment.GetCommandLineArgs().Contains("--depth-impact-smoke")){smoking=true;StartCoroutine(ImpactSmoke());}
        }));
    }
    void RenderPreview(BehaviorPreview preview,bool isDraft=false)
    {
        previewStatus.text=isDraft?"Draft · not applied":"Source linked";
        previewBody.Clear();
        if(preview==null)
        {
            Text(previewBody,"Source workspace","cart-title");Text(previewBody,"Import a Unity, Flutter or C# project.","text-body");
            Text(previewBody,"A behavior view requires a source mapping adapter. Projects without an adapter remain fully available in the source/module explorer.","text-body");
            Action(previewBody,"Open project",OpenProject);Action(previewBody,"Open source-linked sample",()=>Import(WorkingSample()));return;
        }
        var shop=Box(previewBody,"shop-heading");Text(shop,"CHECKOUT","section-label");Box(shop,"spacer");Text(shop,"Source-mapped preview","muted");
        Text(previewBody,preview.title,"cart-title");var cart=Box(previewBody,"cart-layout");var products=Box(cart,"cart-products");var summary=Box(cart,"cart-summary");Text(summary,"Order summary","product-name");
        foreach(var product in preview.products??Array.Empty<PreviewProduct>())
        {
            var row=Box(products,"product");var picture=new Image{image=ImageAt(product.image),scaleMode=ScaleMode.ScaleToFit};picture.AddToClassList("product-image");
            picture.RegisterCallback<PointerDownEvent>(_=>Focus(product.assetId));row.Add(picture);
            var words=Box(row,"product-words");Text(words,product.name,"product-name");Text(words,product.detail,"muted");Text(words,Money(product.price),"product-price");
        }
        Summary(summary,"Subtotal",Money(preview.subtotal));Summary(summary,"Discount ("+preview.rate.ToString("0.##",CultureInfo.InvariantCulture)+"%)","−"+Money(preview.subtotal-preview.total));
        var total=Box(summary,"summary-row total-row");Text(total,"Total");Text(total,Money(preview.total),"total-value");
        var action=Box(summary,"coupon-row");Text(action,"WELCOME20","coupon-label");previewAction=Action(action,"Apply coupon  ↗",()=>Focus(preview.entryId),"action primary");
        Text(previewBody,"Select the coupon action or a product to inspect its source module.","preview-hint");Text(previewBody,"Source expression model · runtime not observed","small-note");
    }
    Texture2D ImageAt(string relative)
    {
        if(snapshot==null)return null;var path=Path.GetFullPath(Path.Combine(snapshot.root,relative));
        if(!path.StartsWith(snapshot.root.TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))return null;
        if(images.TryGetValue(path,out var existing))return existing;
        try{if(new FileInfo(path).Length>16000000)return null;var texture=new Texture2D(2,2);if(!texture.LoadImage(File.ReadAllBytes(path))){Destroy(texture);return null;}images[path]=texture;return texture;}catch{return null;}
    }
    void Summary(VisualElement parent,string key,string value){var row=Box(parent,"summary-row");Text(row,key);Text(row,value,"summary-value");}
    static string Money(double value)=>value.ToString("C2",CultureInfo.GetCultureInfo("en-US"));
    void Focus(string id)
    {
        if(snapshot==null)return;var card=snapshot.cards.FirstOrDefault(c=>c.id==id);if(card==null)return;
        int ticket=++focusTicket;var origin=shelfOrigin;shelfOrigin=null;bool changing=focused;field.Select(id);selected=card;Status("Resolving source-backed composition…");
        impact=null;lastPacket=null;if(impactScope!=null&&!impactScope.Contains(id))impactScope=null;
        if(modulesOnly){focused=false;previousWidth=0;focusPanel.style.display=DisplayStyle.None;}
        StartCoroutine(Api("/composition/"+id,null,json=>
        {
            if(ticket!=focusTicket||selected==null||selected.id!=id)return;composition=JsonUtility.FromJson<Composition>(json);
            contextLabel.text=card.name+" · "+composition.totalRelated+" related elements";RenderFocus();UpdateField();Status("Source composition · "+composition.totalRelated+" indexed elements · runtime not observed");
            if(modulesOnly)StartCoroutine(RevealSelected(card.id,ticket));
            else if(changing){RenderFocus();if(origin.HasValue&&!reducedMotion)StartCoroutine(FlyMembers(new Dictionary<string,Vector2?>{{card.id,origin}}));}
            else{focused=true;previousWidth=0;RenderFocus();UpdateField();}
        },false));
        StartCoroutine(Api("/impact",JsonUtility.ToJson(new ContextRequest{id=id,revision=snapshot.revision}),json=>{
            if(ticket!=focusTicket||selected==null||selected.id!=id)return;impact=JsonUtility.FromJson<ImpactReport>(json);
            if(focused&&(activeTab=="Impact"||activeTab=="Composition"))RenderFocus();
        },false));
    }
    IEnumerator RevealSelected(string id,int ticket){yield return new WaitForSeconds(reducedMotion?.01f:.9f);if(ticket!=focusTicket||selected==null||selected.id!=id)yield break;previousWidth=0;focused=true;RenderFocus();UpdateField();}
    void Explore(){focusTicket++;field.Select(null);focused=false;previousWidth=0;focusPanel.style.display=DisplayStyle.None;contextLabel.text="Project context";if(snapshot!=null)UpdateField();}
    void UpdateField()
    {
        if(snapshot==null||field==null)return;
        var candidates=snapshot.cards.Where(c=>string.IsNullOrEmpty(query)||(c.name+" "+c.purpose+" "+c.group+" "+string.Join(" ",c.anchors.Select(a=>a.path))).IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0)
            .OrderBy(c=>c.id==snapshot.preview?.entryId?0:c.kind=="Method"?1:c.kind=="Field"?2:c.kind=="Image"?3:4).ToArray();
        var spatialCandidates=impactScope==null?candidates:candidates.Where(c=>impactScope.Contains(c.id)).ToArray();
        field.Set(spatialCandidates,focused,dark,composition==null?Array.Empty<string>():composition.memberIds,snapshot.relations,snapshot.preview?.entryId,snapshot.preview?.propertyId);
        spatialCount.text=field.ShownCount+" of "+spatialCandidates.Length+(impactScope==null?" modules · drag empty space to look around":" potential-impact modules · Overview restores all modules");
        RenderHierarchy(candidates);
        RenderLibrary();
        projectTitle.text="Project hierarchy";
    }
    void RenderHierarchy(ModuleCard[] candidates)
    {
        var previous=hierarchy.Q<ScrollView>()?.scrollOffset??Vector2.zero;hierarchy.Clear();
        var scroll=new DepthScrollView();scroll.AddToClassList("hierarchy-scroll");hierarchy.Add(scroll);
        var project=Box(scroll,"tree-project");project.Add(new DepthMark());var title=Box(project,"module-names");Text(title,Path.GetFileName(snapshot.root),"module-title");Text(title,snapshot.cards.Length+" indexed modules","muted");
        foreach(var directory in candidates.GroupBy(c=>Path.GetDirectoryName(c.anchors[0].path)??"").OrderBy(g=>g.Key))
        {
            string directoryKey="dir:"+directory.Key;var section=new Foldout{text=directory.Key.Length==0?"Source":directory.Key,value=!treeExpansion.ContainsKey(directoryKey)||treeExpansion[directoryKey]};section.AddToClassList("tree-folder");scroll.Add(section);
            section.RegisterValueChangedCallback(e=>{if(e.target==section)treeExpansion[directoryKey]=e.newValue;});
            foreach(var group in directory.GroupBy(c=>c.anchors[0].path).OrderBy(g=>g.Key))
            {
                string key=group.Key;var file=new Foldout{text=Path.GetFileName(key),value=!treeExpansion.ContainsKey(key)||treeExpansion[key]};file.AddToClassList("tree-file");section.Add(file);
                file.RegisterValueChangedCallback(e=>{if(e.target==file)treeExpansion[key]=e.newValue;});
                foreach(var card in group.OrderBy(c=>c.anchors[0].startLine))
                {
                    var captured=card;var row=Action(file,"",()=>{previousWidth=0;Focus(captured.id);},"tree-module");
                    AddIcon(row,card);Text(row,card.name,"tree-module-name");row.tooltip=card.kind+" · "+card.anchors[0].path+":"+card.anchors[0].startLine;
                    row.EnableInClassList("selected",selected?.id==card.id);row.EnableInClassList("related",composition!=null&&composition.memberIds.Contains(card.id));
                }
            }
        }
        scroll.schedule.Execute(()=>scroll.scrollOffset=previous).StartingIn(20);
    }
    void RenderLibrary()
    {
        if(snapshot==null||libraryBody==null)return;libraryBody.Clear();var grid=Box(libraryBody,"library-grid");
        var cards=snapshot.cards.Where(c=>query.Length==0||(c.name+" "+c.anchors[0].path).IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0).ToArray();
        libraryTitle.text=libraryPath.Length==0?"Module library  /  "+cards.Length+" elements":Path.GetFileName(libraryPath);
        if(libraryPath.Length==0){
            foreach(var group in cards.GroupBy(c=>c.anchors[0].path)){
                var path=group.Key;var representative=group.FirstOrDefault(c=>c.kind=="Method")??group.First();
                var tile=Action(grid,"",()=>{libraryPath=path;RenderLibrary();},"library-card");tile.Add(new DepthGlass(true));
                AddIcon(tile,representative);Text(tile,Path.GetFileNameWithoutExtension(path),"library-name");Text(tile,group.Count()+" source elements","muted");
                tile.EnableInClassList("related",composition!=null&&group.Any(c=>composition.memberIds.Contains(c.id)));tile.tooltip=path;
            }
        }else foreach(var card in cards.Where(c=>c.anchors[0].path==libraryPath)){
            var tile=Action(grid,"",()=>{modulesOnly=false;Focus(card.id);},"library-card");tile.Add(new DepthGlass(true));AddIcon(tile,card);Text(tile,card.name,"library-name");Text(tile,card.kind,"muted");tile.tooltip=card.anchors[0].path;
        }
    }
    static string Short(string value,int count)=>value.Length<=count?value:value.Substring(0,count-1)+"…";
    ModuleCard[] Representatives()
    {
        if(selected==null||composition==null)return Array.Empty<ModuleCard>();
        var outgoing=new HashSet<string>(composition.relations.Where(r=>r.from==composition.rootId).Select(r=>r.to));
        var members=snapshot.cards.Where(c=>composition.memberIds.Contains(c.id)).ToArray();
        var result=new List<ModuleCard>{members.First(c=>c.id==composition.rootId)};
        void Pick(Func<ModuleCard,bool> predicate){var card=members.Where(c=>!result.Contains(c)&&predicate(c)).OrderByDescending(c=>snapshot.relations.Count(r=>r.to==c.id&&r.kind!="contains")).FirstOrDefault();if(card!=null)result.Add(card);}
        Pick(c=>c.id==snapshot.preview?.propertyId);if(result.Count==1)Pick(c=>c.properties.Length>0);
        Pick(c=>outgoing.Contains(c.id)&&RoleIcon(c)=="validation");
        Pick(c=>outgoing.Contains(c.id)&&c.kind=="Method"&&RoleIcon(c)=="logic");
        Pick(c=>outgoing.Contains(c.id)&&c.kind=="Method"&&RoleIcon(c)=="view");
        Pick(c=>c.kind=="Image");
        foreach(var card in members.Where(c=>outgoing.Contains(c.id)&&c.kind=="Method"))if(result.Count<6&&!result.Contains(card))result.Add(card);
        return result.ToArray();
    }
    void RenderFocus()
    {
        if(selected==null||composition==null)return;focusPanel.style.display=modulesOnly&&!focused?DisplayStyle.None:DisplayStyle.Flex;focusHeader.Clear();
        var rootCard=snapshot.cards.First(c=>c.id==composition.rootId);var heading=Box(focusHeader,"feature-heading");AddIcon(heading,rootCard);var headingText=Box(heading,"feature-heading-text");Text(headingText,snapshot.preview!=null&&rootCard.id==snapshot.preview.entryId?snapshot.preview.action:rootCard.name,"focus-title");
        Text(headingText,rootCard.anchors[0].path+" · "+composition.totalRelated+" source-linked elements · "+rootCard.noteStatus,"focus-subtitle");
        foreach(var button in focusTabs.Children().OfType<Button>())button.EnableInClassList("selected",button.text==activeTab);
        inspector.style.display=DisplayStyle.Flex;inspector.style.height=activeTab=="Changes"?100:modulesOnly?72:62;UpdatePreviewLink();
        focusBody.Clear();memberViews.Clear();inspector.Clear();focusWorkspace.EnableInClassList("reviewing",activeTab=="Changes");
        if(activeTab=="Composition"){if(modulesOnly)RenderSpatialSelection();else RenderComposition();}else if(activeTab=="Impact")RenderImpact();else if(activeTab=="Code")ReadSource();else if(activeTab=="AI notes")RenderNotes();else RenderReview();
        if(activeTab!="Changes")RenderInspector();
    }
    void RenderSpatialSelection()
    {
        var scroll=new DepthScrollView();scroll.AddToClassList("spatial-selection");focusBody.Add(scroll);
        if(impact!=null){var summary=Box(scroll,"impact-summary");Text(summary,impact.directUsers+" direct users · "+impact.items.Count(i=>i.hops>1)+" indirect","impact-summary-title");Action(summary,"Inspect impact",()=>{activeTab="Impact";RenderFocus();},"action quiet");}
        Text(scroll,"PURPOSE","section-label");Text(scroll,string.IsNullOrEmpty(selected.purpose)?"Indexed "+selected.kind.ToLowerInvariant()+" from the project source.":selected.purpose,"text-body");
        if(selected.kind=="Image"){var picture=new Image{image=ImageAt(selected.anchors[0].path),scaleMode=ScaleMode.ScaleToFit};picture.style.height=140;scroll.Add(picture);}
        foreach(var property in selected.properties){Text(scroll,property.label,"section-label");var row=Box(scroll,"module-edit");var input=new TextField{value=draftId==selected.id?draftValue:property.value};input.AddToClassList("inline-property");row.Add(input);var id=selected.id;input.RegisterValueChangedCallback(e=>{draftId=id;draftValue=e.newValue;DraftProperty(id,e.newValue);});Action(row,"Review change",()=>ProposeProperty(id,input.value),"action primary");}
        Text(scroll,"SOURCE CONNECTIONS","section-label");
        foreach(var relation in snapshot.relations.Where(r=>(r.from==selected.id||r.to==selected.id)&&r.kind!="contains").GroupBy(r=>r.from+"|"+r.to+"|"+r.kind).Select(g=>g.First()).OrderBy(r=>r.kind=="calls"?0:1).Take(7)){
            var target=snapshot.cards.FirstOrDefault(c=>c.id==(relation.from==selected.id?relation.to:relation.from));if(target==null)continue;var id=target.id;
            Action(scroll,(relation.from==selected.id?"→ ":"← ")+target.name+"   ·   "+relation.kind,()=>Focus(id),"spatial-relation");
        }
        Text(scroll,"Selection keeps the same source ID. Connections show indexed references; runtime behavior is not observed.","small-note");
        var controls=Box(scroll,"spatial-selection-actions");Action(controls,"Open source",()=>{activeTab="Code";RenderFocus();},"action primary");Action(controls,"Back to space",Explore,"action quiet");
    }
    void RenderImpact()
    {
        var scroll=new DepthScrollView();scroll.AddToClassList("impact-scroll");focusBody.Add(scroll);
        if(impact==null){Text(scroll,"Resolving source-backed impact…","text-body");return;}
        var actions=Box(scroll,"impact-actions");
        Action(actions,impactScope==null?"Show affected in space":"Show all modules",ToggleImpactScope,"action primary");
        Action(actions,"AI context",ShowContextPacket,"action");
        DrawImpact(scroll,impact);
    }
    void ToggleImpactScope(){if(impact==null)return;impactScope=impactScope==null?new HashSet<string>(impact.items.Select(i=>i.id)):null;if(!modulesOnly){modulesOnly=true;previousWidth=0;}UpdateField();RenderFocus();}
    string ModuleName(string id)=>snapshot.cards.FirstOrDefault(c=>c.id==id)?.name??id;
    void DrawImpact(VisualElement parent,ImpactReport report)
    {
        Text(parent,"ONE IMPLEMENTATION · SHARED USE","section-label");
        Text(parent,report.directUsers+" direct users  /  "+report.items.Count(i=>i.hops>1)+" indirect users","impact-title");
        Text(parent,"Potential impact from source references. Runtime behavior has not been verified.","impact-note");
        if(report.truncated)Text(parent,"Limited result: 6 hops / 128 modules. More users may exist.","error");
        var users=report.items.Where(i=>i.hops>0).ToArray();
        if(users.Length==0)Text(parent,"No callers found in the indexed graph. Dynamic or unresolved uses may still exist.","text-body");
        foreach(var item in users.Take(40)){
            var box=Box(parent,"impact-item");var head=Box(box,"impact-item-head");
            Action(head,item.name+" ↗",()=>{CloseModal();activeTab="Code";Focus(item.id);},"impact-source-button");
            Text(head,item.hops==1?"DIRECT":"VIA "+item.hops+" HOPS","badge");
            var names=new[]{ModuleName(item.id)}.Concat(item.path.Select(r=>ModuleName(r.to)));
            Text(box,string.Join(" → ",names),"impact-path");
            foreach(var edge in item.path){
                var line=Text(box,edge.kind+" · "+(edge.site==null?"No source location":edge.site.path+":"+edge.site.startLine),"impact-evidence");
                line.tooltip=edge.evidence.kind+" / "+edge.evidence.method+"\n"+edge.evidence.detail;
            }
        }
        if(users.Length>40)Text(parent,"Showing 40 of "+users.Length+" users. The AI context packet reports omitted modules.","small-note");
        var detail=Text(parent,report.scope,"small-note");detail.tooltip="Source revision: "+report.revision;
    }
    void ShowContextPacket()
    {
        if(selected==null)return;var id=selected.id;
        StartCoroutine(Api("/context/packet",JsonUtility.ToJson(new ContextRequest{id=id,revision=snapshot.revision}),json=>{
            if(selected==null||selected.id!=id)return;lastPacket=JsonUtility.FromJson<ContextPacket>(json);
            var body=OpenModal("Shared context / "+ModuleName(id));
            Text(body,lastPacket.includedIds.Length+" modules · "+lastPacket.characters+" characters · "+lastPacket.omittedModules+" omitted","text-body");
            Text(body,"The same revision-bound packet is used by this view, MCP, CLI and API agents. Character count is not a measured token cost.","small-note");
            if(lastPacket.truncated)Text(body,"Some source excerpts or related modules were omitted to keep context bounded.","small-note");
            var text=new TextField{multiline=true,isReadOnly=true,value=lastPacket.content};text.style.height=380;text.style.marginTop=12;text.style.marginBottom=12;text.style.fontSize=11;text.style.unityFontDefinition=FontDefinition.FromFont(codeFont);body.Add(text);
            Action(body,"Copy this context",()=>{GUIUtility.systemCopyBuffer=lastPacket.content;Status("Copied "+lastPacket.packetId);},"action primary");
        }));
    }
    void RenderComposition()
    {
        var viewport=new DepthScrollView(ScrollViewMode.VerticalAndHorizontal);viewport.AddToClassList("composition-scroll");focusBody.Add(viewport);
        var canvas=Box(viewport,"composition");var wires=new DepthConnections();canvas.Add(wires);
        var visible=Representatives();
        for(int i=0;i<visible.Length;i++)
        {
            var card=visible[i];bool primary=i==0;var body=Box(canvas,"module-card");body.focusable=true;
            body.RegisterCallback<ClickEvent>(e=>{for(var hit=e.target as VisualElement;hit!=null&&hit!=body;hit=hit.parent)if(hit is Button||hit is TextField)return;Inspect(card);});
            body.RegisterCallback<KeyDownEvent>(e=>{if(e.keyCode==KeyCode.Return&&e.target==body)Inspect(card);});
            body.EnableInClassList("selected",selected.id==card.id);body.EnableInClassList("feature-root",primary);
            body.Add(new DepthGlass(true,RoleTint(card)));
            var heading=Box(body,"module-heading");var iconPlate=Box(heading,"icon-plate");AddIcon(iconPlate,card);
            var names=Box(heading,"module-names");Text(names,card.name,"module-title");Text(names,card.properties.Length>0?"Source value":card.kind,"module-subtitle");
            var contents=Box(body,"module-contents");
            if(card.properties.Length>0){
                var property=card.properties[0];var edit=Box(contents,"module-edit");
                var input=new TextField{value=draftId==card.id?draftValue:property.value};input.AddToClassList("inline-property");edit.Add(input);
                input.RegisterValueChangedCallback(e=>{draftId=card.id;draftValue=e.newValue;DraftProperty(card.id,e.newValue);});
                Action(edit,"Review",()=>ProposeProperty(card.id,input.value),"action primary");
            }else if(card.kind=="Image"){
                var picture=new Image{image=ImageAt(card.anchors[0].path),scaleMode=ScaleMode.ScaleToFit};picture.AddToClassList("asset-preview");if(primary)picture.style.height=180;contents.Add(picture);
            }else{
                Text(contents,card.purpose.Length>0?Short(card.purpose,primary?105:78):"Source-backed "+card.kind.ToLowerInvariant(),"module-description");
                if(primary){
                    var snippet=Box(contents,"module-code");Text(snippet,"SOURCE EXCERPT","code-caption");
                    StartCoroutine(Api("/context/call",JsonUtility.ToJson(new ToolRequest{name="source.read",argumentsJson=JsonUtility.ToJson(new SourceRequest{id=card.id,wholeFile=false})}),json=>{
                        var source=JsonUtility.FromJson<SourceResponse>(json);var lines=(source.sources?.FirstOrDefault()?.content??"").Split('\n').Select(line=>line.Trim()).Where(line=>line.Length>0&&!line.StartsWith("//")).ToArray();
                        var start=Array.FindIndex(lines,line=>line=="{");var excerpt=start>=0?lines.Skip(start+1):lines;
                        foreach(var line in excerpt.Where(line=>line!="}").Take(3)){var text=Text(snippet,line,"code-line");text.style.unityFontDefinition=FontDefinition.FromFont(codeFont);text.tooltip=line;}snippet.tooltip=string.Join("\n",lines);
                    },false));
                    Action(contents,"Open source",()=>{selected=card;activeTab="Code";RenderFocus();},"action quiet");
                }
            }
            var foot=Box(body,"module-foot");Text(foot,Path.GetFileName(card.anchors[0].path)+":"+card.anchors[0].startLine,"source-chip");
            int refs=snapshot.relations.Count(r=>r.to==card.id&&r.kind!="contains");if(refs>1)Text(foot,refs+" refs","ref-count");
            body.tooltip=card.anchors[0].path+":"+card.anchors[0].startLine+"\n"+card.noteOrigin+" / "+card.noteStatus;memberViews[card.id]=body;
        }
        void Arrange()
        {
            float w=canvas.contentRect.width,h=canvas.contentRect.height;if(w<100||h<80)return;
            float side=(w-108)/3,center=side+8,left=18,right=w-side-18;
            for(int i=0;i<visible.Length;i++){
                var item=memberViews[visible[i].id];float width=i==0?center:side;item.style.width=width;
                bool compact=h<478;float height=i==0?300:visible[i].properties.Length>0||visible[i].kind=="Image"?(compact?124:142):i==2||i==5?(compact?114:122):174;
                item.style.height=height;item.style.left=i==0?(w-width)*.5f:i==1||i==2||i==5?left:right;
                item.style.top=i==0?(h-height)*.5f:i==1?(h-height)*.5f:i==2||i==3?18:h-height-18;
            }
            wires.Edges.Clear();foreach(var relation in composition.relations.GroupBy(r=>r.from+"|"+r.to+"|"+r.kind).Select(g=>g.First()))
                if(memberViews.TryGetValue(relation.from,out var from)&&memberViews.TryGetValue(relation.to,out var to))wires.Edges.Add(Tuple.Create(from,to,relation.kind));
            wires.MarkDirtyRepaint();UpdatePreviewLink();
        }
        viewport.RegisterCallback<GeometryChangedEvent>(_=>{canvas.style.width=Mathf.Max(650,viewport.contentRect.width-6);canvas.style.height=Mathf.Max(438,viewport.contentRect.height-4);});
        canvas.RegisterCallback<GeometryChangedEvent>(_=>Arrange());canvas.schedule.Execute(Arrange).StartingIn(40);
        var footer=Box(focusBody,"composition-legend");Text(footer,"→ Calls     → References","muted");Box(footer,"spacer");Text(footer,"Source relationships · runtime not observed","muted");
    }
    void UpdatePreviewLink()
    {
        if(previewLink==null)return;previewLink.Edges.Clear();
        if(focused&&!modulesOnly&&activeTab=="Composition"&&snapshot?.preview!=null&&composition?.rootId==snapshot.preview.entryId&&previewAction!=null&&memberViews.TryGetValue(composition.rootId,out var target))
            previewLink.Edges.Add(Tuple.Create((VisualElement)previewAction,focusHeader,"preview mapping"));
        previewLink.MarkDirtyRepaint();
    }
    void Inspect(ModuleCard card)
    {
        selected=card;foreach(var pair in memberViews)pair.Value.EnableInClassList("selected",pair.Key==card.id);
        inspector.Clear();RenderInspector();RenderHierarchy(snapshot.cards);
    }
    static Color RoleTint(ModuleCard card)
    {
        switch(RoleIcon(card)){case "action":return new Color(.26f,.69f,1);case "state":return new Color(.25f,.83f,.7f);case "validation":return new Color(.48f,.75f,1);case "view":return new Color(.38f,.66f,1);default:return new Color(.67f,.48f,1);}
    }
    void AddIcon(VisualElement parent,ModuleCard card)
    {
        var icon=new Image{image=card.kind=="Image"?ImageAt(card.anchors[0].path):Resources.Load<Texture2D>("Depth/Icons/"+RoleIcon(card)),scaleMode=ScaleMode.ScaleToFit};icon.AddToClassList("role-icon");parent.Add(icon);
    }
    static string RoleIcon(ModuleCard card)
    {
        var name=card.name.ToLowerInvariant();
        if(name.Contains("valid"))return "validation";
        if(card.kind=="Field"||name.Contains("state"))return "state";
        if(name.Contains("view")||name.Contains("settotal")||card.kind=="Image"||card.kind=="Font")return "view";
        return name.StartsWith("apply")?"action":"logic";
    }
    void RenderInspector()
    {
        var summary=Box(inspector,"design-summary");var badge=Text(summary,"AI","summary-badge");
        var text=Box(summary,"summary-copy");Text(text,"Design rationale  /  "+selected.name,"summary-title");
        Text(text,Short(string.IsNullOrEmpty(selected.rationale)?string.IsNullOrEmpty(selected.purpose)?"No design note recorded for this source.":selected.purpose:selected.rationale,96),"summary-text");
        Action(summary,"Details ↗",ShowModuleDetails,"action quiet");
    }
    void ShowModuleDetails()
    {
        if(selected==null)return;var panel=OpenModal(selected.name+" / "+selected.kind);var scroll=new DepthScrollView();scroll.AddToClassList("details-scroll");panel.Add(scroll);
        Text(scroll,selected.anchors[0].path+":"+selected.anchors[0].startLine,"source-chip");
        Text(scroll,"PURPOSE","section-label");Text(scroll,selected.purpose.Length>0?selected.purpose:"No note recorded.","text-body");
        if(selected.rationale.Length>0){Text(scroll,"DESIGN RATIONALE","section-label");Text(scroll,selected.rationale,"text-body");}
        Text(scroll,selected.noteOrigin+" · "+selected.noteStatus,"small-note");
        Text(scroll,"SOURCE REFERENCES","section-label");foreach(var relation in snapshot.relations.Where(r=>r.from==selected.id||r.to==selected.id).Take(20)){
            var target=snapshot.cards.FirstOrDefault(c=>c.id==(relation.from==selected.id?relation.to:relation.from));if(target==null)continue;
            Action(scroll,target.name+"  /  "+relation.kind,()=>{CloseModal();Focus(target.id);},"tree-item");
        }
        Text(scroll,"Source indexed · runtime not observed","small-note");Action(panel,"Open source",()=>{CloseModal();activeTab="Code";RenderFocus();},"action primary");
    }
    void DraftProperty(string id,string value)
    {
        if(snapshot.preview==null)return;int ticket=++draftTicket;double parsed;if(!double.TryParse(value,NumberStyles.Float,CultureInfo.InvariantCulture,out parsed))return;
        StartCoroutine(Api("/property/draft",JsonUtility.ToJson(new PropertyRequest{id=id,value=value,revision=snapshot.revision}),json=>{if(ticket==draftTicket)RenderPreview(JsonUtility.FromJson<BehaviorPreview>(json),true);},false));
    }
    void ProposeProperty(string id,string value)
    {
        if(busy)return;StartCoroutine(Api("/property/propose",JsonUtility.ToJson(new PropertyRequest{id=id,value=value,revision=snapshot.revision}),json=>ReviewProposal(JsonUtility.FromJson<Proposal>(json))));
    }
    void ReadSource()
    {
        var fieldView=new TextField{multiline=true,isReadOnly=true,value="Reading indexed source…"};fieldView.AddToClassList("code-view");fieldView.style.unityFontDefinition=FontDefinition.FromFont(codeFont);focusBody.Add(fieldView);
        var id=selected.id;int ticket=++sourceTicket;
        StartCoroutine(Api("/context/call",JsonUtility.ToJson(new ToolRequest{name="source.read",argumentsJson=JsonUtility.ToJson(new SourceRequest{id=id,wholeFile=false})}),json=>
        {
            if(ticket!=sourceTicket||selected==null||selected.id!=id)return;var source=JsonUtility.FromJson<SourceResponse>(json);
            fieldView.value=string.Join("\n\n",source.sources.Select(s=>s.anchor.path+":"+s.startLine+"  ·  "+s.anchor.contentHash.Substring(0,10)+"\n\n"+s.content));
        },false));
    }
    void RenderNotes()
    {
        var scroll=new DepthScrollView();scroll.AddToClassList("content");focusBody.Add(scroll);
        Text(scroll,"PURPOSE","section-label");Text(scroll,selected.purpose.Length>0?selected.purpose:"Not yet recorded. The agent can inspect this source and record its purpose.","text-body");
        if(selected.creationReason.Length>0){Text(scroll,"CREATION REASON","section-label");Text(scroll,selected.creationReason,"text-body");}
        if(selected.rationale.Length>0){Text(scroll,"DESIGN SUMMARY","section-label");Text(scroll,selected.rationale,"text-body");}
        Text(scroll,"EVIDENCE","section-label");Text(scroll,selected.noteOrigin+" / "+selected.noteStatus+"\n"+string.Join("\n",selected.anchors.Select(a=>a.path+":"+a.startLine))+"\nRuntime: not observed. Target build: not run.","text-body");
        if(selected.noteStatus=="needs review")Text(scroll,"Source changed after this AI note. Re-read and update the note before relying on it.","error");
    }
    void ReviewProposal(Proposal pending)
    {
        proposal=pending;StartCoroutine(Api("/proposals/"+pending.id,null,json=>{review=JsonUtility.FromJson<ProposalPreview>(json);activeTab="Changes";if(!focused&&snapshot.cards.Length>0)Focus(snapshot.preview==null?snapshot.cards[0].id:snapshot.preview.entryId);else RenderFocus();AddFeed("Proposal ready: "+pending.reason);}));
    }
    void RenderReview()
    {
        if(review==null){Text(focusBody,"No pending change. Ask the agent or edit a source-bound property.","content");return;}
        var caption=Box(focusBody,"content");caption.style.flexGrow=0;Text(caption,review.proposal.reason,"text-body");
        if(review.assessment!=null){
            var analysis=review.assessment;var summary=Box(caption,"impact-summary");
            Text(summary,analysis.changedIds.Length+" changed · "+analysis.impact.items.Count(i=>i.hops>0)+" potential users","impact-summary-title");
            Action(summary,"Impact & checks",ShowReviewAssessment,"action quiet");
            Text(caption,string.Join(" · ",analysis.checks.Where(c=>c.status!="not-run").Select(c=>(c.status=="passed"?"✓ ":"! ")+c.name)),analysis.canApply?"impact-evidence":"error");
        }
        Text(caption,"Not run: target build · behavior tests","impact-note");
        var columns=Box(focusBody,"review-columns");
        var changes=review.changes??Array.Empty<ProposalChange>();
        var before=new TextField{multiline=true,isReadOnly=true,value=string.Join("\n\n",changes.Select(c=>c.path+" / BEFORE\n\n"+c.before))};before.AddToClassList("review-code");before.style.unityFontDefinition=FontDefinition.FromFont(codeFont);columns.Add(before);
        var after=new TextField{multiline=true,isReadOnly=true,value=string.Join("\n\n",changes.Select(c=>c.path+" / AFTER\n\n"+c.after))};after.AddToClassList("review-code");after.style.unityFontDefinition=FontDefinition.FromFont(codeFont);columns.Add(after);
        var controls=Box(inspector,"property-row");reviewAction=Action(controls,"Apply reviewed change",ApplyProposal,"action primary");reviewAction.SetEnabled(proposal!=null&&proposal.revision==snapshot.revision&&review.assessment!=null&&review.assessment.canApply&&!busy);
        Action(controls,"Dismiss",()=>{if(proposal==null)return;StartCoroutine(Api("/dismiss",JsonUtility.ToJson(new ApplyRequest{id=proposal.id}),_=>{proposal=null;review=null;activeTab="Composition";RenderFocus();RenderPreview(snapshot.preview);}));});
        Text(controls,"Reviewed source · backup + reindex","muted");
    }
    void ShowReviewAssessment()
    {
        if(review?.assessment==null)return;var analysis=review.assessment;var body=OpenModal("Change impact & validation");
        var scroll=new DepthScrollView();scroll.style.maxHeight=560;body.Add(scroll);
        foreach(var check in analysis.checks){var row=Box(scroll,"validation-check");Text(row,check.name+" / "+check.status.ToUpperInvariant(),check.status=="failed"?"error":"impact-summary-title");Text(row,check.detail,"impact-note");}
        Text(scroll,"CHANGED DECLARATIONS","section-label");Text(scroll,string.Join(", ",analysis.changedIds.Select(ModuleName)),"text-body");Text(scroll,analysis.mapping,"small-note");
        DrawImpact(scroll,analysis.impact);
    }
    void ApplyProposal()
    {
        if(busy||proposal==null)return;var id=proposal.id;Status("Applying approved proposal and reindexing…");
        StartCoroutine(Api("/apply",JsonUtility.ToJson(new ApplyRequest{id=id,approved=true}),_=>{proposal=null;review=null;draftId="";draftValue="";activeTab="Composition";AddFeed("Source applied and reindexed. Target compile/runtime tests are still pending.");LoadView();}));
    }
    void AskAgent()
    {
        if(busy||snapshot==null||string.IsNullOrWhiteSpace(composer.value))return;var prompt=composer.value;composer.value="";AddFeed("You · "+prompt);
        var ids=selected==null?Array.Empty<string>():new[]{selected.id};Status("Agent is retrieving project context…");
        if(agentMode=="API")
            StartCoroutine(Api("/agent",JsonUtility.ToJson(new AgentRequest{prompt=prompt,apiKey=apiKey,model=model,moduleIds=ids,revision=snapshot.revision}),json=>{var reply=JsonUtility.FromJson<AgentReply>(json);AddFeed("Agent · "+reply.message);if(reply.proposal!=null)ReviewProposal(reply.proposal);else LoadView();}));
        else StartCoroutine(Api("/propose",JsonUtility.ToJson(new PromptRequest{prompt=prompt,moduleIds=ids,revision=snapshot.revision}),json=>ReviewProposal(JsonUtility.FromJson<Proposal>(json))));
    }
    void AddFeed(string text){if(feed==null)return;Text(feed,text,"feed-entry");while(feed.contentContainer.childCount>24)feed.contentContainer.RemoveAt(0);feed.schedule.Execute(()=>feed.verticalScroller.value=feed.verticalScroller.highValue).StartingIn(10);}
    void Status(string message){statusLabel.text=message;statusLabel.tooltip=message;}
    void OpenProject()
    {
        var body=OpenModal("Open project");Text(body,"Unity, Flutter or C# project directory","text-body");var path=new TextField{value=projectPath};path.AddToClassList("modal-field");body.Add(path);
        Action(body,"Import actual source",()=>{CloseModal();Import(path.value);},"action primary");Action(body,"Open bundled source example",()=>{CloseModal();Import(WorkingSample());});
        Text(body,"Behavior views require a source mapping adapter. A generic source explorer remains available for other projects.","small-note");
    }
    void OpenConnections()
    {
        var body=OpenModal("AI connections");Text(body,"API AGENT / OPENAI RESPONSES","section-label");
        var key=new TextField("API key"){value=apiKey,isPasswordField=true};key.AddToClassList("modal-field");body.Add(key);key.RegisterValueChangedCallback(e=>apiKey=e.newValue);
        var modelInput=new TextField("Model ID"){value=model};modelInput.AddToClassList("modal-field");body.Add(modelInput);modelInput.RegisterValueChangedCallback(e=>model=e.newValue);
        Text(body,"Key stays in this process memory. Requests send only retrieved module/source context to the provider.","small-note");
        Text(body,"EXISTING CODEX CLI / MCP","section-label");Text(body,"Connect your existing CLI to this same running project. This command is shown for you to run; app setup does not change global CLI settings.","text-body");
        var executable=ServiceExecutable();
        var command="codex mcp add depth-ai -- \""+executable+"\" --mcp --connection \""+Path.Combine(storage??"","connection.json")+"\"";
        var config=new TextField{value=command,multiline=true,isReadOnly=true};config.AddToClassList("modal-field");body.Add(config);Action(body,"Copy MCP command",()=>GUIUtility.systemCopyBuffer=command);
        var motion=new Toggle("Reduce motion"){value=reducedMotion};body.Add(motion);motion.RegisterValueChangedCallback(e=>{reducedMotion=e.newValue;PlayerPrefs.SetInt("depth.motion.reduced",reducedMotion?1:0);});
        Action(body,"Done",CloseModal,"action primary");
    }
    VisualElement OpenModal(string title){CloseModal();modal=Box(root,"modal-shade");var body=Box(modal,"modal");Text(body,title,"modal-title");Action(body,"Close",CloseModal,"action quiet");return body;}
    void CloseModal(){if(modal!=null){modal.RemoveFromHierarchy();modal=null;}}
    void ShowAllModules(){if(snapshot!=null)ShowModules(snapshot.cards.Where(c=>string.IsNullOrEmpty(query)||(c.name+" "+c.group+" "+c.purpose).IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0).Select(c=>c.id));}
    void ShowModules(IEnumerable<string> ids)
    {
        var body=OpenModal("Indexed modules");var scroll=new DepthScrollView();scroll.style.maxHeight=560;body.Add(scroll);var set=new HashSet<string>(ids);
        foreach(var card in snapshot.cards.Where(c=>set.Contains(c.id)).Take(250)){var id=card.id;Action(scroll,card.name+"  /  "+card.kind+"  /  "+Short(card.anchors[0].path,55),()=>{CloseModal();Focus(id);},"tree-item");}
        Text(body,"Showing up to250 indexed elements. Use search to narrow large projects.","small-note");
    }
    void SetTheme(bool value){dark=value;root.EnableInClassList("dark",dark);backdrop.Dark=dark;backdrop.MarkDirtyRepaint();DepthGlass.Dark=dark;root.Query<DepthGlass>().ForEach(g=>g.MarkDirtyRepaint());PlayerPrefs.SetInt("depth.workbench23.dark",dark?1:0);if(snapshot!=null)UpdateField();}
    void Reflow()
    {
        float w=root.contentRect.width,h=root.contentRect.height;if(w<100||h<100)return;
        if(Mathf.Abs(previousWidth-w)<.1f&&Mathf.Abs(previousHeight-h)<.1f&&Mathf.Abs(previousProgress-focusProgress)<.001f)return;
        previousWidth=w;previousHeight=h;previousProgress=focusProgress;
        root.EnableInClassList("spatial",modulesOnly);
        spatialToolbar.style.display=modulesOnly?DisplayStyle.Flex:DisplayStyle.None;spatialCaption.style.display=modulesOnly?DisplayStyle.Flex:DisplayStyle.None;
        if(modulesOnly){
            Place(fieldImage,0,52,w,h-79);fieldImage.style.display=DisplayStyle.Flex;field.Visible=true;
            float previewWidth=Mathf.Min(600,w*.35f),previewHeight=Mathf.Min(455,(h-130)*.52f);
            Place(previewPanel,w*.485f-previewWidth*.5f,h*.31f,previewWidth,previewHeight);previewPanel.style.display=DisplayStyle.Flex;
            Place(focusPanel,w*.665f,h*.30f,w*.32f,h*.59f);focusPanel.style.display=focused?DisplayStyle.Flex:DisplayStyle.None;
            Place(projectPanel,24,h*.55f,250,h*.36f);projectPanel.style.display=spatialTree?DisplayStyle.Flex:DisplayStyle.None;
            Place(agentPanel,24,h*.55f,Mathf.Min(470,w*.31f),h*.36f);agentPanel.style.display=spatialAgent?DisplayStyle.Flex:DisplayStyle.None;
            libraryPanel.style.display=DisplayStyle.None;dock.style.display=DisplayStyle.None;hierarchy.style.display=DisplayStyle.Flex;
            Place(spatialToolbar,(w-650)*.5f,h-95,650,54);spatialToolbar.style.height=54;UpdatePreviewLink();return;
        }
        projectPanel.style.display=DisplayStyle.Flex;field.Visible=!focused;
        float top=66,gap=14,treeWidth=202,center=treeWidth+gap+10,available=h-top-40;
        float usable=w-center-12,centerWidth=Mathf.Min(650,usable*.44f),right=center+centerWidth+gap,rightWidth=w-right-12;
        float upper=available*.755f,bottom=top+upper+gap,bottomHeight=available-upper-gap;
        Place(projectPanel,10,top,treeWidth,available);Place(previewPanel,center,top,centerWidth,upper);
        Place(focusPanel,right,top,rightWidth,upper);Place(agentPanel,center,bottom,centerWidth*.82f,bottomHeight);
        float libraryLeft=center+centerWidth*.82f+gap;Place(libraryPanel,libraryLeft,bottom,w-libraryLeft-12,bottomHeight);
        if(modulesOnly){right=center;rightWidth=w-right-12;}
        Place(fieldImage,right,top,rightWidth,modulesOnly?available:upper);
        previewPanel.style.display=modulesOnly?DisplayStyle.None:DisplayStyle.Flex;agentPanel.style.display=modulesOnly?DisplayStyle.None:DisplayStyle.Flex;libraryPanel.style.display=modulesOnly?DisplayStyle.None:DisplayStyle.Flex;
        hierarchy.style.display=DisplayStyle.Flex;fieldImage.style.display=focused?DisplayStyle.None:DisplayStyle.Flex;dock.style.display=DisplayStyle.None;
        focusPanel.style.opacity=1;focusPanel.style.display=focused?DisplayStyle.Flex:DisplayStyle.None;projectPanel.EnableInClassList("spatial-project",false);UpdatePreviewLink();
    }

    static void Place(VisualElement element,float x,float y,float w,float h){element.style.left=x;element.style.top=y;element.style.width=w;element.style.height=Mathf.Max(70,h);}
    void Update()
    {
        ((DepthModuleDock)dock).Tick(Time.unscaledDeltaTime);field.ReducedMotion=reducedMotion;field.Tick(Time.unscaledDeltaTime);
        focusProgress=Mathf.MoveTowards(focusProgress,focused?1:0,Time.unscaledDeltaTime/(reducedMotion ? .01f : .65f));Reflow();
        if(modulesOnly)field.SetFrames(previewPanel.worldBound,new Rect(root.contentRect.width*.665f,root.contentRect.height*.30f,root.contentRect.width*.32f,root.contentRect.height*.59f),focused);
        if(!ready||snapshot==null)return;
        if(Time.realtimeSinceStartup>nextActivity)
        {
            nextActivity=Time.realtimeSinceStartup+2;
            StartCoroutine(Api("/activity",null,json=>{var activity=JsonUtility.FromJson<ActivityFeed>(json);var item=activity.items.LastOrDefault();if(item!=null&&item.at+item.tool+item.detail!=lastActivity){lastActivity=item.at+item.tool+item.detail;AddFeed(item.at+"  "+item.tool+"  "+Short(item.detail,80));}},false));
        }
        if(!busy&&!refreshing&&Time.realtimeSinceStartup>nextPoll)
        {
            nextPoll=Time.realtimeSinceStartup+5;refreshing=true;
            StartCoroutine(Api("/refresh","{}",json=>{refreshing=false;var graph=JsonUtility.FromJson<Graph>(json);if(graph.revision!=snapshot.revision){proposal=null;review=null;LoadView();}},false));
            StartCoroutine(Api("/pending",null,json=>{var pending=JsonUtility.FromJson<PendingProposals>(json).proposals.LastOrDefault(p=>p.revision==snapshot.revision);if(pending!=null&&(proposal==null||proposal.id!=pending.id))ReviewProposal(pending);},false));
        }
    }
    IEnumerator FlyMembers(Dictionary<string,Vector2?> origins)
    {
        yield return null;yield return null;
        var ghosts=new List<Tuple<VisualElement,VisualElement,Vector2,Vector2>>();
        foreach(var pair in memberViews)
        {
            if(!origins.TryGetValue(pair.Key,out var origin)||!origin.HasValue)continue;
            var target=pair.Value;var destination=target.worldBound.position;var ghost=Box(root,"module-card");ghost.style.width=target.layout.width;ghost.style.minHeight=90;
            ghost.Add(new DepthGlass(true));var moving=snapshot.cards.First(c=>c.id==pair.Key);AddIcon(ghost,moving);Text(ghost,moving.name,"module-title");Text(ghost,moving.anchors[0].path,"source-chip");ghost.pickingMode=PickingMode.Ignore;target.style.opacity=0;
            ghosts.Add(Tuple.Create(ghost,target,root.WorldToLocal(origin.Value),root.WorldToLocal(destination)));
        }
        float elapsed=0;while(elapsed<.62f){elapsed+=Time.unscaledDeltaTime;float t=Mathf.SmoothStep(0,1,elapsed/.62f);foreach(var ghost in ghosts){var p=Vector2.Lerp(ghost.Item3,ghost.Item4,t);ghost.Item1.style.left=p.x;ghost.Item1.style.top=p.y;ghost.Item1.style.opacity=1-t*.25f;}yield return null;}
        foreach(var ghost in ghosts){ghost.Item1.RemoveFromHierarchy();ghost.Item2.style.opacity=1;}
    }
    IEnumerator ImpactSmoke()
    {
        var run=ImpactSmokeCore();while(true){bool next;try{next=run.MoveNext();}catch(Exception error){Debug.LogException(error);Application.Quit(3);yield break;}if(!next)yield break;yield return run.Current;}
    }
    IEnumerator ImpactSmokeCore()
    {
        if(snapshot.preview==null||!Path.GetFileName(projectPath).StartsWith("native-smoke-",StringComparison.Ordinal)||!File.Exists(Path.Combine(projectPath,".allow-smoke-apply")))throw new Exception("Impact smoke requires an isolated fixture");
        var directory=Path.Combine(BundleRoot,"proof-impact");Directory.CreateDirectory(directory);
        Screen.SetResolution(1680,1000,FullScreenMode.Windowed);SetTheme(false);OpenSpatial();yield return new WaitForSeconds(2);
        activeTab="Impact";Focus(snapshot.cards.Single(c=>c.name=="CalculateTotal").id);yield return new WaitForSeconds(1.8f);
        if(impact==null||impact.directUsers!=2||!impact.items.Any(i=>i.name=="ApplyCoupon")||!impact.items.Any(i=>i.name=="Estimate"))throw new Exception("Shared caller impact missing");
        ScreenCapture.CaptureScreenshot(Path.Combine(directory,"01-shared-users.png"));yield return new WaitForSeconds(.4f);
        var propertyId=snapshot.preview.propertyId;Focus(propertyId);yield return new WaitForSeconds(1.6f);
        if(impact==null||impact.items.Single(i=>i.name=="CalculateTotal").hops!=1||impact.items.Single(i=>i.name=="Estimate").hops!=2||impact.items.Where(i=>i.hops>0).Any(i=>i.path.Length!=i.hops||i.path.Any(e=>e.site==null)))throw new Exception("Directed source impact routes missing");
        ToggleImpactScope();yield return new WaitForSeconds(1);
        if(!new HashSet<string>(field.ShownIds).SetEquals(impact.items.Select(i=>i.id)))throw new Exception("Impact filter lost canonical module identity");
        ScreenCapture.CaptureScreenshot(Path.Combine(directory,"02-impact-space.png"));yield return new WaitForSeconds(.4f);
        ShowContextPacket();yield return new WaitForSeconds(1);
        if(lastPacket==null||lastPacket.characters>24000||lastPacket.includedIds.Distinct().Count()!=lastPacket.includedIds.Length||!lastPacket.content.Contains("SHA256"))throw new Exception("Shared context missing evidence or bounds");
        string contextId=lastPacket.packetId;File.WriteAllText(Path.Combine(directory,"context.json"),JsonUtility.ToJson(lastPacket,true));
        ScreenCapture.CaptureScreenshot(Path.Combine(directory,"03-shared-context.png"));yield return new WaitForSeconds(.4f);CloseModal();
        bool drafted=false;draftId=propertyId;draftValue="25";
        yield return Api("/property/draft",JsonUtility.ToJson(new PropertyRequest{id=propertyId,value="25",revision=snapshot.revision}),json=>{var draft=JsonUtility.FromJson<BehaviorPreview>(json);drafted=draft.total==90;RenderPreview(draft,true);});
        if(!drafted)throw new Exception("Draft expression preview missing");
        yield return Api("/property/propose",JsonUtility.ToJson(new PropertyRequest{id=propertyId,value="25",revision=snapshot.revision}),json=>proposal=JsonUtility.FromJson<Proposal>(json));
        if(proposal==null)throw new Exception("No property proposal");
        yield return Api("/proposals/"+proposal.id,null,json=>review=JsonUtility.FromJson<ProposalPreview>(json));
        if(review?.assessment==null||!review.assessment.canApply||!review.assessment.changedIds.SequenceEqual(new[]{propertyId})||review.assessment.checks.Where(c=>c.name=="Target build"||c.name=="Behavior tests").Any(c=>c.status!="not-run"))throw new Exception("Review assessment missing or overclaims validation");
        activeTab="Changes";RenderFocus();yield return new WaitForSeconds(.6f);
        if(!reviewAction.enabledSelf)throw new Exception("Reviewed apply action disabled");
        ScreenCapture.CaptureScreenshot(Path.Combine(directory,"04-change-review.png"));yield return new WaitForSeconds(.4f);
        ShowReviewAssessment();yield return new WaitForSeconds(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"05-validation.png"));yield return new WaitForSeconds(.4f);CloseModal();
        File.WriteAllText(Path.Combine(directory,"review.json"),JsonUtility.ToJson(review,true));
        bool applied=false;yield return Api("/apply",JsonUtility.ToJson(new ApplyRequest{id=proposal.id,approved=true}),_=>applied=true);
        if(!applied)throw new Exception("Isolated reviewed apply failed");
        yield return Api("/view",null,json=>snapshot=JsonUtility.FromJson<WorkspaceView>(json));
        if(snapshot.preview.total!=90||snapshot.preview.propertyId!=propertyId)throw new Exception("Apply/reindex lost value or source identity");
        ContextPacket updated=null;yield return Api("/context/packet",JsonUtility.ToJson(new ContextRequest{id=propertyId,revision=snapshot.revision}),json=>updated=JsonUtility.FromJson<ContextPacket>(json));
        if(updated==null||updated.packetId==contextId)throw new Exception("Context identity did not change with source revision");
        proposal=null;review=null;draftId="";draftValue="";RenderPreview(snapshot.preview);activeTab="Impact";Focus(propertyId);yield return new WaitForSeconds(1.5f);
        foreach(var size in new[]{new Vector2Int(1680,1000),new Vector2Int(1280,720),new Vector2Int(1024,768)}){
            Screen.SetResolution(size.x,size.y,FullScreenMode.Windowed);yield return new WaitForSeconds(1.2f);
            var bounds=root.worldBound;foreach(var panel in new[]{previewPanel,focusPanel}){var r=panel.worldBound;if(r.xMin<bounds.xMin||r.yMin<bounds.yMin||r.xMax>bounds.xMax+1||r.yMax>bounds.yMax+1)throw new Exception("Impact surface outside window");}
            if(previewPanel.worldBound.Overlaps(focusPanel.worldBound))throw new Exception("Impact and preview overlap");
            if(focusBody.layout.height<120)throw new Exception("Impact evidence surface too small");
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"layout-"+size.x+"x"+size.y+".png"));yield return new WaitForSeconds(.4f);
        }
        File.WriteAllText(Path.Combine(directory,"validation.txt"),"PASS: shared direct users; transitive source paths; spatial filter preserves IDs; bounded context; changed declaration mapping; checks distinguish syntax from unrun target build/behavior; isolated 20→25 apply, expression total 96→90, reindex identity retained and context revision changed; panel bounds at 1680x1000,1280x720,1024x768. Native automated callbacks, not OS pointer injection. No external model or headset runtime tested.");
        Application.Quit(0);
    }
    IEnumerator SpatialSmoke()
    {
        var run=SpatialSmokeCore();while(true){bool next;try{next=run.MoveNext();}catch(Exception error){Debug.LogException(error);Application.Quit(3);yield break;}if(!next)yield break;yield return run.Current;}
    }
    IEnumerator SpatialSmokeCore()
    {
        var directory=Path.Combine(BundleRoot,"proof-spatial-pc");Directory.CreateDirectory(directory);
        Screen.SetResolution(1680,1000,FullScreenMode.Windowed);SetTheme(false);OpenSpatial();yield return new WaitForSeconds(3);
        field.Validate(previewPanel.worldBound);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"01-overview.png"));yield return new WaitForSeconds(.4f);
        var id=snapshot.preview?.entryId??field.ShownIds[0];var before=field.ShownIds.ToDictionary(key=>key,key=>field.PositionOf(key));
        if(!field.PickSource(id))throw new Exception("Source ray selection failed");yield return new WaitForSeconds(.35f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"02-moving.png"));yield return new WaitForSeconds(1.5f);
        if(!modulesOnly||!focused||selected.id!=id)throw new Exception("Spatial selection lost its source identity or view");
        if(Vector3.Distance(before[id],field.PositionOf(id))<1)throw new Exception("Selected body did not move forward");
        foreach(var pair in before)if(pair.Key!=id&&Vector3.Distance(pair.Value,field.PositionOf(pair.Key))>.2f)throw new Exception("Unselected body moved out of its home");
        if(previewPanel.worldBound.Overlaps(focusPanel.worldBound))throw new Exception("Preview and selected work surface overlap");
        ScreenCapture.CaptureScreenshot(Path.Combine(directory,"03-selected.png"));yield return new WaitForSeconds(.4f);
        activeTab="Code";RenderFocus();yield return new WaitForSeconds(.7f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"04-source.png"));yield return new WaitForSeconds(.4f);
        if(snapshot.preview!=null){
            activeTab="Composition";Focus(snapshot.preview.propertyId);yield return new WaitForSeconds(1.5f);
            if(!focused||selected.id!=snapshot.preview.propertyId)throw new Exception("Spatial property selection lost");
            double original=snapshot.preview.total;bool drafted=false;draftId=selected.id;draftValue="25";RenderFocus();
            yield return Api("/property/draft",JsonUtility.ToJson(new PropertyRequest{id=selected.id,value="25",revision=snapshot.revision}),json=>{var draft=JsonUtility.FromJson<BehaviorPreview>(json);drafted=draft.rate==25;RenderPreview(draft,true);});
            if(!drafted)throw new Exception("Spatial source draft failed");yield return new WaitForSeconds(.4f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"04b-property-draft.png"));yield return new WaitForSeconds(.4f);
            yield return Api("/view",null,json=>{var current=JsonUtility.FromJson<WorkspaceView>(json);if(current.preview.total!=original)throw new Exception("A draft changed committed source");});draftId="";draftValue="";RenderPreview(snapshot.preview);
        }
        activeTab="Composition";Explore();yield return new WaitForSeconds(1.3f);
        foreach(var pair in before)if(Vector3.Distance(pair.Value,field.PositionOf(pair.Key))>.2f)throw new Exception("Overview did not restore the same body");
        field.BeginDrag(Vector2.zero);field.MoveDrag(new Vector2(80,30),true);if(Mathf.Abs(field.CameraYaw)<.1f)throw new Exception("Held drag did not change the camera");field.EndDrag();var yaw=field.CameraYaw;field.MoveDrag(new Vector2(400,80),false);if(field.IsDragging||field.CameraYaw!=yaw)throw new Exception("Pointer continued moving the camera after release");field.ResetView();
        foreach(var size in new[]{new Vector2Int(1280,720),new Vector2Int(1024,768)}){
            Screen.SetResolution(size.x,size.y,FullScreenMode.Windowed);yield return new WaitForSeconds(1.5f);field.Validate(previewPanel.worldBound);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"layout-"+size.x+"x"+size.y+".png"));yield return new WaitForSeconds(.4f);
        }
        Screen.SetResolution(1680,1000,FullScreenMode.Windowed);yield return new WaitForSeconds(1.5f);
        spatialTree=true;previousWidth=0;yield return new WaitForSeconds(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"05-project.png"));yield return new WaitForSeconds(.4f);spatialTree=false;previousWidth=0;
        File.WriteAllText(Path.Combine(directory,"validation.txt"),"PASS: real-source ray pick; selected body moves while other identities remain at home; same body returns; source view; press-only camera drag; central preview and focus panel disjoint; 1680x1000,1280x720,1024x768. OS pointer injection and headset runtime not tested.");
        Application.Quit(0);
    }
    IEnumerator Smoke()
    {
        var run=SmokeCore();while(true){bool next;try{next=run.MoveNext();}catch(Exception error){Debug.LogException(error);Application.Quit(3);yield break;}if(!next)yield break;yield return run.Current;}
    }
    IEnumerator SmokeCore()
    {
        modulesOnly=false;previousWidth=0;
        var directory=Path.Combine(BundleRoot,"proof-reference23");Directory.CreateDirectory(directory);
        Screen.SetResolution(1680,1000,FullScreenMode.Windowed);SetTheme(false);yield return new WaitForSeconds(1.5f);
        yield return new WaitForSeconds(1.5f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"01-overview.png"));yield return new WaitForSeconds(.5f);
        if(snapshot.preview!=null)Focus(snapshot.preview.entryId);yield return new WaitForSeconds(2);
        ScreenCapture.CaptureScreenshot(Path.Combine(directory,"02-focused.png"));yield return new WaitForSeconds(.5f);
        if(snapshot.preview!=null){selected=snapshot.cards.First(c=>c.id==snapshot.preview.propertyId);RenderFocus();yield return new WaitForSeconds(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"02b-property.png"));yield return new WaitForSeconds(.5f);}
        SetTheme(true);yield return new WaitForSeconds(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"02c-dark.png"));yield return new WaitForSeconds(.5f);SetTheme(false);
        activeTab="Code";RenderFocus();yield return new WaitForSeconds(1);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"02d-source.png"));yield return new WaitForSeconds(.5f);activeTab="Composition";RenderFocus();
        var result=new NativeProof{root=projectPath,cards=snapshot.cards.Length,relations=snapshot.relations.Length,focused=focused,previewTotal=snapshot.preview==null?0:snapshot.preview.total,
            uiWidth=root.contentRect.width,uiHeight=root.contentRect.height,projectWidth=projectPanel.layout.width,fieldWidth=fieldImage.layout.width};
        if(snapshot.preview!=null&&Path.GetFileName(projectPath).StartsWith("native-smoke-",StringComparison.Ordinal)&&File.Exists(Path.Combine(projectPath,".allow-smoke-apply")))
        {
            var propertyId=snapshot.preview.propertyId;bool completed=false;
            yield return Api("/property/draft",JsonUtility.ToJson(new PropertyRequest{id=propertyId,value="25",revision=snapshot.revision}),json=>{var preview=JsonUtility.FromJson<BehaviorPreview>(json);RenderPreview(preview);result.draftTotal=preview.total;});
            yield return Api("/property/propose",JsonUtility.ToJson(new PropertyRequest{id=propertyId,value="25",revision=snapshot.revision}),json=>proposal=JsonUtility.FromJson<Proposal>(json));
            if(proposal!=null){yield return Api("/proposals/"+proposal.id,null,json=>{review=JsonUtility.FromJson<ProposalPreview>(json);activeTab="Changes";RenderFocus();});yield return new WaitForSeconds(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"03-review.png"));yield return new WaitForSeconds(.5f);}
            if(proposal!=null)yield return Api("/apply",JsonUtility.ToJson(new ApplyRequest{id=proposal.id,approved=true}),_=>{completed=true;result.applied=true;});
            if(completed)yield return Api("/view",null,json=>{var updated=JsonUtility.FromJson<WorkspaceView>(json);result.updatedTotal=updated.preview.total;result.stableId=updated.preview.propertyId==propertyId;snapshot=updated;selected=updated.cards.First(c=>c.id==updated.preview.entryId);RenderPreview(updated.preview);});
        }
        proposal=null;review=null;draftId="";draftValue="";activeTab="Composition";if(snapshot.preview!=null)Focus(snapshot.preview.entryId);yield return new WaitForSeconds(1);
        File.WriteAllText(Path.Combine(directory,"native.json"),JsonUtility.ToJson(result,true));
        foreach(var size in new[]{new Vector2Int(1680,1000),new Vector2Int(1280,720),new Vector2Int(1024,768)}){
            Screen.SetResolution(size.x,size.y,FullScreenMode.Windowed);yield return new WaitForSeconds(1.2f);activeTab="Composition";RenderFocus();yield return new WaitForSeconds(.3f);
            ValidateLayout();ScreenCapture.CaptureScreenshot(Path.Combine(directory,"layout-"+size.x+"x"+size.y+".png"));yield return new WaitForSeconds(.3f);
        }
        File.WriteAllText(Path.Combine(directory,"layout-validation.txt"),"PASS: composition bounds and pairwise overlap; preview bounds; 1680x1000, 1280x720, 1024x768");
        Screen.SetResolution(1680,1000,FullScreenMode.Windowed);modulesOnly=true;previousWidth=0;Explore();yield return new WaitForSeconds(2);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"04-returned.png"));yield return new WaitForSeconds(1);Application.Quit(result.focused&&result.cards>0&&(result.applied?result.updatedTotal==90&&result.stableId:true)?0:2);
    }
    void ValidateLayout()
    {
        var canvas=focusBody.Q(className:"composition");if(canvas==null)throw new Exception("Missing composition canvas");
        var outer=canvas.worldBound;var cards=memberViews.Values.ToArray();
        foreach(var card in cards){var r=card.worldBound;if(r.xMin<outer.xMin-1||r.yMin<outer.yMin-1||r.xMax>outer.xMax+1||r.yMax>outer.yMax+1)throw new Exception("Module clipped: "+r+" in "+outer);
            foreach(var label in card.Query<Label>().ToList()){var b=label.worldBound;if(b.yMax>r.yMax+1||b.xMax>r.xMax+1)throw new Exception("Module content clipped: "+label.text);}
            var foot=card.Q(className:"module-foot");if(foot!=null)foreach(var action in card.Query<Button>().ToList())if(action.worldBound.Overlaps(foot.worldBound))throw new Exception("Module action overlaps source footer: "+card.Q<Label>(className:"module-title").text+" / "+action.text+" / "+action.worldBound+" / "+foot.worldBound);}
        for(int i=0;i<cards.Length;i++)for(int j=i+1;j<cards.Length;j++)if(cards[i].worldBound.Overlaps(cards[j].worldBound))throw new Exception("Module cards overlap");
        var panels=new[]{projectPanel,previewPanel,agentPanel,focusPanel,libraryPanel};for(int i=0;i<panels.Length;i++)for(int j=i+1;j<panels.Length;j++)if(panels[i].worldBound.Overlaps(panels[j].worldBound))throw new Exception("Workbench panels overlap");
        if(projectPanel.worldBound.xMin>=previewPanel.worldBound.xMin||previewPanel.worldBound.xMin>=focusPanel.worldBound.xMin)throw new Exception("Reference 2 column order changed");
    }
    [Serializable] sealed class NativeProof { public string root;public int cards,relations;public bool focused,applied,stableId;public double previewTotal,draftTotal,updatedTotal;public float uiWidth,uiHeight,projectWidth,fieldWidth; }
    void OnDestroy(){field?.Dispose();foreach(var image in images.Values)Destroy(image);if(service!=null){try{if(!service.HasExited)service.Kill();}catch{}service.Dispose();}if(panelSettings!=null)Destroy(panelSettings);if(font!=null)Destroy(font);if(codeFont!=null)Destroy(codeFont);}
}
