using System;
using System.Collections.Generic;
using System.Linq;
using DepthClient;
using UnityEngine;
using UnityEngine.UIElements;

/// <summary>Real indexed IDs occupy the native 3D field. Only a bounded set is rendered; focused editing remains in screen-space UI.</summary>
public sealed class DepthSpatialField : IDisposable
{
    readonly GameObject root;
    readonly Camera camera;
    readonly Image surface;
    readonly List<GameObject> tiles=new List<GameObject>();
    readonly Dictionary<string,GameObject> instances=new Dictionary<string,GameObject>();
    readonly List<Material> materials=new List<Material>();
    readonly Font font;
    RenderTexture texture;
    ModuleCard[] cards=Array.Empty<ModuleCard>();
    HashSet<string> focused=new HashSet<string>();
    bool docked,dark;
    public Action<string> Picked;
    public DepthSpatialField(Image image)
    {
        surface=image;root=new GameObject("Source-backed module field");
        var cameraObject=new GameObject("Module field camera");cameraObject.transform.SetParent(root.transform);
        camera=cameraObject.AddComponent<Camera>();camera.clearFlags=CameraClearFlags.SolidColor;camera.cullingMask=1<<8;camera.nearClipPlane=.1f;camera.farClipPlane=100;
        font=Font.CreateDynamicFontFromOSFont(new[]{"Segoe UI","Arial"},48);
        surface.RegisterCallback<PointerDownEvent>(evt=>
        {
            if(evt.button!=0||texture==null)return;
            var rect=surface.contentRect;var point=evt.localPosition;
            var ray=camera.ViewportPointToRay(new Vector3(point.x/rect.width,1-point.y/rect.height,0));
            if(Physics.Raycast(ray,out var hit,100,1<<8)) { var tag=hit.collider.GetComponent<DepthModuleIdentity>();if(tag!=null)Picked?.Invoke(tag.Id); }
        });
        surface.RegisterCallback<GeometryChangedEvent>(_=>Resize());
    }
    public void Set(ModuleCard[] modules,bool isDocked,bool isDark,IEnumerable<string> selected)
    {
        cards=modules??Array.Empty<ModuleCard>();docked=isDocked;dark=isDark;focused=new HashSet<string>(selected??Array.Empty<string>());
        foreach(var tile in tiles)UnityEngine.Object.Destroy(tile);tiles.Clear();instances.Clear();
        foreach(var material in materials)UnityEngine.Object.Destroy(material);materials.Clear();
        var visible=cards.Take(docked?40:96).ToArray();
        for(int i=0;i<visible.Length;i++)
        {
            var card=visible[i];int column=docked?i%20:i%4,row=docked?i/20:i/4;
            var item=GameObject.CreatePrimitive(PrimitiveType.Cube);item.name=card.id;item.layer=8;item.transform.SetParent(root.transform);
            item.transform.localPosition=docked?new Vector3((column-4)*2.45f,-row*1.7f,row*1.4f):new Vector3((column-1.5f)*2.55f,2.8f-(row%3)*2.25f,(row/3)*4.5f);
            item.transform.localRotation=Quaternion.Euler(docked?0:2,docked?0:-8,0);item.transform.localScale=new Vector3(2.15f,1.5f,.13f);
            var identity=item.AddComponent<DepthModuleIdentity>();identity.Id=card.id;
            bool selectedCard=focused.Contains(card.id);
            var material=new Material(Shader.Find("Unlit/Color"));material.color=dark?new Color(.075f,.13f,.24f):new Color(.94f,.965f,1f);
            if(selectedCard)material.color=dark?new Color(.14f,.22f,.43f):new Color(.89f,.91f,1f);
            item.GetComponent<Renderer>().sharedMaterial=material;materials.Add(material);tiles.Add(item);instances[card.id]=item;
            var border=new GameObject("Glass edge");border.layer=8;border.transform.SetParent(item.transform,false);
            var line=border.AddComponent<LineRenderer>();line.useWorldSpace=false;line.positionCount=5;line.startWidth=line.endWidth=selectedCard ? .018f : .008f;
            line.SetPositions(new[]{new Vector3(-.5f,-.5f,-.51f),new Vector3(-.5f,.5f,-.51f),new Vector3(.5f,.5f,-.51f),new Vector3(.5f,-.5f,-.51f),new Vector3(-.5f,-.5f,-.51f)});
            var rim=new Material(Shader.Find("Unlit/Color"));rim.color=selectedCard?new Color(.43f,.4f,.97f):dark?new Color(.23f,.36f,.62f):new Color(.68f,.77f,.96f);line.sharedMaterial=rim;materials.Add(rim);
            if(i<(docked?20:12))
            {
                var label=new GameObject("Readable module label");label.layer=8;label.transform.SetParent(item.transform,false);label.transform.localPosition=new Vector3(-.43f,.19f,-.55f);label.transform.localScale=new Vector3(1/2.15f,1/1.5f,1/.13f);
                var text=label.AddComponent<TextMesh>();text.font=font;text.fontSize=48;text.characterSize=.043f;text.anchor=TextAnchor.UpperLeft;
                text.text=Icon(card.kind)+"\n"+Short(card.name,22)+"\n"+card.kind;text.color=dark?new Color(.85f,.91f,1):new Color(.12f,.20f,.38f);
                label.GetComponent<MeshRenderer>().sharedMaterial=font.material;
            }
        }
        camera.orthographic=true;camera.orthographicSize=docked?1.25f:4.55f;
        camera.transform.position=docked?new Vector3(3.5f,.05f,-18):new Vector3(0,.2f,-20);camera.transform.rotation=Quaternion.identity;
        camera.backgroundColor=dark?new Color(.055f,.09f,.17f):new Color(.89f,.935f,.995f);Resize();
    }
    public static string Icon(string kind) => kind=="Image"?"IMG":kind=="Font"?"Aa":kind=="Field"?"{ }":kind=="Method"?"f(x)":"<>";
    static string Short(string value,int max)=>value.Length<=max?value:value.Substring(0,max-1)+"…";
    public Vector2? Origin(string id)
    {
        if(!instances.TryGetValue(id,out var instance))return null;
        var point=camera.WorldToViewportPoint(instance.transform.position);var rect=surface.worldBound;
        return new Vector2(rect.x+point.x*rect.width,rect.y+(1-point.y)*rect.height);
    }
    void Resize()
    {
        int width=Mathf.Clamp(Mathf.RoundToInt(surface.contentRect.width*1.35f),256,2048),height=Mathf.Clamp(Mathf.RoundToInt(surface.contentRect.height*1.35f),128,1536);
        if(texture!=null&&Mathf.Abs(texture.width-width)<60&&Mathf.Abs(texture.height-height)<40)return;
        if(texture!=null){camera.targetTexture=null;texture.Release();UnityEngine.Object.Destroy(texture);}
        texture=new RenderTexture(width,height,24){antiAliasing=4};texture.Create();camera.targetTexture=texture;camera.aspect=(float)width/height;surface.image=texture;
    }
    public void Dispose()
    {
        if(texture!=null){texture.Release();UnityEngine.Object.Destroy(texture);}foreach(var m in materials)UnityEngine.Object.Destroy(m);UnityEngine.Object.Destroy(root);UnityEngine.Object.Destroy(font);
    }
}
public sealed class DepthModuleIdentity : MonoBehaviour { public string Id; }
