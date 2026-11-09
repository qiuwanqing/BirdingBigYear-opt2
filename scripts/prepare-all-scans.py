"""Export all seven authored scans, without saving or altering the source blend.
Blender --background --python scripts/prepare-all-scans.py -- source.blend output.glb
The same anchor as the existing cropped aisle keeps the encounter in place.
"""
import bpy, sys, json
from pathlib import Path
from mathutils import Vector
source,destination=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.open_mainfile(filepath=source,load_ui=False)
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
anchor=bpy.data.objects['textured_output.001']
points=[anchor.matrix_world@v.co for v in anchor.data.vertices]
origin=Vector((anchor.location.x,anchor.location.y,min(v.z for v in points)))
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:
 obj.location-=origin
 obj.select_set(True)
 for mat in obj.data.materials:
  if not mat or not mat.use_nodes:continue
  for node in mat.node_tree.nodes:
   if node.type!='TEX_IMAGE' or not node.image:continue
   image=node.image.copy()
   size=4096 if obj==anchor else 2048
   image.scale(size,size)
   image.filepath_raw=str(Path('/private/tmp')/('birding-all-'+obj.name+'.jpg'))
   image.file_format='JPEG';image.save();image.pack();node.image=image
bpy.context.view_layer.objects.active=anchor
bpy.ops.export_scene.gltf(filepath=destination,use_selection=True,export_format='GLB',export_image_format='JPEG',export_materials='EXPORT')
print('ALL_SCANS_EXPORTED',len(objects),'objects',sum(len(o.data.polygons) for o in objects),'faces')
