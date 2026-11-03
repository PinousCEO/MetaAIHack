/* Local interaction prototype. It does not connect to the application or Meta. */
(function () {
  'use strict';
  const M=window.DockModel, $=s=>document.querySelector(s);
  const KEY='depth-dock-concept-v1', SAVED=KEY+'-saved';
  let state=M.initial(), dragging=null, movePanel=null, picked='CalculateTotal';
  const stage=$('#stage'), root=$('#dock-root'), floats=$('#float-layer'), indicator=$('#drop-indicator');
  function announce(text){$('#status').textContent=text;}
  function read(key){try{const s=JSON.parse(localStorage.getItem(key));return M.validate(s)?s:null;}catch{return null;}}
  function persist(key=KEY){try{localStorage.setItem(key,JSON.stringify(state));return true;}catch{announce('Storage unavailable; the layout remains usable for this session.');return false;}}
  state=read(KEY)||state;
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function button(text,title,action,cls){const b=el('button',cls,text);b.type='button';b.title=title;b.setAttribute('aria-label',title);b.addEventListener('click',action);return b;}
  const views={};
  function view(name,cls,html){const e=el('section','panel-view '+cls);e.id='panel-'+name;e.setAttribute('role','tabpanel');e.setAttribute('aria-label',M.panels[name]);e.innerHTML=html;views[name]=e;return e;}
  view('preview','preview',
    '<div class="preview-nav"><strong>CHECKOUT</strong><span>Your basket · sample</span></div><h1>Your basket</h1><div class="basket-layout"><div class="basket"><div class="product"><img src="../../../samples/Checkout/Assets/mug.png" alt="Ceramic mug"><div><strong>Ceramic mug</strong><p>Quantity 1</p><b>$48.00</b></div></div><div class="product"><img src="../../../samples/Checkout/Assets/plant.png" alt="Indoor plant"><div><strong>Indoor plant</strong><p>Quantity 1</p><b>$72.00</b></div></div></div><div class="summary"><h2>Order summary</h2><div class="summary-row"><span>Subtotal</span><strong>$120.00</strong></div><div class="summary-row"><span>Discount (20%)</span><strong class="discount">−$24.00</strong></div><button class="total-select" data-pick-total><span>Total</span><span>$96.00</span></button><div class="preview-picked">Selected: Total → CalculateTotal</div><div class="coupon"><input aria-label="Example coupon" value="WELCOME20" readonly><button type="button" data-pick-total>Inspect</button></div></div></div><p class="preview-note">The preview keeps its own space while you arrange the editor panels.</p>');
  view('modules','modules-view','<div class="module-meta"><span>Selected source links · sample</span><span id="picked-module">CalculateTotal</span></div><svg class="module-map" viewBox="0 0 760 525" role="img" aria-label="Selected source dependencies"></svg><div class="code-caption"><span data-source-file>CouponRules.cs</span><code data-source-code>return subtotal * (1 - DiscountPercent / 100);</code></div>');
  const modules=[
    {name:'ApplyCoupon',owner:'CheckoutController',x:25,y:35,file:'CheckoutController.cs'},
    {name:'IsValid',owner:'CouponValidator',x:25,y:215,file:'CouponRules.cs'},
    {name:'CalculateTotal',owner:'CouponRules',x:280,y:135,file:'CouponRules.cs'},
    {name:'DiscountPercent',owner:'CouponRules',x:280,y:340,file:'CouponRules.cs',constant:true},
    {name:'SetTotal',owner:'CartState',x:535,y:35,file:'CartState.cs'},
    {name:'Read',owner:'TotalsView',x:535,y:215,file:'CheckoutController.cs'},
    {name:'Estimate',owner:'CartSummary',x:535,y:395,file:'CheckoutController.cs'}
  ];
  const svg=views.modules.querySelector('svg');
  svg.innerHTML='<defs><marker id="dependency-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path class="arrow" d="M0 0 L8 4 L0 8 Z"></path></marker></defs><path class="relation" marker-end="url(#dependency-arrow)" d="M230 98 C265 98 250 198 280 198"></path><path class="relation" marker-end="url(#dependency-arrow)" d="M535 458 C470 458 530 198 485 198"></path><path class="relation" marker-end="url(#dependency-arrow)" d="M382 226 L382 375"></path>'+
    modules.map(n=>'<g data-module="'+n.name+'" tabindex="0" role="button" aria-label="'+n.owner+'.'+n.name+'" transform="translate('+n.x+' '+n.y+')"><path class="owner" d="M0 25 V0 H20 M185 0 H205 V25 M0 80 V100 H20 M185 100 H205 V80"></path><text class="owner-label" x="9" y="23">'+n.owner+'</text>'+
      (n.constant?'<rect class="state" x="7" y="43" width="191" height="43" rx="12"></rect><ellipse class="state" cx="18" cy="64.5" rx="11" ry="21.5"></ellipse>':'<path class="function" d="M12 43 H193 L205 64 L193 85 H12 L0 64 Z"></path>')+
      '<text class="node-text '+(n.constant?'state-text':'')+'" x="102" y="71" text-anchor="middle">'+(n.constant?'DiscountPercent = 20':n.name)+'</text></g>').join('');
  view('hierarchy','hierarchy-view','<div class="hierarchy-search"><input placeholder="Find module…" aria-label="Find module" type="search"></div><div class="tree"></div><p class="tree-result-empty" hidden>No matching modules</p>');
  const tree=views.hierarchy.querySelector('.tree');
  ['CheckoutController.cs','CouponRules.cs','CartState.cs'].forEach(file=>{
    const d=el('details');d.open=true;d.dataset.file=file;d.append(el('summary','',file));
    modules.filter(n=>n.file===file).forEach(n=>{const b=button(n.owner+'.'+n.name,'Inspect '+n.name,()=>selectModule(n.name),n.constant?'constant':'method');b.dataset.module=n.name;d.append(b);});tree.append(d);
  });
  const manifest=el('div','code-caption','◇ depth.preview.json');tree.append(manifest);
  view('console','console-view','<pre class="console-output">&gt; inspect Total\nsource: CouponRules.cs</pre><form class="console-form"><span>&gt;</span><input aria-label="Console command" placeholder="/help or /clear"><button>↵</button></form>');
  view('chat','chat-view','<div class="chat-label">Example conversation · no API connection</div><div class="messages"><div class="message"><strong>YOU</strong>Why is the total 96?</div><div class="message"><strong>SOURCE EXPLANATION</strong>CalculateTotal applies the shared 20% discount to the subtotal of 120.<code>return subtotal * (1 - DiscountPercent / 100);</code></div></div><form class="chat-form"><textarea rows="2" aria-label="Draft message" placeholder="Draft a message…"></textarea><button>Send</button></form>');
  function selectModule(name){
    picked=name;
    Object.values(views).forEach(v=>v.querySelectorAll('[data-module]').forEach(n=>{const active=n.dataset.module===name;n.classList.toggle('selected',active);n.setAttribute('aria-pressed',String(active));}));
    views.modules.querySelector('#picked-module').textContent=name;
    const m=modules.find(n=>n.name===name);if(m)views.modules.querySelector('[data-source-file]').textContent=m.file;
    views.modules.querySelector('[data-source-code]').textContent=name==='CalculateTotal'?'return subtotal * (1 - DiscountPercent / 100);':name==='DiscountPercent'?'public const double DiscountPercent = 20;':'Selected declaration: '+(m?m.owner+'.':'')+name;
    announce('Selected '+name+' · preview context retained');
  }
  views.preview.querySelectorAll('[data-pick-total]').forEach(b=>b.addEventListener('click',()=>selectModule('CalculateTotal')));
  svg.querySelectorAll('[data-module]').forEach(n=>{
    n.addEventListener('click',()=>selectModule(n.dataset.module));
    n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectModule(n.dataset.module);}});
  });
  views.hierarchy.querySelector('input').addEventListener('input',function(){
    const q=this.value.toLowerCase();let visible=0;
    tree.querySelectorAll('details').forEach(d=>{
      let count=0;d.querySelectorAll('button').forEach(b=>{b.hidden=!(b.textContent+' '+d.dataset.file).toLowerCase().includes(q);if(!b.hidden)count++;});
      d.hidden=!count;if(q)d.open=true;visible+=count;
    });
    manifest.hidden=Boolean(q)&&!manifest.textContent.toLowerCase().includes(q);
    views.hierarchy.querySelector('.tree-result-empty').hidden=visible>0||!manifest.hidden;
  });
  views.console.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault();const input=views.console.querySelector('input'),out=views.console.querySelector('pre'),v=input.value.trim();if(!v)return;
    if(v==='/clear')out.textContent='';
    else out.textContent+='\n> '+v+'\n'+(v==='/help'?'Drag panel tabs. Dock at edges, group at center. Use ⋯ to float or move by keyboard.':'Interaction prototype only; this command was not executed.');
    input.value='';out.scrollTop=out.scrollHeight;
  });
  views.chat.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault();const input=views.chat.querySelector('textarea'),text=input.value.trim();if(!text)return;
    const msg=el('div','message'),label=el('strong','','DRAFT · NOT SENT');msg.append(label,document.createTextNode(text));
    views.chat.querySelector('.messages').append(msg);input.value='';msg.scrollIntoView?.({block:'nearest'});announce('Draft kept locally in this session; no Meta request sent.');
  });
  function apply(next,message){if(!M.validate(next))throw Error('Invalid docking state');state=next;render();const ok=persist();if(message&&ok)announce(message);}
  function grid(elm,n){
    const a=n.a.kind==='group'&&n.a.collapsed,b=n.b.kind==='group'&&n.b.collapsed;
    const sizes=(a?'34px':'minmax(0,'+n.ratio+'fr)')+' 6px '+(b?'34px':'minmax(0,'+(1-n.ratio)+'fr)');
    elm.style[n.axis==='x'?'gridTemplateColumns':'gridTemplateRows']=sizes;
  }
  function startPointer(ev,move,end){
    if(ev.button!==0)return;ev.preventDefault();
    const onMove=e=>move(e),onEnd=e=>{document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onEnd);document.removeEventListener('pointercancel',onEnd);end?.(e);};
    document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',onEnd);document.addEventListener('pointercancel',onEnd);
  }
  function bounds(){const r=stage.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width||1200,h:r.height||760};}
  function clampRect(r){const b=bounds();r.w=Math.min(Math.max(240,r.w),Math.max(240,b.w-10));r.h=Math.min(Math.max(130,r.h),Math.max(130,b.h-10));r.x=Math.max(0,Math.min(r.x,Math.max(0,b.w-r.w)));r.y=Math.max(0,Math.min(r.y,Math.max(0,b.h-r.h)));return r;}
  function positionFloat(w,f){clampRect(f.rect);Object.assign(w.style,{left:f.rect.x+'px',top:f.rect.y+'px',width:f.rect.w+'px',height:f.rect.h+'px'});}
  function nodeElement(n,floating){
    if(n.kind==='split'){
      const box=el('div','split axis-'+n.axis);box.dataset.split=n.id;grid(box,n);
      const a=el('div','slot'),b=el('div','slot'),sep=el('div','separator');a.append(nodeElement(n.a,floating));b.append(nodeElement(n.b,floating));
      sep.tabIndex=0;sep.setAttribute('role','separator');sep.setAttribute('aria-orientation',n.axis==='x'?'vertical':'horizontal');sep.setAttribute('aria-label','Resize panel split');sep.setAttribute('aria-valuemin','6');sep.setAttribute('aria-valuemax','94');sep.setAttribute('aria-valuenow',Math.round(n.ratio*100));
      sep.addEventListener('pointerdown',ev=>{
        if((n.a.kind==='group'&&n.a.collapsed)||(n.b.kind==='group'&&n.b.collapsed)){announce('Expand the collapsed panel before resizing this split.');return;}
        const r=box.getBoundingClientRect(),length=n.axis==='x'?r.width:r.height;
        if(length<=6)return;
        startPointer(ev,e=>{const p=n.axis==='x'?e.clientX-r.left:e.clientY-r.top;const margin=Math.min(.3,70/length);n.ratio=Math.max(margin,Math.min(1-margin,p/length));grid(box,n);sep.setAttribute('aria-valuenow',Math.round(n.ratio*100));},()=>{persist();announce('Panel sizes saved');});
      });
      sep.addEventListener('keydown',e=>{const back=n.axis==='x'?'ArrowLeft':'ArrowUp',forward=n.axis==='x'?'ArrowRight':'ArrowDown';if(![back,forward,'Home','End'].includes(e.key))return;e.preventDefault();const ratio=e.key==='Home'?.06:e.key==='End'?.94:n.ratio+(e.key===back?-.025:.025);apply(M.resize(state,n.id,ratio),'Split resized');root.querySelector('[data-split="'+n.id+'"] > .separator')?.focus();});
      box.append(a,sep,b);return box;
    }
    const box=el('section','group'+(n.collapsed?' collapsed':''));box.dataset.group=n.id;
    const header=el('div','dock-toolbar'),tabs=el('div','dock-tabs'),ops=el('div','panel-ops'),body=el('div','dock-body');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Docked panels');
    n.tabs.forEach(p=>{
      const tab=button(M.panels[p],'Drag '+M.panels[p]+' to rearrange',()=>{if(n.active!==p||n.collapsed)apply(M.activate(state,n.id,p));}, 'dock-tab');
      tab.draggable=true;tab.dataset.panel=p;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(n.active===p));tab.tabIndex=n.active===p?0:-1;
      tab.addEventListener('dragstart',e=>{dragging={panel:p};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-depth-panel',p);announce('Move '+M.panels[p]+': edge = split, center = tab, outside workspace = float');});
      tab.addEventListener('dragend',()=>{dragging=null;indicator.hidden=true;});
      tab.addEventListener('dblclick',()=>apply(M.maximize(state,n.id),'Toggle panel focus'));
      tab.addEventListener('contextmenu',e=>{e.preventDefault();openMove(p);});
      tab.addEventListener('keydown',e=>{
        if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const i=n.tabs.indexOf(p),q=n.tabs[(i+(e.key==='ArrowLeft'?-1:1)+n.tabs.length)%n.tabs.length];apply(M.activate(state,n.id,q));document.querySelector('[data-panel="'+q+'"]')?.focus();}
        if(e.key==='F10'&&e.shiftKey){e.preventDefault();openMove(p);}
      });
      tabs.append(tab);
    });
    if(floating){
      const mover=button('⠿','Move floating group (drag)',()=>{},'float-move');
      mover.addEventListener('pointerdown',ev=>{const start={x:ev.clientX,y:ev.clientY,...floating.rect},wrapper=document.querySelector('[data-float="'+floating.id+'"]');
        const pointerX=ev.clientX,pointerY=ev.clientY;
        startPointer(ev,e=>{floating.rect.x=start.x+(e.clientX-pointerX);floating.rect.y=start.y+(e.clientY-pointerY);positionFloat(wrapper,floating);},()=>persist());
      });ops.append(mover);
    }
    ops.append(button('⋯','Move or float '+M.panels[n.active],()=>openMove(n.active)),button(n.collapsed?'▴':'▾',n.collapsed?'Expand panel':'Collapse panel',()=>apply(M.collapse(state,n.id)),'collapse-button'),button(state.maximized===n.id?'⤡':'⤢','Maximize or restore panel',()=>apply(M.maximize(state,n.id))),button('×','Close '+M.panels[n.active],()=>apply(M.hide(state,n.active),'Panel closed. Reopen it from Panels.')));
    header.append(tabs,ops);body.append(views[n.active]);box.append(header,body);return box;
  }
  function render(){
    const scroll=Object.fromEntries(Object.entries(views).map(([k,v])=>[k,[v.scrollTop,v.scrollLeft]]));
    root.replaceChildren();floats.replaceChildren();document.documentElement.dataset.theme=state.theme;$('#theme').textContent=state.theme==='dark'?'Light':'Dark';
    if(state.maximized){const g=M.find(state,state.maximized);if(g)root.append(nodeElement({...g,collapsed:false}));}
    else{
      if(state.root)root.append(nodeElement(state.root));
      else{const e=el('div','empty-workspace','All panels are closed or floating. Use Panels to reopen them.');root.append(e);}
      state.floats.forEach(f=>{
        const wrapper=el('div','floating');wrapper.dataset.float=f.id;positionFloat(wrapper,f);wrapper.append(nodeElement(f.node,f));
        const grip=button('','Resize floating group',()=>{},'float-resize');
        grip.addEventListener('pointerdown',ev=>{const x=ev.clientX,y=ev.clientY,w=f.rect.w,h=f.rect.h;startPointer(ev,e=>{f.rect.w=w+e.clientX-x;f.rect.h=h+e.clientY-y;positionFloat(wrapper,f);},()=>persist());});
        grip.addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();f.rect.w+=e.key==='ArrowRight'?10:e.key==='ArrowLeft'?-10:0;f.rect.h+=e.key==='ArrowDown'?10:e.key==='ArrowUp'?-10:0;positionFloat(wrapper,f);persist();});
        wrapper.append(grip);wrapper.addEventListener('pointerdown',()=>{if(wrapper!==floats.lastElementChild)floats.append(wrapper);});floats.append(wrapper);
      });
    }
    Object.entries(views).forEach(([k,v])=>{v.scrollTop=scroll[k][0];v.scrollLeft=scroll[k][1];});
    indicator.hidden=true;
  }
  function zoneAt(group,x,y){
    const r=group.getBoundingClientRect(),dx=x-r.left,dy=y-r.top;
    if(dy<34)return {zone:'center',rect:r};
    const ex=Math.min(r.width*.23,85),ey=Math.min(r.height*.23,65);
    const zone=dx<ex?'left':dx>r.width-ex?'right':dy<ey?'top':dy>r.height-ey?'bottom':'center';
    return {zone,rect:r};
  }
  function showIndicator(group,zone,r){
    const left=r.left+(zone==='right'?r.width*.5:0),top=r.top+(zone==='bottom'?r.height*.5:0);
    Object.assign(indicator.style,{left:left+'px',top:top+'px',width:r.width*(['left','right'].includes(zone)?.5:1)+'px',height:r.height*(['top','bottom'].includes(zone)?.5:1)+'px'});
    indicator.querySelector('span').textContent=zone==='center'?'Group as tab':'Dock '+zone;indicator.hidden=false;
  }
  function workspaceEdge(x,y){const b=bounds();return x-b.x<15?'left':b.x+b.w-x<15?'right':y-b.y<15?'top':b.y+b.h-y<15?'bottom':null;}
  stage.addEventListener('dragover',e=>{
    if(!dragging)return;e.preventDefault();e.dataTransfer.dropEffect='move';
    const edge=workspaceEdge(e.clientX,e.clientY);if(edge){const b=bounds();showIndicator(null,edge,{left:b.x,top:b.y,width:b.w,height:b.h});indicator.querySelector('span').textContent='Dock workspace '+edge;return;}
    const g=e.target.closest('.group');
    if(g){const hit=zoneAt(g,e.clientX,e.clientY);showIndicator(g,hit.zone,hit.rect);}
    else indicator.hidden=true;
  });
  function floatAt(panel,x,y){const b=bounds();apply(M.float(state,panel,clampRect({x:x-b.x-70,y:y-b.y-15,w:390,h:300})),'Panel floating inside this workspace');}
  stage.addEventListener('drop',e=>{
    if(!dragging)return;e.preventDefault();e.stopPropagation();const p=dragging.panel,g=e.target.closest('.group');dragging=null;indicator.hidden=true;
    const edge=workspaceEdge(e.clientX,e.clientY);
    if(edge)apply(M.dockWorkspace(state,p,edge),'Panel docked at workspace edge');
    else if(g)apply(M.dock(state,p,g.dataset.group,zoneAt(g,e.clientX,e.clientY).zone),'Panel docked · layout saved');
    else floatAt(p,e.clientX,e.clientY);
  });
  document.body.addEventListener('dragover',e=>{if(dragging&&!stage.contains(e.target)){e.preventDefault();indicator.hidden=true;}});
  document.body.addEventListener('drop',e=>{if(!dragging)return;e.preventDefault();const p=dragging.panel;dragging=null;floatAt(p,e.clientX,e.clientY);});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){dragging=null;indicator.hidden=true;if(state.maximized){const s=M.copy(state);s.maximized=null;apply(s,'Workspace restored');}}
  });
  function openMove(panel){
    movePanel=panel;$('#move-panel-name').textContent=M.panels[panel];
    const select=$('#move-destination');select.replaceChildren();
    const workspace=el('option','','Whole workspace');workspace.value='__workspace';select.append(workspace);
    M.nodes(state).filter(n=>n.kind==='group').forEach(n=>{const o=el('option','',n.tabs.map(p=>M.panels[p]).join(' / '));o.value=n.id;select.append(o);});
    const other=M.nodes(state).find(n=>n.kind==='group'&&!n.tabs.includes(panel));if(other)select.value=other.id;
    updatePlacement();
    $('#move-dialog').showModal();
  }
  function updatePlacement(){const picker=$('#move-placement'),center=picker.querySelector('[value="center"]');center.disabled=$('#move-destination').value==='__workspace';if(center.disabled&&picker.value==='center')picker.value='right';}
  $('#move-destination').addEventListener('change',updatePlacement);
  $('#apply-move').addEventListener('click',()=>{if(!movePanel)return;const destination=$('#move-destination').value,zone=$('#move-placement').value;apply(destination==='__workspace'?M.dockWorkspace(state,movePanel,zone==='center'?'right':zone):M.dock(state,movePanel,destination,zone),'Panel moved');$('#move-dialog').close();});
  $('#float-panel').addEventListener('click',()=>{if(!movePanel)return;const b=bounds();floatAt(movePanel,b.x+b.w*.4,b.y+100);$('#move-dialog').close();});
  Object.entries(M.panels).forEach(([id,name])=>{const o=el('option','',name);o.value=id;$('#panel-picker').append(o);});
  $('#panel-picker').addEventListener('change',function(){if(this.value)apply(M.show(state,this.value),'Panel opened');this.value='';});
  $('#layout-picker').addEventListener('change',function(){
    if(!this.value)return;
    const next=this.value==='saved'?read(SAVED):M.preset(this.value);
    if(next)apply(next,'Layout loaded');else announce('No saved layout yet. Use Save layout.');
    this.value='';
  });
  $('#save-layout').addEventListener('click',()=>{if(persist(SAVED))announce('Saved layout. Restore it from the Layout menu.');});
  $('#reset-layout').addEventListener('click',()=>apply(M.initial(),'Default layout restored · console is a short bottom dock'));
  $('#theme').addEventListener('click',()=>{const s=M.copy(state);s.theme=s.theme==='dark'?'light':'dark';apply(s);});
  window.addEventListener('resize',()=>{state.floats.forEach(f=>{const w=document.querySelector('[data-float="'+f.id+'"]');if(w)positionFloat(w,f);});persist();});
  window.DockDemo={getState:()=>M.copy(state),reset:()=>apply(M.initial()),dock:(p,g,z)=>apply(M.dock(state,p,g,z)),float:p=>floatAt(p,bounds().x+160,bounds().y+140),hide:p=>apply(M.hide(state,p)),show:p=>apply(M.show(state,p)),collapse:g=>apply(M.collapse(state,g)),maximize:g=>apply(M.maximize(state,g)),preset:p=>apply(M.preset(p)),select:selectModule,getSelection:()=>picked};
  render();selectModule(picked);
})();

