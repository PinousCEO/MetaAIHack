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
    VisualElement root,previewPanel,previewBody,agentPanel,agentTabs,projectPanel,projectBody,focusPanel,focusBody,focusHeader,focusTabs,inspector,hierarchy,modal;
    DepthBackdrop backdrop;
    DepthSpatialField field;
    Image fieldImage;
    Label statusLabel,contextLabel,projectTitle;
    ScrollView feed;
    TextField composer,search;
    Button send,reviewAction;
    WorkspaceView snapshot;
    Composition composition;
    ModuleCard selected;
    Proposal proposal;
    ProposalPreview review;
    readonly Dictionary<string,Texture2D> images=new Dictionary<string,Texture2D>();
    readonly Dictionary<string,VisualElement> memberViews=new Dictionary<string,VisualElement>();
    readonly List<Tuple<VisualElement,Button>> tabButtons=new List<Tuple<VisualElement,Button>>();
    Process service;
    string token,storage,projectPath="",endpoint="http://127.0.0.1:43821",query="",activeTab="Composition",agentMode="API",apiKey="",model="",draftId="",draftValue="";
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
        dark=PlayerPrefs.GetInt("depth.theme.dark",0)==1;reducedMotion=PlayerPrefs.GetInt("depth.motion.reduced",0)==1;
        font=Font.CreateDynamicFontFromOSFont(new[]{"Segoe UI","Malgun Gothic","Arial"},18);
        codeFont=Font.CreateDynamicFontFromOSFont(new[]{"Consolas","Malgun Gothic","Arial"},16);
        panelSettings=ScriptableObject.CreateInstance<PanelSettings>();panelSettings.scaleMode=PanelScaleMode.ScaleWithScreenSize;
        panelSettings.referenceResolution=new Vector2Int(1680,1000);panelSettings.screenMatchMode=PanelScreenMatchMode.MatchWidthOrHeight;panelSettings.match=.5f;
        panelSettings.themeStyleSheet=Resources.Load<ThemeStyleSheet>("Depth/Theme");
        document=gameObject.AddComponent<UIDocument>();document.panelSettings=panelSettings;
        root=document.rootVisualElement;root.AddToClassList("workspace");root.style.flexGrow=1;
        root.style.position=Position.Absolute;root.style.left=0;root.style.right=0;root.style.top=0;root.style.bottom=0;
        root.styleSheets.Add(Resources.Load<StyleSheet>("Depth/Workspace"));root.style.unityFontDefinition=FontDefinition.FromFont(font);
        backdrop=new DepthBackdrop();root.Add(backdrop);BuildShell();SetTheme(dark);
        var args=Environment.GetCommandLineArgs();for(int i=0;i<args.Length-1;i++)if(args[i]=="--depth-project")projectPath=args[i+1];
        root.RegisterCallback<KeyDownEvent>(evt=>{if(evt.keyCode==KeyCode.Escape){if(modal!=null)CloseModal();else Explore();}});
        StartCoroutine(Boot());
    }
    VisualElement Box(VisualElement parent,string className)
    { var element=new VisualElement();foreach(var c in className.Split(' '))if(c.Length>0)element.AddToClassList(c);parent.Add(element);return element; }
    Label Text(VisualElement parent,string value,string className="")
    { var label=new Label(value){enableRichText=false};foreach(var c in className.Split(' '))if(c.Length>0)label.AddToClassList(c);parent.Add(label);return label; }
    Button Action(VisualElement parent,string value,System.Action clicked,string className="action")
    { var button=new Button(clicked){text=value};foreach(var c in className.Split(' '))if(c.Length>0)button.AddToClassList(c);parent.Add(button);return button; }
    VisualElement Head(VisualElement parent,string title)
    { var h=Box(parent,"panel-head");Text(h,title,"panel-title");Box(h,"spacer");return h; }
    void BuildShell()
    {
        var top=Box(root,"topbar");top.Add(new DepthMark());Text(top,"DEPTH AI","brand");
        Action(top,"Project",OpenProject,"action quiet");Text(top,"Workspace","nav nav-active");Box(top,"spacer");
        search=new TextField{value=""};search.style.width=285;search.tooltip="Search module names, source paths and design notes";top.Add(search);
        search.RegisterValueChangedCallback(e=>{query=e.newValue;UpdateField();});
        Action(top,"Connections",OpenConnections);Action(top,"Light / Dark",()=>SetTheme(!dark));
        previewPanel=Box(root,"panel");var previewHead=Head(previewPanel,"Behavior preview");Text(previewHead,"SOURCE MODEL","badge");previewBody=Box(previewPanel,"content");
        agentPanel=Box(root,"panel");agentTabs=Box(agentPanel,"tabrow");BuildAgentTabs();contextLabel=Text(agentPanel,"Project context","badge");
        feed=new ScrollView();feed.AddToClassList("agent-feed");agentPanel.Add(feed);
        AddFeed("Import a project to explore its actual source. AI work uses the same module index.");
        var input=Box(agentPanel,"composer");composer=new TextField{multiline=true};composer.AddToClassList("composer-input");input.Add(composer);send=Action(input,"Send",AskAgent,"action primary");
        projectPanel=Box(root,"panel");var projectHead=Head(projectPanel,"Project space");projectTitle=projectHead.Q<Label>();Action(projectHead,"All modules",ShowAllModules,"action quiet");Action(projectHead,"Explore",Explore,"action quiet");
        projectBody=Box(projectPanel,"project-body");hierarchy=Box(projectBody,"hierarchy");fieldImage=new Image{scaleMode=ScaleMode.StretchToFill};fieldImage.AddToClassList("field");projectBody.Add(fieldImage);
        field=new DepthSpatialField(fieldImage);field.Picked=Focus;
        focusPanel=Box(root,"panel");focusHeader=Box(focusPanel,"focus-header");focusTabs=Box(focusPanel,"tabrow");
        foreach(var tab in new[]{"Composition","Code","AI notes","Changes"}){var name=tab;Action(focusTabs,name,()=>{activeTab=name;RenderFocus();},"tab");}
        focusBody=Box(focusPanel,"");focusBody.style.flexGrow=1;inspector=Box(focusPanel,"inspector-strip");
        focusPanel.style.display=DisplayStyle.None;
        var status=Box(root,"bottom-status");statusLabel=Text(status,"Starting analysis service…");Box(status,"spacer");Text(status,"LOCAL WORKSPACE  /  PERSONAL VIEW","muted");
        RenderPreview(null);Reflow();
    }
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
        var executable=Application.isEditor?Path.GetFullPath(Path.Combine(Application.dataPath,"../../../src/Depth.Service/bin/Debug/net8.0/Depth.Service.exe")):
            Path.GetFullPath(Path.Combine(Application.dataPath,"../service/Depth.Service.exe"));
        try
        {
            var start=new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.GetDirectoryName(executable)};
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
    string WorkingSample()
    {
        var bundled=Application.isEditor?Path.GetFullPath(Path.Combine(Application.dataPath,"../../../samples/Checkout")):Path.GetFullPath(Path.Combine(Application.dataPath,"../sample"));
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
        if(!ready||busy)return;projectPath=path;Status("Indexing actual project source…");proposal=null;review=null;composition=null;selected=null;focused=false;
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
            if(focused&&selected!=null)Focus(selected.id);else if(selected==null)Explore();
            if(!smoking&&Environment.GetCommandLineArgs().Contains("--depth-smoke")){smoking=true;StartCoroutine(Smoke());}
        }));
    }
    void RenderPreview(BehaviorPreview preview)
    {
        previewBody.Clear();
        if(preview==null)
        {
            Text(previewBody,"Source workspace","cart-title");Text(previewBody,"Import a Unity, Flutter or C# project.","text-body");
            Text(previewBody,"A behavior view requires a source mapping adapter. Projects without an adapter remain fully available in the source/module explorer.","text-body");
            Action(previewBody,"Open project",OpenProject);Action(previewBody,"Open source-linked sample",()=>Import(WorkingSample()));return;
        }
        Text(previewBody,preview.title,"cart-title");
        foreach(var product in preview.products??Array.Empty<PreviewProduct>())
        {
            var row=Box(previewBody,"product");var picture=new Image{image=ImageAt(product.image),scaleMode=ScaleMode.ScaleToFit};picture.AddToClassList("product-image");
            picture.RegisterCallback<PointerDownEvent>(_=>Focus(product.assetId));row.Add(picture);
            var words=Box(row,"");Text(words,product.name,"product-name");Text(words,product.detail,"muted");Text(row,Money(product.price),"product-price");
        }
        Summary(previewBody,"Subtotal",Money(preview.subtotal));Summary(previewBody,"Discount ("+preview.rate.ToString("0.##",CultureInfo.InvariantCulture)+"%)","−"+Money(preview.subtotal-preview.total));
        var total=Box(previewBody,"summary-row total-row");Text(total,"Total");Text(total,Money(preview.total),"total-value");
        var action=Box(previewBody,"coupon-row");Text(action,"WELCOME20","coupon-label");Action(action,"Apply · inspect",()=>Focus(preview.entryId),"action primary");
        Text(previewBody,"Source expression model · runtime not observed","small-note");
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
        var origins=snapshot.cards.Take(150).ToDictionary(c=>c.id,c=>field.Origin(c.id));selected=card;Status("Resolving source-backed composition…");
        StartCoroutine(Api("/composition/"+id,null,json=>
        {
            if(selected==null||selected.id!=id)return;composition=JsonUtility.FromJson<Composition>(json);focused=true;
            contextLabel.text=card.name+" · "+composition.totalRelated+" related elements";RenderFocus();UpdateField();
            if(!reducedMotion)StartCoroutine(FlyMembers(origins));
        },false));
    }
    void Explore(){focused=false;focusPanel.style.display=DisplayStyle.None;contextLabel.text="Project context";if(snapshot!=null)UpdateField();}
    void UpdateField()
    {
        if(snapshot==null||field==null)return;
        var candidates=snapshot.cards.Where(c=>string.IsNullOrEmpty(query)||(c.name+" "+c.purpose+" "+c.group+" "+string.Join(" ",c.anchors.Select(a=>a.path))).IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0)
            .OrderBy(c=>c.id==snapshot.preview?.entryId?0:c.kind=="Method"?1:c.kind=="Field"?2:c.kind=="Image"?3:4).ToArray();
        field.Set(candidates,focused,dark,composition==null?Array.Empty<string>():composition.memberIds);
        hierarchy.Clear();var scroll=new ScrollView();hierarchy.Add(scroll);Text(scroll,"SOURCE GROUPS","section-label");
        foreach(var group in snapshot.groups.Take(12)){var name=group.name;Action(scroll,Short(name,28)+"  "+group.entityIds.Length,()=>{query=name;ShowAllModules();},"tree-item");}
        projectTitle.text=focused?"Project structure":"Project space";
    }
    static string Short(string value,int count)=>value.Length<=count?value:value.Substring(0,count-1)+"…";
    ModuleCard[] Representatives()
    {
        if(selected==null||composition==null)return Array.Empty<ModuleCard>();
        var outgoing=new HashSet<string>(composition.relations.Where(r=>r.from==composition.rootId).Select(r=>r.to));
        return snapshot.cards.Where(c=>c.id==composition.rootId||outgoing.Contains(c.id))
            .OrderBy(c=>c.id==composition.rootId?0:c.kind=="Method"?1:2).Take(5).ToArray();
    }
    void RenderFocus()
    {
        if(selected==null||composition==null)return;focusPanel.style.display=DisplayStyle.Flex;focusHeader.Clear();
        var rootCard=snapshot.cards.First(c=>c.id==composition.rootId);Text(focusHeader,snapshot.preview!=null&&rootCard.id==snapshot.preview.entryId?snapshot.preview.action:rootCard.name,"focus-title");
        Text(focusHeader,rootCard.anchors[0].path+" · "+composition.totalRelated+" source-linked elements · "+rootCard.noteStatus,"focus-subtitle");
        foreach(var button in focusTabs.Children().OfType<Button>())button.EnableInClassList("selected",button.text==activeTab);
        focusBody.Clear();memberViews.Clear();inspector.Clear();
        if(activeTab=="Composition")RenderComposition();else if(activeTab=="Code")ReadSource();else if(activeTab=="AI notes")RenderNotes();else RenderReview();
        if(activeTab!="Changes")RenderInspector();
    }
    void RenderComposition()
    {
        var canvas=Box(focusBody,"composition");var wires=new DepthConnections();canvas.Add(wires);
        var visible=Representatives();
        for(int i=0;i<visible.Length;i++)
        {
            var card=visible[i];var button=Action(canvas,"",()=>{selected=card;RenderFocus();},"module-card");button.EnableInClassList("selected",selected.id==card.id);
            Text(button,DepthSpatialField.Icon(card.kind),"module-icon");Text(button,card.name,"module-title");Text(button,card.purpose.Length>0?Short(card.purpose,65):card.kind+" · line "+card.anchors[0].startLine,"module-subtitle");
            memberViews[card.id]=button;
        }
        void Arrange()
        {
            float w=canvas.contentRect.width,h=canvas.contentRect.height;if(w<100||h<80)return;
            for(int i=0;i<visible.Length;i++)
            {
                var item=memberViews[visible[i].id];float width=Mathf.Clamp(w*.25f,145,210);item.style.width=width;
                item.style.left=i==0?18:i<=2?w*.36f:w-width-15;item.style.top=i==0?Mathf.Max(22,h*.35f):i%2==1?20:Mathf.Max(150,h*.58f);
            }
            wires.Edges.Clear();foreach(var r in composition.relations)
                if(memberViews.TryGetValue(r.from,out var a)&&memberViews.TryGetValue(r.to,out var b))wires.Edges.Add(Tuple.Create(a,b,r.kind));
            wires.MarkDirtyRepaint();
        }
        canvas.RegisterCallback<GeometryChangedEvent>(_=>Arrange());canvas.schedule.Execute(Arrange).StartingIn(25);
        var footer=Box(focusBody,"tabrow");Text(footer,"Source dependencies · not execution order","muted");Box(footer,"spacer");Action(footer,"All "+composition.totalRelated+" elements",()=>ShowModules(composition.memberIds),"action quiet");
    }
    void RenderInspector()
    {
        Text(inspector,selected.name+" / "+selected.kind,"panel-title");
        var propertyCard=selected.properties!=null&&selected.properties.Length>0?selected:snapshot.preview!=null&&composition.memberIds.Contains(snapshot.preview.propertyId)?snapshot.cards.First(c=>c.id==snapshot.preview.propertyId):null;
        if(propertyCard!=null)
        {
            var property=propertyCard.properties[0];var row=Box(inspector,"property-row");Text(row,property.label);
            var input=new TextField{value=draftId==propertyCard.id?draftValue:property.value};input.AddToClassList("property-value");row.Add(input);
            input.RegisterValueChangedCallback(e=>{draftId=propertyCard.id;draftValue=e.newValue;DraftProperty(propertyCard.id,e.newValue);});
            Action(row,"Review change",()=>ProposeProperty(propertyCard.id,input.value),"action primary");Text(row,"Source-bound · "+property.path,"muted");
        }
        else {var row=Box(inspector,"property-row");Text(row,Short(selected.anchors[0].path,65),"muted");Box(row,"spacer");Action(row,"View source",()=>{activeTab="Code";RenderFocus();});}
    }
    void DraftProperty(string id,string value)
    {
        if(snapshot.preview==null)return;int ticket=++draftTicket;double parsed;if(!double.TryParse(value,NumberStyles.Float,CultureInfo.InvariantCulture,out parsed))return;
        StartCoroutine(Api("/property/draft",JsonUtility.ToJson(new PropertyRequest{id=id,value=value,revision=snapshot.revision}),json=>{if(ticket==draftTicket)RenderPreview(JsonUtility.FromJson<BehaviorPreview>(json));},false));
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
        var scroll=new ScrollView();scroll.AddToClassList("content");focusBody.Add(scroll);
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
        Text(caption,"Exact source before/after · compile and behavior validation pending","muted");
        var columns=Box(focusBody,"review-columns");
        var changes=review.changes??Array.Empty<ProposalChange>();
        var before=new TextField{multiline=true,isReadOnly=true,value=string.Join("\n\n",changes.Select(c=>c.path+" / BEFORE\n\n"+c.before))};before.AddToClassList("review-code");before.style.unityFontDefinition=FontDefinition.FromFont(codeFont);columns.Add(before);
        var after=new TextField{multiline=true,isReadOnly=true,value=string.Join("\n\n",changes.Select(c=>c.path+" / AFTER\n\n"+c.after))};after.AddToClassList("review-code");after.style.unityFontDefinition=FontDefinition.FromFont(codeFont);columns.Add(after);
        var controls=Box(inspector,"property-row");reviewAction=Action(controls,"Apply reviewed change",ApplyProposal,"action primary");reviewAction.SetEnabled(proposal!=null&&proposal.revision==snapshot.revision&&!busy);
        Action(controls,"Dismiss",()=>{if(proposal==null)return;StartCoroutine(Api("/dismiss",JsonUtility.ToJson(new ApplyRequest{id=proposal.id}),_=>{proposal=null;review=null;activeTab="Composition";RenderFocus();RenderPreview(snapshot.preview);}));});
        Text(controls,"Source hashes checked · backup + reindex","muted");
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
        else StartCoroutine(Api("/propose",JsonUtility.ToJson(new PromptRequest{prompt=prompt+"\nSelected IDs: "+string.Join(",",ids)}),json=>ReviewProposal(JsonUtility.FromJson<Proposal>(json))));
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
        var executable=Path.GetFullPath(Path.Combine(Application.dataPath,"../service/Depth.Service.exe"));if(Application.isEditor)executable=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../src/Depth.Service/bin/Debug/net8.0/Depth.Service.exe"));
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
        var body=OpenModal("Indexed modules");var scroll=new ScrollView();scroll.style.maxHeight=560;body.Add(scroll);var set=new HashSet<string>(ids);
        foreach(var card in snapshot.cards.Where(c=>set.Contains(c.id)).Take(250)){var id=card.id;Action(scroll,card.name+"  /  "+card.kind+"  /  "+Short(card.anchors[0].path,55),()=>{CloseModal();Focus(id);},"tree-item");}
        Text(body,"Showing up to250 indexed elements. Use search to narrow large projects.","small-note");
    }
    void SetTheme(bool value){dark=value;root.EnableInClassList("dark",dark);backdrop.Dark=dark;backdrop.MarkDirtyRepaint();PlayerPrefs.SetInt("depth.theme.dark",dark?1:0);if(snapshot!=null)UpdateField();}
    void Reflow()
    {
        float w=root.contentRect.width,h=root.contentRect.height;if(w<100||h<100)return;
        if(Mathf.Abs(previousWidth-w)<.1f&&Mathf.Abs(previousHeight-h)<.1f&&Mathf.Abs(previousProgress-focusProgress)<.001f)return;
        previousWidth=w;previousHeight=h;previousProgress=focusProgress;float t=focusProgress*focusProgress*(3-2*focusProgress);
        float left=24,top=86,gap=16,leftWidth=(w-64)*.38f,right=left+leftWidth+gap,rightWidth=w-right-24;
        float available=h-top-46,upper=available*.76f,previewHeight=Mathf.Lerp(available*.59f,upper*.62f,t),agentTop=top+previewHeight+gap;
        Place(previewPanel,left,top,leftWidth,previewHeight);Place(agentPanel,left,agentTop,leftWidth,Mathf.Lerp(available-previewHeight-gap,upper-previewHeight-gap,t));
        var x=Mathf.Lerp(right,left,t);var y=Mathf.Lerp(top,top+upper+gap,t);var pw=Mathf.Lerp(rightWidth,w-48,t);var ph=Mathf.Lerp(available,available-upper-gap,t);
        Place(projectPanel,x,y,pw,ph);Place(focusPanel,right,top,rightWidth,upper);
        hierarchy.style.display=focused?DisplayStyle.Flex:DisplayStyle.None;fieldImage.style.left=focused?205:0;focusPanel.style.opacity=t;
    }
    static void Place(VisualElement element,float x,float y,float w,float h){element.style.left=x;element.style.top=y;element.style.width=w;element.style.height=Mathf.Max(70,h);}
    void Update()
    {
        focusProgress=Mathf.MoveTowards(focusProgress,focused?1:0,Time.unscaledDeltaTime/(reducedMotion ? .01f : .65f));Reflow();
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
            Text(ghost,snapshot.cards.First(c=>c.id==pair.Key).name,"module-title");ghost.pickingMode=PickingMode.Ignore;target.style.opacity=0;
            ghosts.Add(Tuple.Create(ghost,target,root.WorldToLocal(origin.Value),root.WorldToLocal(destination)));
        }
        float elapsed=0;while(elapsed<.62f){elapsed+=Time.unscaledDeltaTime;float t=Mathf.SmoothStep(0,1,elapsed/.62f);foreach(var ghost in ghosts){var p=Vector2.Lerp(ghost.Item3,ghost.Item4,t);ghost.Item1.style.left=p.x;ghost.Item1.style.top=p.y;ghost.Item1.style.opacity=1-t*.25f;}yield return null;}
        foreach(var ghost in ghosts){ghost.Item1.RemoveFromHierarchy();ghost.Item2.style.opacity=1;}
    }
    IEnumerator Smoke()
    {
        var directory=Path.GetFullPath(Path.Combine(Application.dataPath,"../proof"));Directory.CreateDirectory(directory);
        yield return new WaitForSeconds(1.5f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"01-overview.png"));yield return new WaitForSeconds(.5f);
        if(snapshot.preview!=null)Focus(snapshot.preview.entryId);yield return new WaitForSeconds(2);
        ScreenCapture.CaptureScreenshot(Path.Combine(directory,"02-focused.png"));yield return new WaitForSeconds(.5f);
        var result=new NativeProof{root=projectPath,cards=snapshot.cards.Length,relations=snapshot.relations.Length,focused=focused,previewTotal=snapshot.preview==null?0:snapshot.preview.total,
            uiWidth=root.contentRect.width,uiHeight=root.contentRect.height,projectWidth=projectPanel.layout.width,fieldWidth=fieldImage.layout.width};
        if(snapshot.preview!=null&&Path.GetFileName(projectPath).StartsWith("native-smoke-",StringComparison.Ordinal)&&File.Exists(Path.Combine(projectPath,".allow-smoke-apply")))
        {
            var propertyId=snapshot.preview.propertyId;bool completed=false;
            yield return Api("/property/draft",JsonUtility.ToJson(new PropertyRequest{id=propertyId,value="25",revision=snapshot.revision}),json=>{var preview=JsonUtility.FromJson<BehaviorPreview>(json);RenderPreview(preview);result.draftTotal=preview.total;});
            yield return Api("/property/propose",JsonUtility.ToJson(new PropertyRequest{id=propertyId,value="25",revision=snapshot.revision}),json=>proposal=JsonUtility.FromJson<Proposal>(json));
            if(proposal!=null){yield return Api("/proposals/"+proposal.id,null,json=>{review=JsonUtility.FromJson<ProposalPreview>(json);activeTab="Changes";RenderFocus();});yield return new WaitForSeconds(.5f);ScreenCapture.CaptureScreenshot(Path.Combine(directory,"03-review.png"));yield return new WaitForSeconds(.5f);}
            if(proposal!=null)yield return Api("/apply",JsonUtility.ToJson(new ApplyRequest{id=proposal.id,approved=true}),_=>{completed=true;result.applied=true;});
            if(completed)yield return Api("/view",null,json=>{var updated=JsonUtility.FromJson<WorkspaceView>(json);result.updatedTotal=updated.preview.total;result.stableId=updated.preview.propertyId==propertyId;});
        }
        File.WriteAllText(Path.Combine(directory,"native.json"),JsonUtility.ToJson(result,true));
        yield return new WaitForSeconds(1);Application.Quit(result.focused&&result.cards>0&&(result.applied?result.updatedTotal==90&&result.stableId:true)?0:2);
    }
    [Serializable] sealed class NativeProof { public string root;public int cards,relations;public bool focused,applied,stableId;public double previewTotal,draftTotal,updatedTotal;public float uiWidth,uiHeight,projectWidth,fieldWidth; }
    void OnDestroy(){field?.Dispose();foreach(var image in images.Values)Destroy(image);if(service!=null){try{if(!service.HasExited)service.Kill();}catch{}service.Dispose();}if(panelSettings!=null)Destroy(panelSettings);if(font!=null)Destroy(font);if(codeFont!=null)Destroy(codeFont);}
}
