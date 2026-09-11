// One continuous comparison. Every beat is a short, source-grounded visual idea.
export const chapters = [
  {id:'workload',name:'The task',title:'Architecture',duration:6,cues:[
    {at:0,overview:true,targets:[null,null],caption:'Original: 6 encoder + 6 decoder layers. V4.1: 20 causal encoder + 20 decoder layers.'},
    {at:3,targets:['encoder_attention','encoder_full'],title:'Encoder attention',caption:'Original encoder: bidirectional attention. V4.1 encoder: causal attention.'}
  ]},
  {id:'attention',name:'Attention',title:'Decoder attention',duration:10,cues:[
    {at:0,targets:['decoder_attention','decoder_full'],caption:'Original: dense causal attention. V4.1: sparse global attention plus local attention.'},
    {at:4,targets:['decoder_attention','candidate_pool'],title:'Global retrieval',caption:'V4.1: up to 512 selected global entries. Original: no retrieval index.'},
    {at:7,targets:['decoder_attention','decoder_full'],title:'Local attention',caption:'V4.1: 128-token local window. Original: attention over preceding target positions.'}
  ]},
  {id:'reuse',name:'Reuse',title:'Attention memory',duration:9,cues:[
    {at:0,targets:['decoder_cross','decoder_full'],title:'Full layers',caption:'Original: separate K/V projections per decoder layer. V4.1 Full: new global K/V and indices.'},
    {at:3,targets:['decoder_cross','decoder_reuse_first_node'],title:'Reuse layers',caption:'Original: per-layer K/V. V4.1 Reuse: shared global K/V and retrieval indices.'},
    {at:6,targets:['decoder_cross','decoder_reindex'],title:'Reindex layers',caption:'V4.1 Reindex reuses global K/V and recomputes retrieval indices.'}
  ]},
  {id:'experts',name:'Experts',title:'Feed-forward layers',duration:8,cues:[
    {at:0,targets:['encoder_ffn','encoder_moe_full'],caption:'Original: 2,048-unit dense layer. V4.1: 384 routed experts and one shared expert.'},
    {at:4,targets:['encoder_ffn','encoder_moe_full'],closer:true,title:'Expert activation',caption:'Original: dense computation. V4.1: 6 routed + 1 shared expert per token.'}
  ]},
  {id:'residuals',name:'Residual paths',title:'Residual connections',duration:5,cues:[
    {at:0,targets:['encoder_norm1','embedding'],caption:'Original: one residual stream with Add & Norm. V4.1: four streams with Single-Pass mHC.'}
  ]},
  {id:'engram',name:'Learned memory',title:'Engram memory',duration:8,cues:[
    {at:0,targets:[null,'engram'],caption:'V4.1 only: two learned lookup modules, with 196B parameters in total.'},
    {at:4,targets:[null,'kv_label'],title:'Global KV cache',caption:'V4.1 global KV stores the current context. Engram stores learned parameters.'}
  ]},
  {id:'vision',name:'Vision',title:'Vision encoder',duration:7,cues:[
    {at:0,targets:[null,'vision_encoder'],caption:'Original: text input. V4.1: a 32-layer vision encoder for image patches.'},
    {at:3,targets:[null,'vision_embedding'],title:'Vision projector',caption:'V4.1: 3×3 spatial merging, then a two-layer projector into the language model.'}
  ]},
  {id:'drafting',name:'Drafting',title:'Next-token output',duration:7,cues:[
    {at:0,targets:['softmax','target_head'],caption:'Both architectures produce a probability distribution over the next token.'},
    {at:3,targets:['softmax','dspark'],title:'DSpark drafting',caption:'Original: sequential decoding. V4.1: five-position drafts with backbone verification.'}
  ]}
];
let offset=0;
for(const chapter of chapters){chapter.start=offset;offset+=chapter.duration;}
export const duration=offset;
export const cues=chapters.flatMap((chapter,index)=>chapter.cues.map((cue,cueIndex)=>({...cue,time:chapter.start+cue.at,chapterIndex:index,cueIndex})));

export function storyPosition(seconds){
  const time=Math.max(0,Math.min(duration,seconds));
  const index=chapters.findLastIndex(c=>time>=c.start);
  const chapter=chapters[index],local=Math.min(chapter.duration,time-chapter.start);
  const cueIndex=chapter.cues.findLastIndex(c=>local>=c.at);
  return {time,index,chapter,local,cueIndex,cue:chapter.cues[cueIndex],complete:time===duration};
}

export class StoryClock {
  constructor(){this.time=0;this.playing=false;this.last=null;}
  tick(now,visible=true){
    if(this.playing&&visible&&this.last!==null)this.time=Math.min(duration,this.time+Math.max(0,now-this.last)/1000);
    this.last=now;
    if(this.time>=duration)this.playing=false;
    return storyPosition(this.time);
  }
  play(now){if(this.time>=duration)this.time=0;this.playing=true;this.last=now;}
  pause(now){this.tick(now);this.playing=false;this.last=null;}
  seek(time,now){this.time=Math.max(0,Math.min(duration,time));this.last=now;if(this.time>=duration)this.playing=false;return storyPosition(this.time);}
  resetVisibility(){this.last=null;}
}
