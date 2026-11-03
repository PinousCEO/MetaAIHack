const fs=require('node:fs'),path=require('node:path');
const queue=`export class TaskQueue {
  jobs = [];
  running = false;
  enqueue(run) {
    return new Promise((resolve, reject) => {
      this.jobs.push({run, resolve, reject});
      this.drain();
    });
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length) {
        const job = this.jobs[0];
        try { job.resolve(await job.run()); }
        catch (error) { job.reject(error); }
        this.jobs.shift();
      }
    } finally { this.running = false; }
  }
}
`;
const tests=`import test from 'node:test';
import assert from 'node:assert/strict';
import {TaskQueue} from './TaskQueue.js';
test('FIFO including an asynchronous first job', async () => {
  const q=new TaskQueue(), seen=[];
  await Promise.all([q.enqueue(async()=>{await new Promise(r=>setTimeout(r,20));seen.push(1);}),q.enqueue(async()=>{seen.push(2);})]);
  assert.deepEqual(seen,[1,2]);
});
test('Failure rejects only its job and later jobs still run', async () => {
  const q=new TaskQueue();
  const failed=q.enqueue(async()=>{throw Error('expected');});
  const later=q.enqueue(async()=>42);
  await assert.rejects(failed,/expected/);assert.equal(await later,42);
});
test('Per-job completion returns each value', async () => {
  const q=new TaskQueue();assert.deepEqual(await Promise.all([q.enqueue(async()=>1),q.enqueue(async()=>2)]),[1,2]);
});
`;
function create(folder,after=false){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'package.json'),'{"type":"module","name":"lens-save-example","private":true}\n');fs.writeFileSync(path.join(folder,'Editor.js'),"import {save} from './save.js';\nexport async function submit(write) { return save(write); }\n");fs.writeFileSync(path.join(folder,'save.js'),after?"import {TaskQueue} from './TaskQueue.js';\nconst queue=new TaskQueue();\nexport function save(write) { return queue.enqueue(write); }\n":"export async function save(write) { return write(); }\n");if(after){fs.writeFileSync(path.join(folder,'TaskQueue.js'),queue);fs.writeFileSync(path.join(folder,'queue.test.js'),tests);}}
module.exports={create,queue,tests};
