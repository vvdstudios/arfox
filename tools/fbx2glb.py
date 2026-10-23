import bpy, os, sys
SRC = r"C:/Users/codin/Downloads/FoxToVivid/FoxToVivid"
OUT = r"C:/projects/ARAPPS/fox-go/public/assets/fox.glb"
ANIMS = ["IdleBreathe","IdleLookAround","Walk","Run","Bite","JumpBite","GetHitFront","Death","Sleeping"]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(SRC,"SK_Fox.FBX"), automatic_bone_orientation=False)
arm = next(o for o in bpy.data.objects if o.type=='ARMATURE')
meshes = [o for o in bpy.data.objects if o.type=="MESH"]
for o in list(meshes):
    if not o.name.endswith("LOD0"):
        bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type=="MESH"]
import mathutils
bb=[o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
print("BBOX", [round(min(v[i] for v in bb),3) for i in range(3)], [round(max(v[i] for v in bb),3) for i in range(3)])
print("ARM", arm.name, "MESHES", [m.name for m in meshes])
import mathutils
for o in bpy.data.objects: print("OBJ", o.name, o.type, "parent=", o.parent.name if o.parent else None, "scale=", tuple(round(v,4) for v in o.scale), "wscale=", round(o.matrix_world.to_scale()[0],6))
ARM_WS = arm.matrix_world.to_scale()[0]
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
for o in bpy.data.objects: print("APPLIED", o.name, tuple(round(v,4) for v in o.scale), round(o.matrix_world.to_scale()[0],6))
print("HEADBONE", [round(v,3) for v in (arm.matrix_world @ arm.data.bones['Fox_ Head'].head_local)] if 'Fox_ Head' in arm.data.bones else [b.name for b in arm.data.bones][:5])
# drop any action that came with the base mesh
if arm.animation_data and arm.animation_data.action:
    arm.animation_data.action = None

base_objs = set(bpy.data.objects)
actions = []
for a in ANIMS:
    before = set(bpy.data.objects); before_act = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC,"Animations",f"ANIM_Fox_{a}.FBX"), automatic_bone_orientation=False)
    new_acts = [x for x in bpy.data.actions if x not in before_act]
    new_objs = [o for o in bpy.data.objects if o not in before]
    act = new_acts[0]
    act.name = a
    act.use_fake_user = True
    for fc in list(act.fcurves):
        if not fc.data_path.startswith('pose.bones'):
            act.fcurves.remove(fc)
    for fc in act.fcurves:
        if fc.data_path.endswith('location'):
            for kp in fc.keyframe_points:
                kp.co[1] *= ARM_WS; kp.handle_left[1] *= ARM_WS; kp.handle_right[1] *= ARM_WS
    actions.append(act)
    for o in new_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    print("ANIM", a, act.frame_range[:], len(act.fcurves))

# material
tex = os.path.join(SRC,"Textures")
def img(n, color=True):
    i = bpy.data.images.load(os.path.join(tex,n)); 
    if not color: i.colorspace_settings.name='Non-Color'
    return i
mat = bpy.data.materials.new("Fox"); mat.use_nodes=True
nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED')
def tnode(image, x):
    n = nt.nodes.new('ShaderNodeTexImage'); n.image=image; n.location=(x,0); return n
bc = tnode(img("T_Fox_BaseColor.PNG"), -600)
nt.links.new(bc.outputs['Color'], bsdf.inputs['Base Color'])
nm = tnode(img("T_Fox_Nml.PNG",False), -600)
nmap = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nm.outputs['Color'], nmap.inputs['Color']); nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
orm = tnode(img("T_Fox_OcclusionRoughnessMetallic.PNG",False), -900)
sep = nt.nodes.new('ShaderNodeSeparateColor')
nt.links.new(orm.outputs['Color'], sep.inputs['Color'])
nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
for m in meshes:
    m.data.materials.clear(); m.data.materials.append(mat)

# push actions to NLA so exporter picks all
arm.animation_data_create()
for act in actions:
    tr = arm.animation_data.nla_tracks.new(); tr.name = act.name
    tr.strips.new(act.name, int(act.frame_range[0]), act)
    tr.mute = True
arm.animation_data.action = None

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True,
    export_animation_mode='ACTIONS', export_image_format='JPEG', export_jpeg_quality=85,
    export_apply=False, export_yup=True)
print("DONE", os.path.getsize(OUT))
