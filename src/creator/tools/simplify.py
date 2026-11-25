"""Blender background-only mobile LOD, operating on a stripped bind-pose copy."""
import sys
import bpy

source,destination=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.context.view_layer.objects.active=mesh
mesh.select_set(True)
# Bias simplification toward torso/legs so the face retains more edge detail.
group=mesh.vertex_groups.new(name='PreservePortrait')
zs=[v.co.z for v in mesh.data.vertices]
bottom,top=min(zs),max(zs)
for v in mesh.data.vertices:
    height=(v.co.z-bottom)/(top-bottom)
    group.add([v.index], max(0.01, min(1.0,(height-0.68)*5)), 'REPLACE')
reduction=mesh.modifiers.new('portrait LOD','DECIMATE')
reduction.ratio=0.27
reduction.vertex_group=group.name
reduction.vertex_group_factor=2
reduction.invert_vertex_group=True
bpy.ops.object.modifier_apply(modifier=reduction.name)
bpy.ops.export_scene.gltf(filepath=destination,export_format='GLB',export_animations=False,export_skins=False,export_extras=False,export_cameras=False,export_lights=False,export_image_format='JPEG',export_jpeg_quality=86)
