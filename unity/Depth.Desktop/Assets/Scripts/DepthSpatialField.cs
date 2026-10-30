using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using DepthClient;
using UnityEngine;
using UnityEngine.UIElements;

// Perspective PC projection of the shared index. Exactly one body per visible source ID.
public sealed class DepthSpatialField : IDisposable
{
    sealed class Node {
        public GameObject root,face,ghost,shadow; public VisualElement ui; public float baseScale=1; public ModuleCard card; public Vector3 home; public Quaternion rotation; public Vector2 size;
        public RenderTexture texture; public PanelSettings settings; public int slot; public float amount;
    }
    readonly GameObject root,previewFrame;
    int staticMaterials,staticMeshes; readonly Camera camera; readonly Image surface; readonly Font font;
    readonly Dictionary<string,Node> nodes=new Dictionary<string,Node>();
    readonly List<Material> materials=new List<Material>(); readonly List<Mesh> meshes=new List<Mesh>(); readonly List<LineRenderer> wires=new List<LineRenderer>();
    RenderTexture texture; Relation[] relations=Array.Empty<Relation>();
    string selection="",signature=""; bool dark,dragging,moved; Vector2 dragStart; float yaw,pitch,zoom=1; int page;
    Rect previewRect,focusRect; bool covered;
    public Action<string> Picked; public Func<string,Texture2D> LoadImage; public bool ReducedMotion;
    public bool Visible {set {camera.enabled=value;}}
    public int ShownCount=>nodes.Count; public string[] ShownIds=>nodes.Keys.ToArray(); public float CameraYaw=>yaw; public bool IsDragging=>dragging;
    static readonly Vector2[] Slots={new Vector2(.83f,.79f),new Vector2(.17f,.78f),new Vector2(.40f,.88f),new Vector2(.55f,.89f),new Vector2(.68f,.88f),new Vector2(.875f,.51f),new Vector2(.85f,.255f),new Vector2(.12f,.50f),new Vector2(.25f,.27f),new Vector2(.255f,.53f)};
    public DepthSpatialField(Image image) {
        surface=image;root=new GameObject("Source-backed spatial workspace");
        var cam=new GameObject("Perspective workspace camera");cam.transform.SetParent(root.transform);camera=cam.AddComponent<Camera>();
        camera.cullingMask=1<<8;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.87f,.90f,.94f);camera.nearClipPlane=.1f;camera.farClipPlane=100;camera.fieldOfView=38;camera.transform.position=new Vector3(0,0,-20);
        font=Font.CreateDynamicFontFromOSFont(new[]{"Arial","Segoe UI"},32);
        Quad(root,"Daylit studio",new Vector3(0,0,25),new Vector2(60,34),Mat("SpatialStudio",Color.white));
        previewFrame=new GameObject("Preview glass housing");previewFrame.layer=8;previewFrame.transform.SetParent(root.transform);Shell(previewFrame,Vector2.one,new Color(.60f,.77f,1));
        surface.RegisterCallback<PointerDownEvent>(e=>{if(e.button!=0)return;BeginDrag(e.position);surface.CapturePointer(e.pointerId);});
        surface.RegisterCallback<PointerMoveEvent>(e=>MoveDrag(e.position,(e.pressedButtons&1)!=0));
        surface.RegisterCallback<PointerUpEvent>(e=>{if(e.button!=0)return;bool click=EndDrag();surface.ReleasePointer(e.pointerId);if(click)PickAt(e.localPosition);});
        surface.RegisterCallback<PointerCancelEvent>(_=>CancelDrag());surface.RegisterCallback<PointerCaptureOutEvent>(e=>{if(e.target==surface)CancelDrag();});surface.RegisterCallback<PointerLeaveEvent>(_=>CancelDrag());
        surface.RegisterCallback<WheelEvent>(e=>{zoom=Mathf.Clamp(zoom-e.delta.y*.007f,.92f,1.09f);UpdateCamera();e.StopPropagation();});
        surface.RegisterCallback<GeometryChangedEvent>(_=>Resize());
        var floor=GameObject.CreatePrimitive(PrimitiveType.Plane);floor.layer=8;floor.name="Studio floor";floor.transform.SetParent(root.transform);floor.transform.position=new Vector3(0,-6.5f,16);floor.transform.localScale=new Vector3(12,1,12);UnityEngine.Object.Destroy(floor.GetComponent<Collider>());floor.GetComponent<Renderer>().sharedMaterial=Mat("StudioFloor",Color.white);
        staticMaterials=materials.Count;staticMeshes=meshes.Count;
    }
    public void BeginDrag(Vector2 p){dragging=true;moved=false;dragStart=p;}
    public void MoveDrag(Vector2 p,bool pressed){if(!pressed){CancelDrag();return;}if(!dragging)return;var d=p-dragStart;if(!moved&&d.magnitude<6)return;moved=true;yaw=Mathf.Clamp(yaw-d.x*.018f,-5,5);pitch=Mathf.Clamp(pitch+d.y*.012f,-3,3);dragStart=p;UpdateCamera();}
    public bool EndDrag(){bool click=dragging&&!moved;dragging=false;return click;}
    public void CancelDrag(){dragging=false;}
    public void ResetView(){yaw=pitch=0;zoom=1;CancelDrag();UpdateCamera();}
    void UpdateCamera(){camera.transform.rotation=Quaternion.Euler(pitch,yaw,0);camera.fieldOfView=38/zoom;}
    public void NextPage(){page++;signature="";}
    Material Mat(string shader,Color color){var m=new Material(Resources.Load<Shader>("Depth/Shaders/"+shader));if(m.HasProperty("_Color"))m.color=color;materials.Add(m);return m;}
    Material Ink(Color color){var m=new Material(Shader.Find("Sprites/Default"));m.color=color;materials.Add(m);return m;}
    GameObject Quad(GameObject parent,string name,Vector3 p,Vector2 size,Material material){var q=GameObject.CreatePrimitive(PrimitiveType.Quad);UnityEngine.Object.Destroy(q.GetComponent<Collider>());q.name=name;q.layer=8;q.transform.SetParent(parent.transform,false);q.transform.localPosition=p;q.transform.localScale=new Vector3(size.x,size.y,1);q.GetComponent<Renderer>().sharedMaterial=material;return q;}
    static string Role(ModuleCard c){var n=c.name.ToLowerInvariant();return n.Contains("valid")?"validation":c.kind=="Field"||n.Contains("state")?"state":n.StartsWith("apply")?"action":c.kind=="Image"||n.Contains("view")||n.Contains("settotal")?"view":"logic";}
    static Color Tint(ModuleCard c)=>Role(c)=="state"?new Color(.24f,.67f,.73f):Role(c)=="logic"?new Color(.50f,.39f,.88f):new Color(.21f,.50f,.96f);
    public void Set(ModuleCard[] cards,bool focused,bool isDark,IEnumerable<string> related,Relation[] sourceRelations=null,string entryId=null,string propertyId=null){
        relations=sourceRelations??Array.Empty<Relation>();var ordered=new List<ModuleCard>();
        void Take(Func<ModuleCard,bool> p){var c=cards.FirstOrDefault(x=>!ordered.Contains(x)&&p(x));if(c!=null)ordered.Add(c);}
        Take(c=>c.id==entryId);
        var shared=cards.Where(c=>Role(c)=="logic"&&c.kind=="Method").OrderByDescending(c=>relations.Count(r=>r.to==c.id&&r.kind=="calls")).FirstOrDefault();if(shared!=null)ordered.Add(shared);
        Take(c=>c.id==propertyId);Take(c=>c.properties.Length>0);Take(c=>c.kind=="NamedType"&&Role(c)=="view");Take(c=>Role(c)=="validation");Take(c=>Role(c)=="view"&&c.kind=="Method");Take(c=>Role(c)=="state"&&c.kind=="NamedType");Take(c=>c.kind=="Image");Take(c=>c.kind=="Image");ordered.AddRange(cards.Where(c=>!ordered.Contains(c)));
        if(selection.Length>0&&ordered.Any(c=>c.id==selection)&&!ordered.Skip(page*10).Take(10).Any(c=>c.id==selection))page=ordered.FindIndex(c=>c.id==selection)/10;
        page%=Mathf.Max(1,Mathf.CeilToInt(ordered.Count/10f));var shown=ordered.Skip(page*10).Take(10).ToArray();
        var key=string.Join("|",shown.Select(c=>c.id+":"+c.anchors[0].contentHash+":"+c.purpose+":"+string.Join(",",c.properties.Select(p=>p.value))))+isDark;dark=isDark;
        if(signature!=key){signature=key;foreach(var n in nodes.Values)DestroyNode(n);nodes.Clear();foreach(var l in wires)UnityEngine.Object.Destroy(l.gameObject);wires.Clear();
            for(int i=materials.Count-1;i>=staticMaterials;i--){UnityEngine.Object.Destroy(materials[i]);materials.RemoveAt(i);}for(int i=meshes.Count-1;i>=staticMeshes;i--){UnityEngine.Object.Destroy(meshes[i]);meshes.RemoveAt(i);}
            for(int i=0;i<shown.Length;i++){var n=CreateNode(shown[i],i);nodes[n.card.id]=n;}LayoutHomes(true);
            foreach(var r in relations.Where(r=>r.kind!="contains"&&nodes.ContainsKey(r.from)&&nodes.ContainsKey(r.to)).GroupBy(r=>r.from+"|"+r.to).Select(g=>g.First()).Take(24)){var l=Line(root,"Source relation",new Color(.37f,.58f,.83f,.7f),.018f);l.gameObject.AddComponent<DepthSpatialRelation>().relation=r;wires.Add(l);}
        }Resize();
    }
    Node CreateNode(ModuleCard card,int slot){
        var obj=new GameObject(card.name+" / "+card.id);obj.layer=8;obj.transform.SetParent(root.transform);var n=new Node{root=obj,card=card,slot=slot};
        float w=slot<2?4.05f:slot==7?3.1f:slot>=8?2.1f:2.9f,h=slot<2?2.95f:slot==7?2.35f:slot>=8?2.15f:2.1f;n.size=new Vector2(w,h);Shell(obj,n.size,Tint(card));
        var hit=obj.AddComponent<BoxCollider>();hit.size=new Vector3(w,h,.32f);obj.AddComponent<DepthModuleIdentity>().Id=card.id;
        n.texture=new RenderTexture(600,Mathf.RoundToInt(600*h/w),0,RenderTextureFormat.ARGB32){antiAliasing=4};n.texture.Create();
        var content=new GameObject("Live indexed module face");content.transform.SetParent(obj.transform,false);n.settings=ScriptableObject.CreateInstance<PanelSettings>();n.settings.themeStyleSheet=Resources.Load<ThemeStyleSheet>("Depth/Theme");n.settings.scaleMode=PanelScaleMode.ConstantPixelSize;n.settings.targetTexture=n.texture;n.settings.sortingOrder=-50;
        var doc=content.AddComponent<UIDocument>();doc.panelSettings=n.settings;var ui=doc.rootVisualElement;n.ui=ui;ui.style.width=600;ui.style.height=n.texture.height;ui.style.paddingTop=28;ui.style.paddingBottom=25;ui.style.paddingLeft=30;ui.style.paddingRight=30;
        ui.style.backgroundColor=dark?new Color(.12f,.19f,.30f,.97f):new Color(.93f,.96f,1,.94f);ui.style.borderTopLeftRadius=ui.style.borderTopRightRadius=ui.style.borderBottomLeftRadius=ui.style.borderBottomRightRadius=22;ui.style.unityFontDefinition=FontDefinition.FromFont(font);ui.style.color=dark?new Color(.85f,.92f,1):new Color(.09f,.16f,.29f);
        var heading=new VisualElement();heading.style.flexDirection=FlexDirection.Row;heading.style.alignItems=Align.Center;ui.Add(heading);
        var icon=new Image{image=Resources.Load<Texture2D>("Depth/Icons/"+Role(card)),scaleMode=ScaleMode.ScaleToFit};icon.style.width=84;icon.style.height=84;icon.style.marginRight=18;heading.Add(icon);var words=new VisualElement();words.style.flexGrow=1;words.style.minWidth=0;heading.Add(words);Label(words,card.name,45,true);Label(words,Path.GetFileName(card.anchors[0].path),30,false,.65f);
        var divider=new VisualElement();divider.style.height=1;divider.style.marginTop=18;divider.style.backgroundColor=new Color(.49f,.64f,.84f,.25f);ui.Add(divider);
        var body=new VisualElement();body.style.flexGrow=1;body.style.paddingTop=20;body.style.minHeight=0;ui.Add(body);
        if(card.kind=="Image"){var pic=new Image{image=LoadImage?.Invoke(card.anchors[0].path),scaleMode=ScaleMode.ScaleToFit};pic.style.flexGrow=1;pic.style.minHeight=0;body.Add(pic);}
        else if(card.properties.Length>0){Label(body,card.properties[0].value,82,true);Label(body,"Source value",30,false,.65f);}
        else {Label(body,Short(string.IsNullOrEmpty(card.purpose)?card.kind+" · source indexed":card.purpose,slot<2?100:58),34,false);if(slot==0){int calls=relations.Count(r=>r.from==card.id&&r.kind.IndexOf("call",StringComparison.OrdinalIgnoreCase)>=0);if(calls>0)Label(body,calls+" source calls",30,false,.65f);}}
        var footer=new VisualElement();footer.style.flexDirection=FlexDirection.Row;footer.style.justifyContent=Justify.SpaceBetween;ui.Add(footer);Label(footer,card.kind,27,false,.6f);int count=relations.Count(r=>r.to==card.id&&r.kind!="contains");Label(footer,count>1?count+" references":"L"+card.anchors[0].startLine,27,false,.6f);
        n.texture.filterMode=FilterMode.Trilinear;n.texture.useMipMap=true;n.texture.autoGenerateMips=true;
        var fm=Mat("SpatialFace",Color.white);fm.mainTexture=n.texture;n.face=Quad(obj,"Readable source face",new Vector3(0,0,-.19f),n.size-new Vector2(.14f,.14f),fm);
        n.rotation=Quaternion.Euler(slot%2==0?-5:4,slot==0?-18:slot==1?18:slot<5?-10:slot==7?15:-12,slot==0?2:slot==1?-4:slot%2==0?2:-2);
        n.ghost=new GameObject("Home outline / "+card.id);n.ghost.layer=8;n.ghost.transform.SetParent(root.transform);Ring(n.ghost,n.size,.015f,new Color(.46f,.64f,.89f,.45f),0);n.ghost.SetActive(false);n.shadow=Quad(root,"Floor shadow / "+card.id,Vector3.zero,new Vector2(w*1.3f,3),Mat("ContactShadow",Color.white));n.shadow.transform.localRotation=Quaternion.Euler(90,0,0);return n;
    }
    static void Label(VisualElement p,string value,int size,bool bold,float opacity=1){var l=new Label(value){enableRichText=false};l.style.marginTop=0;l.style.marginBottom=6;l.style.marginLeft=0;l.style.marginRight=0;l.style.paddingTop=0;l.style.paddingBottom=0;l.style.fontSize=size;l.style.whiteSpace=WhiteSpace.Normal;l.style.flexShrink=0;l.style.opacity=opacity;if(bold)l.style.unityFontStyleAndWeight=FontStyle.Bold;p.Add(l);}
    void Shell(GameObject p,Vector2 size,Color tint){var shell=new GameObject("Beveled glass body");shell.layer=8;shell.transform.SetParent(p.transform,false);shell.AddComponent<MeshFilter>().sharedMesh=RoundedBox(new Vector3(size.x,size.y,.28f),.12f);shell.AddComponent<MeshRenderer>().sharedMaterial=Mat("SpatialGlass",new Color(tint.r*.35f+.6f,tint.g*.25f+.7f,.98f,.58f));Ring(p,size-new Vector2(.04f,.04f),.025f,new Color(.97f,.99f,1,.95f),-.155f);Ring(p,size-new Vector2(.04f,.04f),.037f,new Color(tint.r,tint.g,tint.b,.75f),.11f);Ring(p,size-new Vector2(.11f,.11f),.012f,new Color(1,1,1,.8f),-.175f);Quad(p,"Soft spatial shadow",new Vector3(.09f,-.12f,.3f),size*1.18f,Mat("ContactShadow",Color.white));}
    LineRenderer Line(GameObject p,string name,Color color,float width){var o=new GameObject(name);o.layer=8;o.transform.SetParent(p.transform,false);var l=o.AddComponent<LineRenderer>();l.useWorldSpace=false;l.sharedMaterial=Ink(color);l.startWidth=l.endWidth=width;l.numCornerVertices=4;l.numCapVertices=4;return l;}
    void Ring(GameObject p,Vector2 size,float thickness,Color color,float z){var l=Line(p,"Polished edge",color,thickness);l.loop=true;var points=new List<Vector3>();float radius=Mathf.Min(.16f,Mathf.Min(size.x,size.y)*.13f);for(int c=0;c<4;c++){float a=c*90;var center=new Vector2(c==0||c==3?size.x/2-radius:-size.x/2+radius,c<2?size.y/2-radius:-size.y/2+radius);for(int j=0;j<=8;j++){float angle=(a+j*90f/8)*Mathf.Deg2Rad;points.Add(new Vector3(center.x+Mathf.Cos(angle)*radius,center.y+Mathf.Sin(angle)*radius,z));}}l.positionCount=points.Count;l.SetPositions(points.ToArray());}
    void LayoutHomes(bool immediate){var rot=camera.transform.rotation;float fov=camera.fieldOfView;camera.transform.rotation=Quaternion.identity;camera.fieldOfView=38;
        foreach(var n in nodes.Values){float depth=n.slot<2?18.5f:n.slot<5?24:n.slot>=8?20:21;n.home=camera.ViewportToWorldPoint(new Vector3(Slots[n.slot].x,Slots[n.slot].y,depth));n.baseScale=Mathf.Min(1,camera.aspect/1.72f);n.ghost.transform.SetPositionAndRotation(n.home,n.rotation);n.ghost.transform.localScale=Vector3.one*n.baseScale;n.shadow.transform.position=new Vector3(n.home.x,-6.46f,n.home.z);if(immediate)n.root.transform.SetPositionAndRotation(n.home,n.rotation);}camera.transform.rotation=rot;camera.fieldOfView=fov;}
    public void SetFrames(Rect preview,Rect focus,bool faceCovered){previewRect=preview;focusRect=focus;covered=faceCovered;}
    Vector3 ScreenPoint(Vector2 p,float depth){var r=surface.worldBound;return camera.ViewportToWorldPoint(new Vector3((p.x-r.x)/r.width,1-(p.y-r.y)/r.height,depth));}
    Vector2 FrameSize(Rect r,float depth){float h=2*depth*Mathf.Tan(camera.fieldOfView*.5f*Mathf.Deg2Rad);return new Vector2(r.width/surface.worldBound.width*h*camera.aspect,r.height/surface.worldBound.height*h);}
    public void Select(string id){selection=id??"";}
    public void Tick(float delta){
        if(dragging&&!Input.GetMouseButton(0))CancelDrag();if(surface.worldBound.width<10||surface.resolvedStyle.display==DisplayStyle.None)return;
        if(previewRect.width>10){previewFrame.transform.SetPositionAndRotation(ScreenPoint(previewRect.center,17),camera.transform.rotation);var s=FrameSize(previewRect,17);previewFrame.transform.localScale=new Vector3(s.x+.10f,s.y+.10f,1);}
        foreach(var n in nodes.Values){bool chosen=n.card.id==selection;n.amount=Mathf.MoveTowards(n.amount,chosen?1:0,delta/(ReducedMotion?.01f:.85f));float t=Mathf.SmoothStep(0,1,n.amount);var bob=ReducedMotion?Vector3.zero:new Vector3(0,Mathf.Sin(Time.unscaledTime*.65f+n.slot*1.6f)*.045f,Mathf.Sin(Time.unscaledTime*.4f+n.slot)*.025f);var target=n.home+bob;var scale=Vector3.one*n.baseScale;
            if(focusRect.width>10&&t>0){target=Vector3.Lerp(target,ScreenPoint(focusRect.center,13),t);var s=FrameSize(focusRect,13);scale=Vector3.Lerp(Vector3.one*n.baseScale,new Vector3((s.x+.12f)/n.size.x,(s.y+.12f)/n.size.y,1),t);}n.root.transform.position=target;n.root.transform.rotation=Quaternion.Slerp(n.rotation,camera.transform.rotation,t);n.root.transform.localScale=scale;n.face.SetActive(!(chosen&&covered));n.ghost.SetActive(chosen&&t>.05f);}
        foreach(var l in wires){var r=l.GetComponent<DepthSpatialRelation>().relation;l.gameObject.SetActive(selection.Length>0&&(r.from==selection||r.to==selection));if(!l.gameObject.activeSelf)continue;var from=nodes[r.from];var to=nodes[r.to];var a=from.root.transform.position;var b=to.root.transform.position;float sign=b.x>a.x?1:-1;a+=from.root.transform.right*from.size.x*.49f*from.root.transform.localScale.x*sign;b-=to.root.transform.right*to.size.x*.49f*to.root.transform.localScale.x*sign;var control=(a+b)*.5f+Vector3.forward*3;var points=new List<Vector3>();for(int i=0;i<=28;i++){float t=i/28f;points.Add((1-t)*(1-t)*a+2*(1-t)*t*control+t*t*b);}var d=(b-control).normalized;var side=Vector3.Cross(d,camera.transform.forward).normalized*.08f;points.Add(b-d*.20f+side);points.Add(b);points.Add(b-d*.20f-side);l.positionCount=points.Count;l.SetPositions(points.ToArray());}
    }
    public bool PickAt(Vector2 p){var r=surface.contentRect;var ray=camera.ViewportPointToRay(new Vector3(p.x/r.width,1-p.y/r.height,0));Physics.SyncTransforms();if(!Physics.Raycast(ray,out var hit,100,1<<8))return false;var tag=hit.collider.GetComponent<DepthModuleIdentity>();if(tag==null)return false;Picked?.Invoke(tag.Id);return true;}
    public bool PickSource(string id){var p=Origin(id);return p.HasValue&&PickAt(p.Value-surface.worldBound.position);}
    public Vector2? Origin(string id){if(!nodes.TryGetValue(id,out var n))return null;var p=camera.WorldToViewportPoint(n.root.transform.position);var r=surface.worldBound;return new Vector2(r.x+p.x*r.width,r.y+(1-p.y)*r.height);}
    public Vector3 PositionOf(string id)=>nodes[id].root.transform.position;
    public void Validate(Rect clearPreview){if(nodes.Count==0)throw new Exception("Spatial source set empty");foreach(var n in nodes.Values){foreach(var label in n.ui.Query<Label>().ToList()){var b=label.worldBound;if(b.yMax>n.ui.worldBound.yMax+1||b.xMax>n.ui.worldBound.xMax+1)throw new Exception("Module face text clipped: "+n.card.name+" / "+label.text);}
        var p=Origin(n.card.id).Value;if(!surface.worldBound.Contains(p))throw new Exception("Spatial module offscreen: "+n.card.name);if(clearPreview.Contains(p)&&n.card.id!=selection)throw new Exception("Spatial module hidden by preview: "+n.card.name);}}
    void Resize(){int w=Mathf.Clamp((int)surface.contentRect.width,256,2560),h=Mathf.Clamp((int)surface.contentRect.height,128,1600);if(texture!=null&&texture.width==w&&texture.height==h)return;if(texture!=null){camera.targetTexture=null;texture.Release();UnityEngine.Object.Destroy(texture);}texture=new RenderTexture(w,h,24){antiAliasing=4};texture.Create();camera.targetTexture=texture;camera.aspect=(float)w/h;surface.image=texture;LayoutHomes(true);}
    Mesh RoundedBox(Vector3 size,float radius){var verts=new List<Vector3>();var normals=new List<Vector3>();var indices=new List<int>();int steps=12;radius=Mathf.Min(radius,size.z*.5f);foreach(var axis in new[]{Vector3.right,Vector3.left,Vector3.up,Vector3.down,Vector3.forward,Vector3.back}){var u=Vector3.Cross(axis,Mathf.Abs(axis.y)>.5f?Vector3.forward:Vector3.up);var v=Vector3.Cross(axis,u);int start=verts.Count;for(int y=0;y<=steps;y++)for(int x=0;x<=steps;x++){var p=Vector3.Scale(axis+u*(x*2f/steps-1)+v*(y*2f/steps-1),size*.5f);var inner=new Vector3(Mathf.Clamp(p.x,-size.x*.5f+radius,size.x*.5f-radius),Mathf.Clamp(p.y,-size.y*.5f+radius,size.y*.5f-radius),Mathf.Clamp(p.z,-size.z*.5f+radius,size.z*.5f-radius));var normal=(p-inner).normalized;verts.Add(inner+normal*radius);normals.Add(normal);}for(int y=0;y<steps;y++)for(int x=0;x<steps;x++){int a=start+y*(steps+1)+x,b=a+1,c=a+steps+1,d=c+1;indices.AddRange(new[]{a,b,d,a,d,c});}}var mesh=new Mesh();mesh.SetVertices(verts);mesh.SetNormals(normals);mesh.SetTriangles(indices,0);mesh.RecalculateBounds();meshes.Add(mesh);return mesh;}
    void DestroyNode(Node n){if(n.root!=null){var doc=n.root.GetComponentInChildren<UIDocument>();if(doc!=null)doc.enabled=false;UnityEngine.Object.Destroy(n.root);}if(n.ghost!=null)UnityEngine.Object.Destroy(n.ghost);if(n.shadow!=null)UnityEngine.Object.Destroy(n.shadow);if(n.settings!=null)UnityEngine.Object.Destroy(n.settings);if(n.texture!=null){n.texture.Release();UnityEngine.Object.Destroy(n.texture);}}
    public void Dispose(){foreach(var n in nodes.Values)DestroyNode(n);if(texture!=null){texture.Release();UnityEngine.Object.Destroy(texture);}foreach(var m in materials)UnityEngine.Object.Destroy(m);foreach(var m in meshes)UnityEngine.Object.Destroy(m);UnityEngine.Object.Destroy(root);UnityEngine.Object.Destroy(font);}
    static string Short(string v,int max)=>v.Length<=max?v:v.Substring(0,max-1)+"…";
}
public sealed class DepthModuleIdentity:MonoBehaviour {public string Id;}
public sealed class DepthSpatialRelation:MonoBehaviour {public Relation relation;}
