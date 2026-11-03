// Local service transport shared by the desktop host and integration checks.
// Only explicit routes are exposed; generated images never become arbitrary file reads.
const allowed=/^\/(health|meta\/(config|check)|import|refresh|graph|view|modules\/(catalog|analyze|explanation|source|transform)|source\/[\w-]+|project-assets\/[\w-]+|composition\/[\w-]+|impact|context\/packet|agent|pending|proposals\/[\w-]+(?:\/validation|\/validate|\/validation\/cancel)?|validation\/profile|apply|dismiss|history(?:\/[\w-]+\/undo)?|recovery(?:\/restore)?|activity|property\/(draft|propose)|assets(?:\/generate|\/import|\/[\w-]+\/content)?)$/;
exports.createClient=(endpoint,token)=>async(route,body)=>{
 if(typeof route!=='string'||(!allowed.test(route)&&!/^\/runtime\/(select|selection)$/.test(route)))throw Error('Unsupported operation');
 const response=await fetch(endpoint()+route,{method:body===undefined?'GET':'POST',headers:{'X-Depth-Token':token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(600000)});
 if(response.ok&&/^\/assets\/[\w-]+\/content$/.test(route)){
  const mime=response.headers.get('content-type')?.split(';')[0];
  if(!['image/png','image/jpeg'].includes(mime))throw Error('Only supported raster previews can be displayed.');
  if(Number(response.headers.get('content-length'))>64*1024*1024)throw Error('Image preview is too large.');
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>64*1024*1024)throw Error('Image preview is too large.');
  return {mime,base64:bytes.toString('base64')};
 }
 const value=await response.json();if(!response.ok)throw Error(value.error||'Service request failed');return value;
};
