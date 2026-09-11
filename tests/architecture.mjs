import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attentionSpec,accessCell,candidateColumns,positionalValue,toyLogits,softmax} from '../dist/presentation.mjs';
const root=new URL('../',import.meta.url);
const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const config=(await read('tests/fixtures/deepseek-config.json')).text_config;
const {facts,compute}=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('dist/facts.js',root))).toString('base64'));
const model=facts.deepseek, graph=await read('dist/assets/spatial-data.json');
const checks=[];
function check(name,fn){fn();checks.push(name);}
check('Backbone dimensions, heads, experts and layer sources match the frozen official configuration',()=>{
  for(const [a,b] of [['layers','num_hidden_layers'],['hidden','hidden_size'],['heads','num_attention_heads'],['headDim','head_dim'],['routedExperts','n_routed_experts'],['sharedExperts','n_shared_experts'],['activeExperts','num_experts_per_tok'],['expertHidden','moe_intermediate_size'],['window','sliding_window'],['topk','index_topk'],['residualStreams','hc_mult'],['draftLayers','num_nextn_predict_layers'],['draftPositions','dspark_block_size']])assert.equal(model[a],config[b],a);
  assert.deepEqual(model.fullLayers,config.kv_source_layer_ids);
  assert.deepEqual([...model.fullLayers,...model.reindexLayers].sort((a,b)=>a-b),config.index_source_layer_ids);
  assert.deepEqual(model.engramLayers,config.engram_layer_ids);
  assert.equal(model.candidatePool,config.candidate_topk_blocks*config.candidate_block_size);
});
check('All 40 layers resolve to the correct global-KV and index producers',()=>{
  const modes={};
  for(let layer=0;layer<40;layer++){
    const s=attentionSpec(layer,4096,model);modes[s.mode]=(modes[s.mode]??0)+1;
    if(layer<2){assert.equal(s.hasGlobal,false);continue;}
    assert.equal(s.cacheSource,config.kv_source_layer_ids.filter(i=>i<=layer).at(-1));
    assert.equal(s.indexSource,config.index_source_layer_ids.filter(i=>i<=layer).at(-1));
    assert.equal(s.ratio,config.compress_ratios[layer]);
    assert.equal(s.hasIndexer,config.index_source_layer_ids.includes(layer));
  }
  assert.deepEqual(modes,{SWA:2,Full:4,Reuse:30,Reindex:4});
});
check('Context bounds hold at 256, 4096 and 1,048,576 tokens',()=>{
  for(const n of [256,4096,1048576])for(let layer=0;layer<40;layer++){
    const s=attentionSpec(layer,n,model);
    assert.ok(s.selected<=512 && s.selected<=s.entries);
    assert.ok(s.local<=128 && s.local<=n);
    if(layer>=20)assert.ok(s.candidates<=16384 && s.candidates<=n && s.selected<=s.candidates);
  }
  assert.equal(attentionSpec(2,256,model).selected,128);
  assert.equal(attentionSpec(20,256,model).selected,256);
});
check('Reuse preserves the producer selection; Reindex changes it without changing KV',()=>{
  const mask=layer=>{const s=attentionSpec(layer,1048576,model);return Array.from({length:256},(_,i)=>accessCell(s,Math.floor(i/16),i%16,3));};
  assert.deepEqual(mask(2),mask(3));assert.deepEqual(mask(20),mask(21));assert.deepEqual(mask(24),mask(25));assert.notDeepEqual(mask(20),mask(24));
  assert.equal(attentionSpec(20,4096,model).cacheSource,attentionSpec(24,4096,model).cacheSource);
  for(const layer of [20,24,28,32,36])for(let row=0;row<16;row++)for(let c=0;c<=row;c++){const spec=attentionSpec(layer,1048576,model);if(accessCell(spec,row,c,3))assert.ok(candidateColumns(spec,row,3).includes(c));}
  for(let layer=0;layer<40;layer++)for(let r=0;r<16;r++)for(let c=r+1;c<16;c++)assert.equal(accessCell(attentionSpec(layer,4096,model),r,c,2),false);
});
check('Paper cache accounting reconstructs 890 bytes per token, and the comparison excludes unlike contents',()=>{
  // Report §2.4.4: 4-bit main latent, E4M3 scale /16; MXFP4 indexer K scale /32.
  const main=config.head_dim/2+config.head_dim/16;
  const index=config.index_head_dim/2+config.index_head_dim/32;
  const total=config.kv_source_layer_ids.reduce((sum,l)=>sum+(main+index)/config.compress_ratios[l],0);
  assert.equal(main,288);assert.equal(index,68);assert.equal(total,890);
  for(const n of [256,4096,1048576]){const c=compute(n);assert.equal(c.newCache,n*total);assert.equal(c.oldCache,n*6*2*512*2);assert.equal(c.prefillVisits,20*n+20*Math.min(128,n));}
});
check('Sine/cosine use paired frequencies; illustrative softmax values are normalized',()=>{
  assert.equal(positionalValue(0,0),0);assert.equal(positionalValue(0,1),1);
  assert.ok(Math.abs(positionalValue(Math.PI/2,0)-1)<1e-12);
  assert.notEqual(positionalValue(1,0),positionalValue(1,64));
  for(let step=0;step<10;step++){const logits=toyLogits(step),p=softmax(logits);assert.ok(logits.some(x=>x<0));assert.ok(Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-12);assert.ok(p.every(x=>x>0&&x<1));}
});
check('The original has five residual bypasses and separate encoder K/V inputs',()=>{
  assert.equal(graph[0].edges.filter(e=>e.role==='residual').length,5);
  assert.equal(graph[0].edges.filter(e=>['key','value'].includes(e.role)&&e.target==='decoder_cross').length,2);
  assert.equal(2+3*(1+5),20);assert.equal(1+3+4*(1+3),20);
});
check('Backbone output bypasses the optional DSpark branch; Engram targets and hidden-state roles are explicit',()=>{
  const d=graph[1],nodes=Object.fromEntries(d.nodes.map(n=>[n.id,n]));
  assert.equal(nodes.hidden_states.part,'hidden');assert.equal(nodes.kv_label.part,'memory');
  assert.equal(nodes.embedding.part,'residual');
  assert.deepEqual(nodes.engram.module_layers,[1,14]);
  assert.deepEqual(d.edges.filter(e=>e.source==='engram').map(e=>e.target_layer).sort((a,b)=>a-b),[1,14]);
  assert.ok(d.edges.some(e=>e.source==='decoder_moe_reuse'&&e.target==='target_head'));
  assert.ok(d.edges.some(e=>e.source==='target_head'&&e.target==='output'));
  assert.ok(!d.edges.some(e=>e.source==='dspark'&&e.target==='output'));
  assert.equal(d.edges.find(e=>e.target==='dspark').role,'draft');
});
check('Every exported Blender component and finite path matches the reviewed source graph',()=>{
  for(const [i,d] of graph.entries()){
    const ids=new Set(d.nodes.map(n=>n.id));assert.equal(ids.size,d.nodes.length);
    for(const e of d.edges){assert.ok(ids.has(e.source)&&ids.has(e.target));assert.ok(e.spatial_path.length>=2);assert.ok(e.spatial_path.every(p=>p.length===3&&p.every(Number.isFinite)));}
  }
});
for(const [i,name] of ['spatial-original','spatial-deepseek'].entries()){
  const b=await readFile(new URL(`dist/assets/${name}.glb`,root));
  const data=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  const ids=data.nodes.filter(n=>n.extras?.component_id).map(n=>n.extras.component_id).sort();
  assert.deepEqual(ids,graph[i].nodes.map(n=>n.id).sort());
}
console.log(JSON.stringify({passed:checks.length,checks},null,2));
