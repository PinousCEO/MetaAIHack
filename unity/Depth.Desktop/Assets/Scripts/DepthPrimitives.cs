using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

/// <summary>Code-native graphics keep interactive text sharp; the original faceted brand shape is preserved.</summary>
public sealed class DepthMark : VisualElement
{
    public DepthMark() { style.width = 30; style.height = 32; generateVisualContent += Draw; pickingMode = PickingMode.Ignore; }
    void Draw(MeshGenerationContext context)
    {
        var p = context.painter2D;
        Polygon(p, new Color(.17f,.47f,.96f), new Vector2(15,1), new Vector2(28,9), new Vector2(15,17), new Vector2(2,9));
        Polygon(p, new Color(.07f,.29f,.76f), new Vector2(2,9), new Vector2(15,17), new Vector2(15,31), new Vector2(2,23));
        Polygon(p, new Color(.34f,.7f,1f), new Vector2(15,17), new Vector2(28,9), new Vector2(28,23), new Vector2(15,31));
        Polygon(p, Color.white, new Vector2(15,9), new Vector2(22,13), new Vector2(22,21), new Vector2(15,25), new Vector2(8,21), new Vector2(8,13));
    }
    static void Polygon(Painter2D p, Color color, params Vector2[] points)
    { p.fillColor=color; p.BeginPath(); p.MoveTo(points[0]); for(int i=1;i<points.Length;i++)p.LineTo(points[i]);p.ClosePath();p.Fill(); }
}

public sealed class DepthBackdrop : VisualElement
{
    public bool Dark;
    public DepthBackdrop() { pickingMode=PickingMode.Ignore; style.position=Position.Absolute; style.left=0;style.top=0;style.right=0;style.bottom=0;generateVisualContent+=Draw; }
    void Draw(MeshGenerationContext context)
    {
        var mesh=context.Allocate(4,6);float w=contentRect.width,h=contentRect.height;
        var colors=Dark?new[]{new Color(.16f,.20f,.27f),new Color(.08f,.105f,.16f),new Color(.13f,.16f,.23f),new Color(.08f,.12f,.17f)}:
            new[]{new Color(.88f,.91f,.96f),new Color(.965f,.965f,.98f),new Color(.87f,.90f,.94f),new Color(.95f,.965f,.985f)};
        var points=new[]{new Vector3(0,0),new Vector3(w,0),new Vector3(w,h),new Vector3(0,h)};
        for(int i=0;i<4;i++)mesh.SetNextVertex(new Vertex{position=points[i],tint=colors[i]});
        foreach(ushort index in new ushort[]{0,1,2,2,3,0})mesh.SetNextIndex(index);
    }
}

public sealed class DepthConnections : VisualElement
{
    public readonly List<Tuple<VisualElement,VisualElement,string>> Edges = new List<Tuple<VisualElement,VisualElement,string>>();
    public DepthConnections() { style.position=Position.Absolute;style.left=0;style.top=0;style.right=0;style.bottom=0;pickingMode=PickingMode.Ignore;generateVisualContent+=Draw; }
    void Draw(MeshGenerationContext context)
    {
        var p=context.painter2D;
        foreach(var edge in Edges)
        {
            var ar=edge.Item1.worldBound;var br=edge.Item2.worldBound;if(ar.width<1||br.width<1)continue;
            bool right=br.center.x>ar.center.x;float sign=right?1:-1;
            var siblings=Edges.Where(e=>e.Item1==edge.Item1&&(e.Item2.worldBound.center.x>ar.center.x)==right).ToArray();
            float port=(Array.IndexOf(siblings,edge)+1f)/(siblings.Length+1f);
            var a=this.WorldToLocal(new Vector2(right?ar.xMax:ar.xMin,Mathf.Lerp(ar.yMin+25,ar.yMax-25,port)));
            var b=this.WorldToLocal(new Vector2(right?br.xMin:br.xMax,br.center.y));
            bool mapping=edge.Item3=="preview mapping";
            bool bypass=!mapping&&Mathf.Abs(br.center.x-ar.center.x)>contentRect.width*.48f;
            var points=new List<Vector2>{a};Vector2 direction=new Vector2(sign,0);
            bool sameColumn=!mapping&&Mathf.Abs(ar.center.x-br.center.x)<Mathf.Min(ar.width,br.width)*.3f;
            if(sameColumn){
                bool left=this.WorldToLocal(ar.center).x<contentRect.width*.5f;float lane=left?this.WorldToLocal(new Vector2(Mathf.Min(ar.xMin,br.xMin)-10,0)).x:this.WorldToLocal(new Vector2(Mathf.Max(ar.xMax,br.xMax)+10,0)).x;
                a=this.WorldToLocal(new Vector2(left?ar.xMin:ar.xMax,ar.center.y));b=this.WorldToLocal(new Vector2(left?br.xMin:br.xMax,br.center.y));
                points=new List<Vector2>{a,new Vector2(lane,a.y),new Vector2(lane,b.y),b};direction=left?Vector2.right:Vector2.left;
            }else if(bypass){
                a=this.WorldToLocal(new Vector2(ar.center.x,ar.yMin));b=this.WorldToLocal(new Vector2(br.xMin,br.center.y));
                float lane=8,outer=this.WorldToLocal(new Vector2(br.xMin-11,br.center.y)).x;
                points=new List<Vector2>{a,new Vector2(a.x,lane),new Vector2(outer,lane),new Vector2(outer,b.y),b};direction=Vector2.right;
            }else{
                float lane=(a.x+b.x)*.5f;points.Add(new Vector2(lane,a.y));points.Add(new Vector2(lane,b.y));points.Add(b);
            }
            Color color=mapping?new Color(.18f,.52f,.88f,.65f):edge.Item3.IndexOf("call",StringComparison.OrdinalIgnoreCase)>=0?new Color(.25f,.55f,.84f,.9f):new Color(.55f,.49f,.75f,.8f);
            p.lineWidth=4;p.strokeColor=new Color(1,1,1,DepthGlass.Dark?.05f:.7f);Path(p,points);p.Stroke();
            p.lineWidth=mapping?1.3f:1.7f;p.strokeColor=color;Path(p,points);p.Stroke();
            p.fillColor=color;p.BeginPath();p.Arc(a,2.5f,0,360);p.ClosePath();p.Fill();
            var normal=new Vector2(-direction.y,direction.x);p.BeginPath();p.MoveTo(b);p.LineTo(b-direction*7+normal*3.5f);p.LineTo(b-direction*7-normal*3.5f);p.ClosePath();p.Fill();
        }
    }
    static void Path(Painter2D p,List<Vector2> points)
    {
        p.BeginPath();p.MoveTo(points[0]);
        for(int i=1;i<points.Count-1;i++){
            var incoming=points[i]-points[i-1];var outgoing=points[i+1]-points[i];
            float radius=Mathf.Min(9,Mathf.Min(incoming.magnitude,outgoing.magnitude)*.45f);
            var from=points[i]-incoming.normalized*radius;var to=points[i]+outgoing.normalized*radius;
            p.LineTo(from);p.BezierCurveTo(Vector2.Lerp(from,points[i],.66f),Vector2.Lerp(to,points[i],.66f),to);
        }
        p.LineTo(points[points.Count-1]);
    }

}

/// <summary>Layered glass body; mesh tint supplies pearl reflections without rasterizing live text.</summary>
public sealed class DepthGlass : VisualElement
{
    public static bool Dark;
    readonly bool body;
    readonly Color accent;
    public DepthGlass(bool thick=false,Color? tint=null)
    {
        body=thick;accent=tint??new Color(.5f,.65f,.85f);pickingMode=PickingMode.Ignore;style.position=Position.Absolute;
        style.left=0;style.top=0;style.right=0;style.bottom=0;generateVisualContent+=Draw;
    }
    void Draw(MeshGenerationContext ctx)
    {
        float w=contentRect.width,h=contentRect.height;if(w<2||h<2)return;
        for(int i=5;i>=1;i--)Plate(ctx,new Rect(-i*.9f,3+i*1.6f,w+i*1.8f,h+i*.7f),new Color(.07f,.11f,.18f,Dark?.06f:.022f),false);
        if(body){
            Plate(ctx,new Rect(4,5,w,h),Dark?new Color(.07f,.14f,.23f):new Color(.65f,.72f,.81f,.65f),false);
            Plate(ctx,new Rect(2,3,w,h),Dark?new Color(.24f,.35f,.47f):new Color(.98f,.99f,1,.9f),false);
        }
        Plate(ctx,new Rect(0,0,w,h),Color.white,true);
        var p=ctx.painter2D;p.lineWidth=1;p.strokeColor=new Color(1,1,1,Dark?.35f:.95f);
        p.BeginPath();p.MoveTo(new Vector2(11,1));p.LineTo(new Vector2(w-11,1));p.Stroke();
        p.strokeColor=new Color(1,1,1,Dark?.15f:.65f);p.BeginPath();p.MoveTo(new Vector2(2,12));p.LineTo(new Vector2(2,h-12));p.Stroke();
        p.strokeColor=Dark?new Color(accent.r,accent.g,accent.b,.35f):new Color(.61f,.69f,.8f,.3f);
        p.BeginPath();p.MoveTo(new Vector2(12,h-1));p.LineTo(new Vector2(w-12,h-1));p.Stroke();
    }
    void Plate(MeshGenerationContext ctx,Rect r,Color tint,bool sheen)
    {
        const int segments=12, rings=14;int count=4*(segments+1);var mesh=ctx.Allocate(count*rings+1,count*3+(rings-1)*count*6);var center=r.center;
        Color Shade(Vector2 v)
        {
            if(!sheen)return tint;
            float x=(v.x-r.x)/r.width,y=(v.y-r.y)/r.height;
            float shine=Mathf.Exp(-Mathf.Pow((x+y*.42f-.15f)*3.8f,2));
            float edge=Mathf.Pow(Mathf.Max(0,1-y),5)*.12f;
            var baseColor=Dark?Color.Lerp(new Color(.075f,.105f,.155f),new Color(.32f,.39f,.47f),shine*.68f):Color.Lerp(new Color(.83f,.87f,.93f),Color.white,.62f+shine*.36f);
            if(body)baseColor=Color.Lerp(baseColor,accent,Dark?.035f+edge*.25f:.008f+edge*.08f);
            baseColor.a=Dark?.84f:.93f;return baseColor;
        }
        mesh.SetNextVertex(new Vertex{position=new Vector3(center.x,center.y,Vertex.nearZ),tint=Shade(center)});
        float radius=Mathf.Min(12,Mathf.Min(r.width,r.height)*.5f);
        var centers=new[]{new Vector2(r.xMax-radius,r.y+radius),new Vector2(r.xMax-radius,r.yMax-radius),new Vector2(r.x+radius,r.yMax-radius),new Vector2(r.x+radius,r.y+radius)};
        for(int ring=1;ring<=rings;ring++)for(int c=0;c<4;c++)for(int i=0;i<=segments;i++)
        {
            float a=(-90+c*90+i*90f/segments)*Mathf.Deg2Rad;var edge=centers[c]+new Vector2(Mathf.Cos(a),Mathf.Sin(a))*radius;
            var pt=Vector2.Lerp(center,edge,ring/(float)rings);
            mesh.SetNextVertex(new Vertex{position=new Vector3(pt.x,pt.y,Vertex.nearZ),tint=Shade(pt)});
        }
        for(int i=0;i<count;i++){mesh.SetNextIndex(0);mesh.SetNextIndex((ushort)(i+1));mesh.SetNextIndex((ushort)((i+1)%count+1));}
        for(int ring=1;ring<rings;ring++)for(int i=0;i<count;i++)
        {
            ushort a=(ushort)(1+(ring-1)*count+i),b=(ushort)(1+(ring-1)*count+(i+1)%count),c=(ushort)(1+ring*count+i),d=(ushort)(1+ring*count+(i+1)%count);
            foreach(var index in new[]{a,c,d,a,d,b})mesh.SetNextIndex(index);
        }
    }
}

/// <summary>Quiet perspective floor behind the source composition, without invented module data.</summary>
public sealed class DepthStage : VisualElement
{
    public DepthStage(){pickingMode=PickingMode.Ignore;style.position=Position.Absolute;style.left=0;style.right=0;style.top=0;style.bottom=0;generateVisualContent+=Draw;}
    void Draw(MeshGenerationContext ctx)
    {
        float w=contentRect.width,h=contentRect.height;var p=ctx.painter2D;
        p.strokeColor=new Color(.65f,.79f,1f,.17f);p.lineWidth=1;
        for(int i=-3;i<=6;i++){p.BeginPath();p.MoveTo(new Vector2(w*.5f+(i-1.5f)*w*.07f,h*.12f));p.LineTo(new Vector2((i-1.5f)*w*.45f,h));p.Stroke();}
        for(int i=0;i<6;i++){float y=h*(.18f+.82f*Mathf.Pow(i/5f,1.7f));p.BeginPath();p.MoveTo(new Vector2(0,y));p.LineTo(new Vector2(w,y));p.Stroke();}
    }
}

/// <summary>Keep native wheel/trackpad scrolling; a small independent rail avoids platform theme thumb minimum sizes.</summary>
public sealed class DepthScrollView : ScrollView
{
    readonly VisualElement rail,thumb;
    bool dragging;int dragPointer;
    public DepthScrollView(ScrollViewMode mode=ScrollViewMode.Vertical):base(mode)
    {
        verticalScrollerVisibility=ScrollerVisibility.Hidden;horizontalScrollerVisibility=ScrollerVisibility.Hidden;
        rail=new VisualElement();rail.name="depth-scroll-rail";rail.style.position=Position.Absolute;rail.style.right=1;rail.style.top=4;rail.style.bottom=4;rail.style.width=7;
        thumb=new VisualElement();thumb.style.position=Position.Absolute;thumb.style.left=2;thumb.style.width=3;thumb.style.borderTopLeftRadius=2;thumb.style.borderTopRightRadius=2;thumb.style.borderBottomLeftRadius=2;thumb.style.borderBottomRightRadius=2;thumb.style.backgroundColor=new Color(.48f,.57f,.69f,.36f);thumb.pickingMode=PickingMode.Ignore;rail.Add(thumb);hierarchy.Add(rail);
        rail.RegisterCallback<PointerDownEvent>(e=>{if(e.button!=0)return;dragging=true;dragPointer=e.pointerId;rail.CapturePointer(dragPointer);Scrub(e.localPosition.y);e.StopPropagation();});
        rail.RegisterCallback<PointerMoveEvent>(e=>{if(dragging&&(e.pressedButtons&1)!=0){Scrub(e.localPosition.y);e.StopPropagation();}});
        rail.RegisterCallback<PointerUpEvent>(e=>{dragging=false;if(rail.HasPointerCapture(e.pointerId))rail.ReleasePointer(e.pointerId);});
        rail.RegisterCallback<PointerCaptureOutEvent>(_=>dragging=false);
        schedule.Execute(UpdateRail).Every(80);
    }
    void Scrub(float y){float range=Mathf.Max(1,rail.contentRect.height-thumb.layout.height);verticalScroller.value=Mathf.Clamp01((y-thumb.layout.height*.5f)/range)*verticalScroller.highValue;UpdateRail();}
    void UpdateRail()
    {
        float high=verticalScroller.highValue,height=Mathf.Max(0,contentRect.height-8);
        rail.style.display=high>1&&height>10?DisplayStyle.Flex:DisplayStyle.None;
        float size=Mathf.Clamp(height*height/(height+Mathf.Max(0,high)),24,Mathf.Max(24,height));thumb.style.height=size;thumb.style.top=high>0?(height-size)*Mathf.Clamp01(verticalScroller.value/high):0;
    }
}
