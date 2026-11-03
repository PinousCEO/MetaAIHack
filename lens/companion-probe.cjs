'use strict';
// Acceptance only: run as a real command inside the owned test terminal.
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1],folder=get('--folder'),signals=get('--signals');
const wait=async name=>{const end=Date.now()+120000;while(!fs.existsSync(path.join(signals,name))){if(Date.now()>end)throw Error('Acceptance signal timed out: '+name);await new Promise(r=>setTimeout(r,120));}};
(async()=>{console.log('Depth Lens acceptance CLI: waiting for the live companion.');await wait('edit');
  fs.writeFileSync(path.join(folder,'validate.js'),"export function validate(value) { return typeof value === 'string' && value.length > 0; }\n");
  await wait('second-save');
  fs.writeFileSync(path.join(folder,'pipeline.js'),"import { save } from './store.js';\nimport { validate } from './validate.js';\nexport function submit(value) { if (!validate(value)) throw Error('A value is required'); return save(value); }\n");
  console.log('Added validation and connected submit -> validate -> store.');await wait('complete');
  console.log('Command finished; the panel should retain this action and its actual source changes.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
