"""Blender --background --python scripts/prepare-scanned-aisle.py -- source.blend output.glb

Exports a cropped copy only; never saves the source .blend or source textures.
"""
import bpy
import bmesh
import sys
from pathlib import Path

source, destination = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=source, load_ui=False)
bpy.ops.object.select_all(action='DESELECT')
obj = bpy.data.objects['textured_output.001']
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bm = bmesh.new()
bm.from_mesh(obj.data)
floor = min(v.co.z for v in bm.verts)
# Cut off the torn ceiling while preserving the original UVs on retained faces.
bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
    dist=0.00001, plane_co=(0, 0, floor + 2.0), plane_no=(0, 0, 1), clear_outer=True)
for point, normal in [((0, 0, floor + .27), (0, 0, -1)),
                      ((-3, 0, 0), (-1, 0, 0)),
                      ((0, 2.9, 0), (0, 1, 0)),
                      ((0, -2.9, 0), (0, -1, 0))]:
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        dist=0.00001, plane_co=point, plane_no=normal, clear_outer=True)
# The central aisle contains hanging ceiling ribbons rather than merchandise.
ceiling_scraps = [face for face in bm.faces
    if face.calc_center_median().z > floor + 1.55
    and abs(face.calc_center_median().y) < .85]
bmesh.ops.delete(bm, geom=ceiling_scraps, context='FACES')
# Remove small floating islands, retaining independently scanned product details.
unseen = set(bm.verts)
discard = []
while unseen:
    seed = unseen.pop()
    component, pending = [seed], [seed]
    while pending:
        v = pending.pop()
        for edge in v.link_edges:
            neighbor = edge.other_vert(v)
            if neighbor in unseen:
                unseen.remove(neighbor)
                component.append(neighbor)
                pending.append(neighbor)
    if len(component) < 18:
        discard.extend(component)
bmesh.ops.delete(bm, geom=discard, context='VERTS')
bm.to_mesh(obj.data)
bm.free()
# Fix a stable origin: source X becomes the aisle direction, Z remains vertical.
for v in obj.data.vertices:
    v.co.z -= floor
obj.location = (0, 0, 0)
obj.name = 'Scanned grocery aisle'
for mat in obj.data.materials:
    if not mat or not mat.use_nodes:
        continue
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            image = node.image.copy()
            image.scale(4096, 4096)
            image.filepath_raw = str(Path(destination).with_suffix('.jpg'))
            image.file_format = 'JPEG'
            image.save()
            image.pack()
            node.image = image
bpy.ops.export_scene.gltf(filepath=destination, use_selection=True,
    export_format='GLB', export_image_format='JPEG', export_materials='EXPORT')
print('Exported cropped aisle:', len(obj.data.polygons), 'faces')
