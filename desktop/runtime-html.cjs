'use strict';
// Add source locations to the actual HTML response, preserving its content,
// scripts and CSS. This scanner skips comments and raw script/style bodies.
function instrument(html,source){
 const encoded=source.replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
 let out='',offset=0,line=1,raw=null;
 while(offset<html.length){
  let start=html.indexOf('<',offset);if(start<0){out+=html.slice(offset);break;}
  if(raw){const close=html.toLowerCase().indexOf('</'+raw,offset);if(close<0){out+=html.slice(offset);break;}start=close;raw=null;}
  const text=html.slice(offset,start);out+=text;line+=(text.match(/\n/g)||[]).length;
  if(html.startsWith('<!--',start)){const end=html.indexOf('-->',start+4),stop=end<0?html.length:end+3;const comment=html.slice(start,stop);out+=comment;line+=(comment.match(/\n/g)||[]).length;offset=stop;continue;}
  let end=start+1,quote=null;for(;end<html.length;end++){const c=html[end];if(quote){if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
  const token=html.slice(start,Math.min(end+1,html.length)),match=token.match(/^<([a-zA-Z][\w:-]*)(?=[\s/>])/);
  if(match&&end<html.length&&!/\sdata-depth-source\s*=/i.test(token))out+=token.replace(/^<[\w:-]+/,m=>m+' data-depth-source="'+encoded+'" data-depth-line="'+line+'"');else out+=token;
  if(match&&/^(script|style|textarea|title)$/i.test(match[1]))raw=match[1].toLowerCase();
  line+=(token.match(/\n/g)||[]).length;offset=Math.min(end+1,html.length);
 }
 return out;
}
module.exports={instrument};
