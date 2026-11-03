'use strict';
// Transport identities describe a connected local process, not an inferred actor.
const crypto=require('node:crypto');
class Sessions {
  constructor(){this.items=new Map();}
  update(input){
    const {id,pid,parentPid,startedAt,cwd='',name='CLI',phase='connected'}=input||{};
    if(typeof id!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(id)||!Number.isInteger(pid)||pid<1||!Number.isInteger(parentPid)||parentPid<1||!Number.isFinite(startedAt)||startedAt<0||typeof cwd!=='string'||cwd.length>2000||typeof name!=='string'||name.length>120||!['connected','closed'].includes(phase))throw Error('Invalid CLI transport identity.');
    const previous=this.items.get(id);
    if(previous&&(previous.pid!==pid||previous.startedAt!==startedAt))throw Error('CLI transport identity cannot change.');
    if(previous?.phase==='closed'&&phase!=='closed')throw Error('CLI transport already closed.');
    const item={...previous,id,pid,parentPid,startedAt,cwd,name,phase,seenAt:Date.now()};this.items.set(id,item);
    for(const [key,s]of this.items)if(Date.now()-s.seenAt>900000)this.items.delete(key);
    return item;
  }
  get(id){const s=this.items.get(id);if(!s||s.phase!=='connected'||Date.now()-s.seenAt>20000)throw Error('CLI transport disconnected.');return s;}
  list(){return [...this.items.values()].map(s=>({...s,phase:s.phase==='closed'?'closed':Date.now()-s.seenAt>20000?'disconnected':'connected'}));}
}
async function connect(api,name){
  const identity={id:crypto.randomUUID(),pid:process.pid,parentPid:process.ppid,startedAt:Math.round(Date.now()-process.uptime()*1000),cwd:process.cwd(),name};
  await api.request('/session',identity);
  const timer=setInterval(()=>api.request('/session',identity).catch(()=>{}),5000);timer.unref();
  return {id:identity.id,async close(){clearInterval(timer);await api.request('/session',{...identity,phase:'closed'}).catch(()=>{});}};
}
module.exports={Sessions,connect};
