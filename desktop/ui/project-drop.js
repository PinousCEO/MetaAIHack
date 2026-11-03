'use strict';
// Browser events only. Native path extraction and filesystem checks remain in the host.
window.DepthProjectDrop=class {
 constructor({available,busy,open,error}){
  let depth=0,pending=false;
  const overlay=document.createElement('div');overlay.id='project-drop-zone';overlay.hidden=true;
  overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
  overlay.innerHTML='<div><strong>Open project</strong><p>Drop a project folder or project file here</p><small>One project at a time · Use Merge to combine projects</small></div>';
  document.body.append(overlay);
  const files=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
  const blocked=()=>pending||busy();
  const clear=()=>{depth=0;overlay.hidden=true;document.body.classList.remove('project-dragging');};
  const show=()=>{
   overlay.querySelector('strong').textContent=!available()?'Open this page in Depth AI':blocked()?'Finish the current action first':'Open project';
   overlay.hidden=false;document.body.classList.add('project-dragging');
  };
  document.addEventListener('dragenter',e=>{if(!files(e))return;e.preventDefault();depth++;show();});
  document.addEventListener('dragover',e=>{if(!files(e))return;e.preventDefault();e.dataTransfer.dropEffect=available()&&!blocked()?'copy':'none';show();});
  document.addEventListener('dragleave',e=>{if(!files(e)&&!depth)return;depth=Math.max(0,depth-1);if(!depth)clear();});
  document.addEventListener('drop',async e=>{
   const list=Array.from(e.dataTransfer?.files||[]);
   if(!files(e)&&!list.length)return;
   e.preventDefault();clear();
   if(!available()){error(Error('Open the desktop app to import a local project.'));return;}
   if(blocked()){error(Error('Wait for the current operation and close any dialog before opening another project.'));return;}
   if(list.length!==1){error(Error('Drop one project at a time. Use Merge to combine projects.'));return;}
   pending=true;
   try{await open(list);}catch(reason){error(reason);}finally{pending=false;clear();}
  });
  window.addEventListener('blur',clear);document.addEventListener('dragend',clear);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')clear();});
 }
};
