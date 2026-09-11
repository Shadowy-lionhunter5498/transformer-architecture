import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chapters,cues,duration,storyPosition,StoryClock} from '../dist/story.mjs';
import {buildCameraPaths,sampleCameraPath} from '../dist/camera-path.mjs';
import {attentionSpec} from '../dist/presentation.mjs';
const root=new URL('../',import.meta.url);
const graph=JSON.parse(await readFile(new URL('dist/assets/spatial-data.json',root),'utf8'));
const {facts}=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('dist/facts.js',root))).toString('base64'));
const checks=[];
function check(name,test){test();checks.push(name);}
check('The tour lasts 60 seconds, opens on both models and advances every 3–5 seconds',()=>{
 assert.equal(duration,60);assert.equal(chapters.length,8);assert.equal(cues.length,17);
 assert.equal(cues[0].overview,true);assert.deepEqual(cues[0].targets,[null,null]);
 for(let i=0;i<cues.length;i++){const interval=(cues[i+1]?.time??duration)-cues[i].time;assert.ok(interval>=3&&interval<=5);assert.equal(cues[i].solo,undefined);}
 assert.equal(storyPosition(60).complete,true);
});
check('Every visual comparison targets reviewed geometry',()=>{
 for(const cue of cues)for(const [side,id] of cue.targets.entries())if(id)assert.ok(graph[side].nodes.find(n=>n.id===id)?.part,id);
});
check('The reuse sequence shows distinct Full, Reuse and Reindex semantics',()=>{
 const modes=chapters.find(c=>c.id==='reuse').cues.map(c=>attentionSpec(graph[1].nodes.find(n=>n.id===c.targets[1]).layer,4096,facts.deepseek).mode);
 assert.deepEqual(modes,['Full','Reuse','Reindex']);
});
check('Pause, visibility changes, seeking, completion and replay retain correct time',()=>{
 const clock=new StoryClock();clock.play(1000);clock.tick(2000);clock.pause(2500);assert.equal(clock.time,1.5);
 clock.play(6000);clock.tick(7000);assert.equal(clock.time,2.5);
 clock.resetVisibility();clock.tick(90000);assert.equal(clock.time,2.5);
 clock.seek(59,91000);clock.play(91000);clock.tick(93000);assert.equal(clock.time,60);assert.equal(clock.playing,false);
 clock.play(94000);assert.equal(clock.time,0);assert.equal(clock.playing,true);
});
const sizes=[[1280,800],[772,772],[390,844],[320,740]];
const values=p=>[...p.target,...p.offset];
check('Camera position and velocity remain continuous at every cue and intermediate keyframe',()=>{
 const epsilon=1e-5;
 for(const [w,h] of sizes)for(const path of buildCameraPaths(graph,w,h)){
  for(const point of path.slice(1,-1)){
   const a=values(sampleCameraPath(path,point.time-epsilon)),b=values(sampleCameraPath(path,point.time)),c=values(sampleCameraPath(path,point.time+epsilon));
   for(let j=0;j<b.length;j++){assert.ok(Math.abs(a[j]-c[j])<.01);assert.ok(Math.abs((b[j]-a[j])/epsilon-(c[j]-b[j])/epsilon)<.05);}
  }
  for(let t=0;t<=60;t+=1/60){const pose=sampleCameraPath(path,t);assert.ok(values(pose).every(Number.isFinite));assert.ok(pose.offset[2]>8);}
 }
});
check('Both cameras keep moving throughout the tour, including close-ups',()=>{
 for(const [w,h] of sizes)for(const path of buildCameraPaths(graph,w,h))for(let t=0;t<59;t+=.5){
  const a=values(sampleCameraPath(path,t)),b=values(sampleCameraPath(path,t+1));
  assert.ok(Math.hypot(...a.map((v,j)=>b[j]-v))>.001,`Stationary camera at ${t}s`);
 }
});
const result={passed:checks.length,duration_seconds:duration,cues:cues.length,checks,viewports:sizes,scope:'Source semantics, real-time playback and numerical camera continuity. Populated browser appearance is checked separately.'};
console.log(JSON.stringify(result,null,2));
