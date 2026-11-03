'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DepthRuntimeFrame=api;})(globalThis,()=>{
 function fit(box,width,height){if(!box.width||!box.height||!width||!height)return null;const scale=Math.min(box.width/width,box.height/height),w=width*scale,h=height*scale;return {x:box.left+(box.width-w)/2,y:box.top+(box.height-h)/2,width:w,height:h};}
 function point(box,width,height,x,y){const r=fit(box,width,height);if(!r||x<r.x||y<r.y||x>r.x+r.width||y>r.y+r.height)return null;return {x:(x-r.x)/r.width,y:(y-r.y)/r.height};}
 function related(regions,sources){return regions.filter(r=>r.sources.some(a=>sources.some(b=>a.path===b.path&&(!a.line||a.line>=b.line&&a.line<=(b.endLine||b.line)))));}
 return {fit,point,related};
});
