using System;
using System.Collections.Generic;
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
        var colors=Dark?new[]{new Color(.035f,.065f,.13f),new Color(.08f,.10f,.22f),new Color(.055f,.11f,.22f),new Color(.045f,.065f,.13f)}:
            new[]{new Color(.95f,.97f,1f),new Color(.88f,.89f,.99f),new Color(.86f,.93f,1f),new Color(.96f,.97f,1f)};
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
        var painter=context.painter2D;painter.strokeColor=new Color(.27f,.48f,.96f,.65f);painter.lineWidth=1.5f;
        foreach(var edge in Edges)
        {
            var a=this.WorldToLocal(edge.Item1.worldBound.center);var b=this.WorldToLocal(edge.Item2.worldBound.center);
            var direction=(b-a).normalized;a+=direction*65;b-=direction*65;
            painter.BeginPath();painter.MoveTo(a);painter.BezierCurveTo(a+new Vector2(45,0),b-new Vector2(45,0),b);painter.Stroke();
            painter.BeginPath();painter.MoveTo(b-direction*7+new Vector2(-direction.y,direction.x)*3);painter.LineTo(b);painter.LineTo(b-direction*7-new Vector2(-direction.y,direction.x)*3);painter.Stroke();
        }
    }
}
