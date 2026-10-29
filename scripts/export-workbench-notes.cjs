// Export the AI-authored catalog with the same identities used by both visual studies.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context=vm.createContext({window:{}});
for(const f of ['project-data.js','project-model.js'])vm.runInContext(fs.readFileSync(path.join(root,'design/atlas',f),'utf8'),context);
const data=context.window.DEPTH_MODEL;
fs.mkdirSync(path.join(root,'design/workbench'),{recursive:true});
fs.writeFileSync(path.join(root,'design/workbench/ai-records.json'),JSON.stringify({origin:'ai-authored',author:'Codex',revision:data.graph.revision,kind:'proposed-functional-partition',records:data.modules.map(m=>({id:m.id,name:m.name,purpose:m.purpose,moduleCreationReason:m.reason,entityIds:m.entities.map(e=>e.id),evidence:m.entities.flatMap(e=>e.anchors),implementationIntent:'Original creation intent is not recorded; this record explains the proposed module boundary.'}))},null,2));
console.log('Exported '+data.modules.length+' AI-authored module records.');
