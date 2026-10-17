"""Export the user's bird-illustrated bottle without saving the source blend.
Blender --background --python scripts/prepare-bird-product.py -- source.blend output.glb
"""
import bpy, bmesh, sys
from mathutils import Vector
from pathlib import Path
source,destination=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.open_mainfile(filepath=source,load_ui=False)
bpy.ops.object.select_all(action='DESELECT')
obj=bpy.data.objects['textured_output.006']
obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
low=min(v.co.z for v in obj.data.vertices)
high=max(v.co.z for v in obj.data.vertices)
bm=bmesh.new();bm.from_mesh(obj.data)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
 plane_co=(0,0,low+(high-low)*.055),plane_no=(0,0,-1),clear_outer=True,dist=.000001)
bm.to_mesh(obj.data);bm.free()
pts=[v.co for v in obj.data.vertices]
minimum=Vector(tuple(min(p[i] for p in pts) for i in range(3)))
maximum=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
center=(minimum+maximum)/2
height=maximum.z-minimum.z
for v in obj.data.vertices:v.co=(v.co-center)/height
obj.location=(0,0,0);obj.name='Bird illustrated bottle scan'
for material in obj.data.materials:
 for node in material.node_tree.nodes:
  if node.type=='TEX_IMAGE' and node.image:
   image=node.image.copy();image.scale(2048,2048)
   image.filepath_raw=str(Path(destination).with_suffix('.jpg'));image.file_format='JPEG'
   image.save();image.pack();node.image=image
bpy.ops.export_scene.gltf(filepath=destination,use_selection=True,export_format='GLB',export_image_format='JPEG')
