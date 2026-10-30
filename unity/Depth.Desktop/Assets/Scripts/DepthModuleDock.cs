using System;
using UnityEngine;
using UnityEngine.UIElements;

/// <summary>Mouse/trackpad module shelf with held-button dragging and click suppression.</summary>
public sealed class DepthModuleDock : ScrollView
{
    bool pressed,dragging;int pointer;Vector2 start,last;float target,suppressUntil;
    public bool SuppressClick => dragging || Time.unscaledTime<suppressUntil;
    public DepthModuleDock():base(ScrollViewMode.Horizontal)
    {
        horizontalScrollerVisibility=ScrollerVisibility.Hidden;verticalScrollerVisibility=ScrollerVisibility.Hidden;
        RegisterCallback<PointerDownEvent>(e=>{if(e.button!=0)return;pressed=true;dragging=false;pointer=e.pointerId;start=last=e.position;target=scrollOffset.x;},TrickleDown.TrickleDown);
        RegisterCallback<PointerMoveEvent>(e=>{
            if((e.pressedButtons&1)==0){if(pressed||dragging)StopDrag();return;}if(!pressed||e.pointerId!=pointer)return;Vector2 p=e.position;
            if(!dragging&&Mathf.Abs(p.x-start.x)>6){dragging=true;this.CapturePointer(pointer);}
            if(!dragging)return;float delta=last.x-p.x;
            target=Clamp(target+delta);scrollOffset=new Vector2(target,0);last=p;e.StopImmediatePropagation();
        },TrickleDown.TrickleDown);
        RegisterCallback<PointerUpEvent>(e=>{if(e.pointerId!=pointer||!pressed)return;pressed=false;if(dragging){suppressUntil=Time.unscaledTime+.15f;dragging=false;this.ReleasePointer(pointer);e.StopImmediatePropagation();}},TrickleDown.TrickleDown);
        RegisterCallback<PointerCancelEvent>(_=>StopDrag());RegisterCallback<PointerCaptureOutEvent>(e=>{if(e.target==this)StopDrag();});RegisterCallback<PointerLeaveEvent>(e=>{if(e.target==this)StopDrag();});
        RegisterCallback<ClickEvent>(e=>{if(SuppressClick)e.StopImmediatePropagation();},TrickleDown.TrickleDown);
        RegisterCallback<WheelEvent>(e=>{target=Clamp(target+(Mathf.Abs(e.delta.x)>.05f?e.delta.x:e.delta.y)*24);e.StopImmediatePropagation();},TrickleDown.TrickleDown);
    }
    void StopDrag(){if(dragging)suppressUntil=Time.unscaledTime+.15f;pressed=dragging=false;target=scrollOffset.x;if(this.HasPointerCapture(pointer))this.ReleasePointer(pointer);}
    float Clamp(float x)=>Mathf.Clamp(x,0,Mathf.Max(0,horizontalScroller.highValue));
    public void Tick(float dt)
    {
        if(pressed&&!Input.GetMouseButton(0))StopDrag();
        if(dragging)return;

        float x=Mathf.Lerp(scrollOffset.x,Clamp(target),1-Mathf.Exp(-18*dt));scrollOffset=new Vector2(x,0);
    }
    public void Step(float direction){target=Clamp(target+direction*320);}
}
