const assert=require('node:assert/strict'),{validate}=require('./visual-review.cjs');
const cases=[null,[],{id:'../escape'},{id:'x',script:'anything'},{id:'x',view:'apply'},{id:'x',workspace:'execute'},{id:'x',panel:'shell'},{id:'x',evidence:'delete'},{id:'x',width:1600},{id:'x',width:1,height:1000},{id:'x',width:1600,height:Infinity},{id:'x',zoom:10},{id:'x',reload:'yes'},{id:'x',previewKey:{}},{id:'x',moduleName:'x'.repeat(161)}];
for(const request of cases)assert.throws(()=>validate(request));
for(const request of [{id:'capture-01'},{id:'total-dark',previewKey:'total',theme:'dark',view:'feature',layout:'guide',evidence:'source',width:1600,height:1000,zoom:1.25,reload:true},{id:'relations',view:'relations'},{id:'queue',moduleName:'JobQueue'},{id:'docked-cli',workspace:'cli',panel:'chat'}])assert.equal(validate(request),request);
console.log('Visual review protocol: 20 validation cases passed; no Electron rendering asserted.');
