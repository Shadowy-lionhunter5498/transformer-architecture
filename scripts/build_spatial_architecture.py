import bpy,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'blender';A=ROOT/'dist/assets'
bpy.ops.wm.open_mainfile(filepath=str(P/'architectures.blend'))
for root in [o for o in bpy.data.objects if o.name.startswith('spatial_') and o.parent is None]:
 for o in list(root.children_recursive)+[root]:bpy.data.objects.remove(o,do_unlink=True)
for o in list(bpy.data.objects):
 if o.type not in ('LIGHT','CAMERA'):o.hide_set(True);o.hide_render=True
colors={'attention':'ECB85F','norm':'D5D09A','ffn':'64B4D5','embed':'D98F9F','linear':'A1A5DF','softmax':'92C49A','swa':'C5A0DA','full':'69CBB7','reuse':'AFC179','reindex':'75AEE9','moe':'7DAABF','aux':'BB91CC','frame':'6E899A','ink':'9AB7C7','flow':'9EBDD0'}
def linear(h):
 def c(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
 return tuple(c(int(h[i:i+2],16)/255) for i in (0,2,4))
M={}
for name,h in colors.items():
 m=bpy.data.materials.new('Spatial '+name);m.use_nodes=True;c=linear(h);m.diffuse_color=(*c,1);s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*c,1);s.inputs['Metallic'].default_value=.38;s.inputs['Roughness'].default_value=.29;M[name]=m

def group(name,parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;return o

def box(name,x,y,z,w,h,d,mat,parent,bevel=.05):
 vs=[(a*w/2,b*d/2,c*h/2) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.location=(x,-z,y);o.parent=parent;o.data.materials.append(M[mat]);mod=o.modifiers.new('Rounded edges','BEVEL');mod.width=bevel;mod.segments=3;return o

def tube(name,pts,parent,mat='ink',radius=.025):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=2;s=c.splines.new('POLY');s.points.add(len(pts)-1)
 for p,v in zip(s.points,pts):p.co=(v[0],-v[2],v[1],1)
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(M[mat]);o.parent=parent;return o

def cage(name,x,y,z,w,h,d,parent,mat='frame',radius=.021):
 # A wire enclosure with visible depth, open faces, and a physical repeat stack.
 for zz in [z-d/2,z+d/2]:tube(name+str(zz),[(x-w/2,y-h/2,zz),(x+w/2,y-h/2,zz),(x+w/2,y+h/2,zz),(x-w/2,y+h/2,zz),(x-w/2,y-h/2,zz)],parent,mat,radius)
 for xx in [x-w/2,x+w/2]:
  for yy in [y-h/2,y+h/2]:tube(name+'post',[(xx,yy,z-d/2),(xx,yy,z+d/2)],parent,mat,radius)

D=json.loads((P/'diagram-data.json').read_text())
# Technical review: disambiguate grouped notation and the optional drafter.
modern=D[1]
by_id={n['id']:n for n in modern['nodes']}
by_id['hidden_states'].update(part='hidden',label='Encoder output')
by_id['embedding'].update(part='residual',label='Input streams')
by_id['residual_input'].update(part='',label='')
for id in ['compression_encoder','compression_decoder']:by_id[id]['part']=''
by_id['engram'].update(label='Engram ×2',module_layers=[1,14])
by_id['dspark'].update(x=6.9,y=14.85,w=2.6,h=.85,label='DSpark drafts',branch='auxiliary',target_layers=[37,38,39])
by_id['output']['y']=16.3
head=dict(by_id['dspark']);head.update(id='target_head',x=3.2,w=3.1,h=.7,label='Output head',part='head',branch='decoder',layer=39)
head.pop('target_layers',None);modern['nodes'].append(head)
for e in modern['edges']:
 if e['id']=='vision_input':e.update(target='embedding',path=[[-6.6,1.51],[-6.6,2.1],[-3.2,2.1],[-3.2,3.17]])
 if e['id']=='engram_to_swa':e.update(target_layer=1,grouped_target=True)
 if e['id']=='engram_to_full':e.update(target_layer=14,grouped_target=True)
 if e['id']=='decoder_draft':e.update(role='draft',source_layers=[37,38,39],path=[[3.2,12.3],[3.2,13.9],[6.9,13.9],[6.9,14.425]])
modern['edges']=[e for e in modern['edges'] if e['id']!='draft_output']
modern['edges'].extend([
 dict(id='decoder_head',source='decoder_moe_reuse',target='target_head',role='flow',path=[[3.2,12.3],[3.2,14.5]]),
 dict(id='head_output',source='target_head',target='output',role='flow',path=[[3.2,15.2],[3.2,15.95]])
])
for side,d in enumerate(D):
 root=group('spatial_deepseek' if side else 'spatial_original')
 for f in d['frames']:
  count=6 if not side else (int(f['label'][1:]) if f['label'].startswith('×') else 1)
  # Repeated enclosures follow the paper's nesting, not an extra model layer.
  for i in range(count):
   cage('repeat_'+f['id'],f['x'],f['y'],-.45-i*.46,f['w'],f['h'],.14,root,radius=.015 if i else .024)
 for n in d['nodes']:
  id=n['id'];g=group('component_'+str(side)+'_'+id,root);g['component_id']=id;g['part']=n['part'];g['branch']=n['branch'];g['layer_start']=n['layer'];g['module_layers']=n.get('module_layers',[]);x=n['x'];y=n['y'];w=n['w'];h=n['h'];col=next((k for k,v in colors.items() if v==n['color']),None)
  # Preserve semantic colors independently of the paper palette.
  col={'attention':('attention' if not side else 'swa' if id.endswith('swa') else 'reindex' if 'reindex' in id else 'reuse' if 'reuse' in id else 'full'),'cross':'attention','ffn':'moe' if side else 'ffn','residual':'norm','embedding':'embed','head':'linear','memory':'full','hidden':'full','vision':'aux','engram':'aux','speed':'linear','indexer':'reindex'}.get(n['part'],'frame')
  if id=='softmax':col='softmax'
  if n['kind']=='box':
   depth=1.32 if n['part'] in ['attention','cross','ffn','engram','memory','vision','speed','indexer'] else .8
   box('body_'+id,x,y,-.06,w,h,.14,col,g)
   box('rim_bottom_'+id,x,y-h/2,.54,w,.11,depth,col,g)
   box('rim_left_'+id,x-w/2,y,.54,.095,h,depth,col,g)
   box('rim_right_'+id,x+w/2,y,.54,.095,h,depth,col,g)
   # Open-front racks: the contents exist inside these walls at every zoom level.
   for i in range(3):box('circuit_'+id,x+(i-1)*w*.23,y,.08,.12,h*.54,.08,col,g,bevel=.012)
   cage('edge_'+id,x,y,.53,w,h,depth,g,col,.013)
  elif n['kind'] in ['plus','position']:
   if n['kind']=='plus':
    box('pos_plus_h',x,y,.6,.34,.045,.15,'norm',g,.01);box('pos_plus_v',x,y,.6,.045,.34,.15,'norm',g,.01)
   else:
    pts=[(x+.39*math.cos(t*math.pi/24),y+.39*math.sin(t*math.pi/24),.6) for t in range(49)];tube('pos_ring',pts,g,'embed',.025);tube('pos_wave',[(x-.33+i*.022,y+.15*math.sin(i*.022/.66*2*math.pi),.6) for i in range(31)],g,'embed',.019)
 for e in d['edges']:
  role=e['role'];z=1.7 if role in ['key','value','ced','shared_kv'] else 1.28 if role=='residual' else .72
  pts=[[x,y,z] for x,y in e['path']];pts[0][2]=.55;pts[-1][2]=.55;e['spatial_path']=pts
  tube('wire_'+e['id'],pts,root,'flow' if role=='flow' else 'reindex' if role in ['indexer','reindex'] else 'ink',.022 if role=='flow' else .017)
  # Direction remains clear while the particle motion is paused.
  b=Vector((pts[-1][0],-pts[-1][2],pts[-1][1]));a=Vector((pts[-2][0],-pts[-2][2],pts[-2][1]));vec=(b-a).normalized()
  bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=.065,radius2=0,depth=.16,location=b-vec*.035);o=bpy.context.object;o.name='arrow_'+e['id'];o.rotation_euler=vec.to_track_quat('Z','Y').to_euler();o.data.materials.append(M['flow']);o.parent=root
 # Source text labels remain available in the native Blender file.
 for n in d['nodes']:
  if not n['label']:continue
  c=bpy.data.curves.new('spatial_label','FONT');c.body=n['label'];c.align_x='CENTER';c.align_y='CENTER';c.size=.28;c.space_line=.9;o=bpy.data.objects.new('label_'+n['id'],c);bpy.context.collection.objects.link(o);o.location=(n['x'],-1.4,n['y']);o.rotation_euler=(math.pi/2,0,0);o.parent=root;o.data.materials.append(M['ink'])
 # Convert curves for GLB export, leave editable labels in .blend.
 for o in [root]+list(root.children_recursive):o.hide_set(False);o.hide_render=False
 bpy.ops.object.select_all(action='DESELECT')
 for o in list(root.children_recursive):
  if o.type=='CURVE':o.select_set(True)
 if bpy.context.selected_objects:bpy.context.view_layer.objects.active=bpy.context.selected_objects[0];bpy.ops.object.convert(target='MESH')
 bpy.ops.object.select_all(action='DESELECT')
 for o in [root]+list(root.children_recursive):
  if o.type!='FONT':o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(A/('spatial-deepseek.glb' if side else 'spatial-original.glb')),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
 root.location.x=11 if side else -10
for o in list(bpy.data.objects):
 if o.type in ['LIGHT','CAMERA']:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.object.camera_add(location=(18,-43,23));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,8))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=41;bpy.context.scene.camera=cam
bpy.ops.object.light_add(type='AREA',location=(-6,-12,22));bpy.context.object.data.energy=2100;bpy.context.object.data.size=12;bpy.context.object.rotation_euler=(math.radians(20),0,0)
bpy.context.scene.world.color=(.1,.14,.2)
(A/'spatial-data.json').write_text(json.dumps(D,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(P/'architectures.blend'))
print('SPATIAL_ARCHITECTURES_SAVED')
