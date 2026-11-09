"""Rig a baked, A-posed humanoid and give it a run cycle and a jump, all in code.

    blender -b --factory-startup --python-exit-code 1 -P tools/rig_hero.py -- \
        in.glb out.glb [--height 1.6] [--facing +x] [--report report.json] \
        [--motion UAL1_Standard.glb [--run-clip Sprint_Loop] [--hold-clip Idle_Torch_Loop] [--upright 0.5]]

1. Import the model (one mesh, as tools/lowpoly_bake.py writes it), turn it to face -Y
   (glTF +Z, the way a Three.js model faces), stand its feet on Z = 0 at the origin and scale
   it to --height metres. --facing names the axis the raw model's face points along.
2. Measure joints from the mesh itself: ankles, knees and hips from slices through the legs,
   the crotch from the gap between them, fingertips from the arms' outermost points, the
   shoulders from the torso's width. Every joint is printed, so a wrong guess shows.
3. Build a humanoid armature with Mixamo bone names (mixamorig:Hips and so on), so Mixamo
   clips can be retargeted later, and skin the mesh with automatic weights; any vertex the
   heat solve leaves without a bone goes to the nearest bone.
4. Key two clips by aiming bones at target directions: "run", one 20-frame loop at 30 fps
   (two strides in 0.67 s), and "jump", 24 frames from the push off through a tuck to the
   reach for the landing, which the page plays across the hero's time in the air.
   With --motion, the run is retargeted from a clip of Quaternius's Universal Animation
   Library (CC0, quaternius.com) instead of keyed by hand: each bone aims along the line
   between the same two joints of the source, which carries the motion over whatever the two
   skeletons' proportions and rest poses, and the hips move by the source's offsets scaled by
   leg length. The pole arm takes the held torch arm of --hold-clip, mirrored to the right.
   --upright takes that share of the source's forward lean out of the spine, and the head
   looks ahead rather than down: a full sprint lean hid the face and pointed the pole at the
   roof. The report gives "run_speed": metres per second at time scale 1, measured from the
   source's planted foot, so the page can set the clip's speed and the feet do not skate.
5. Export the GLB with its skin and both clips, and print counts and joint positions as JSON.

Blender 4.3 or newer. Never touches the input file.
"""

import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(argv) < 2:
    raise SystemExit("usage: rig_hero.py -- in.glb out.glb [--height M] [--facing +x|-x|+y|-y] [--report FILE]")
src, dst = os.path.abspath(argv[0]), os.path.abspath(argv[1])
opts = {"--height": "1.6", "--facing": "+x", "--report": "", "--motion": "", "--run-clip": "Sprint_Loop", "--hold-clip": "Idle_Torch_Loop", "--upright": "0.5"}
for i in range(2, len(argv) - 1, 2):
    if argv[i] not in opts:
        raise SystemExit(f"unknown option {argv[i]}")
    opts[argv[i]] = argv[i + 1]
height = float(opts["--height"])
turn = {"+x": -90, "-x": 90, "+y": 180, "-y": 0}[opts["--facing"]]

# 1. Import, turn to face -Y, feet on the ground at the origin, real height.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if len(meshes) != 1:
    raise SystemExit(f"expected one mesh, found {len(meshes)}")
body = meshes[0]
for o in list(bpy.context.scene.objects):
    if o is not body:
        bpy.data.objects.remove(o)
body.parent = None
body.name = "Lamplighter"
body.data.name = "Lamplighter"
body.matrix_world = Matrix.Rotation(math.radians(turn), 4, "Z") @ body.matrix_world
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# glTF splits vertices along every UV seam; the heat solve needs one connected surface.
# Merging keeps the UVs, which Blender stores per face corner.
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.object.mode_set(mode="OBJECT")

v = np.array([tuple(p.co) for p in body.data.vertices])
lo, hi = v.min(0), v.max(0)
s = height / (hi[2] - lo[2])
shift = np.array([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
for p in body.data.vertices:
    p.co = Vector(((np.array(p.co) + shift) * s).tolist())
v = (v + shift) * s
H = height


# 2. Measure joints.
def band(z0, z1, extra=None):
    m = (v[:, 2] >= z0 * H) & (v[:, 2] <= z1 * H)
    if extra is not None:
        m &= extra
    return v[m]


def side_centre(z0, z1, side):
    b = band(z0, z1, (v[:, 0] * side) > 0.005 * H)
    if len(b) == 0:
        raise SystemExit(f"no vertices on side {side} between {z0} and {z1} of the height")
    return b.mean(0)


# The crotch: the lowest point of the body between the legs.
mid = v[(np.abs(v[:, 0]) < 0.012 * H) & (v[:, 2] > 0.2 * H) & (v[:, 2] < 0.7 * H)]
crotch = mid[:, 2].min()
hip_z = crotch + 0.045 * H

# The arms: a line fitted through each arm's outer half, from the fingertip up to the
# elbow, meets shoulder height at the shoulder joint. (A gap between arm and torso is no
# use: a simplified mesh is sparse enough to show 2 cm gaps anywhere, and a painted A-pose
# can hang its arms against the body.)
chest = band(0.62, 0.66)
SHOULDER_Z = 0.795 * H
arm_lines = {}
for side in (1, -1):
    reach = v[(v[:, 2] > 0.35 * H) & (v[:, 2] < 0.85 * H)]
    tip = reach[np.argmax(reach[:, 0] * side)]
    outer = v[(v[:, 0] * side > 0.55 * tip[0] * side) & (v[:, 2] > tip[2]) & (v[:, 2] < 0.8 * H)]
    b, a = np.polyfit(outer[:, 2], outer[:, 0], 1)  # x as a function of z
    sx = side * float(np.clip(abs(a + b * SHOULDER_Z), 0.05 * H, 0.11 * H))
    arm_lines[side] = (tip, sx)
torso_half = (abs(arm_lines[1][1]) + abs(arm_lines[-1][1])) / 2 / 0.8

joints = {}
for side, name in ((1, "Left"), (-1, "Right")):
    # Character's left is +X once it faces -Y.
    joints[f"{name}Ankle"] = side_centre(0.045, 0.075, side) * [1, 1, 0] + [0, 0, 0.06 * H]
    leg_top = side_centre(max(crotch / H - 0.06, 0.3), crotch / H - 0.01, side)
    joints[f"{name}Hip"] = np.array([leg_top[0], leg_top[1], hip_z])
    # The knee sits a little below halfway from hip to ankle.
    kz = joints[f"{name}Ankle"][2] + 0.5 * (hip_z - joints[f"{name}Ankle"][2])
    joints[f"{name}Knee"] = side_centre(kz / H - 0.01, kz / H + 0.01, side) * [1, 1, 0] + [0, 0, kz]
    foot = band(0.0, 0.05, (v[:, 0] * side) > 0.005 * H)
    toe = foot[np.argmin(foot[:, 1])]
    ankle = joints[f"{name}Ankle"]
    joints[f"{name}ToeBase"] = np.array([ankle[0], ankle[1] + 0.7 * (toe[1] - ankle[1]), 0.025 * H])
    joints[f"{name}ToeEnd"] = np.array([ankle[0], toe[1], 0.02 * H])

    tip, sx = arm_lines[side]
    shoulder = np.array([sx, chest[:, 1].mean(), SHOULDER_Z])
    d = (tip - shoulder) / np.linalg.norm(tip - shoulder)
    wrist = tip - d * 0.085 * H
    joints[f"{name}Shoulder"] = np.array([side * 0.035 * H, shoulder[1], 0.79 * H])
    joints[f"{name}Arm"] = shoulder
    joints[f"{name}ForeArm"] = shoulder + (wrist - shoulder) * 0.5 + np.array([0, 0.012 * H, 0])
    joints[f"{name}Hand"] = wrist
    joints[f"{name}HandEnd"] = tip

cy = band(0.5, 0.75)[:, 1].mean()
# The neck: the narrowest slice between the shoulders and the head, arms left out.
widths = []
for z in np.arange(0.70, 0.93, 0.005):
    sl = band(z, z + 0.005, np.abs(v[:, 0]) < torso_half * 1.2)
    widths.append((np.abs(sl[:, 0]).max() if len(sl) else 1e9, z))
neck_z = min(widths)[1] * H
print(f"crotch {crotch:.3f} m, neck {neck_z:.3f} m, torso half-width {torso_half:.3f} m")
sp = np.linspace(hip_z, neck_z - 0.03 * H, 5)[1:4]
for k, z in (("Hips", hip_z), ("Spine", sp[0]), ("Spine1", sp[1]), ("Spine2", sp[2]), ("Neck", neck_z - 0.03 * H), ("Head", neck_z + 0.015 * H)):
    joints[k] = np.array([0.0, cy, z])
joints["HeadTop"] = np.array([0.0, cy, H])
for k in sorted(joints):
    print(f"joint {k:16s}", np.round(joints[k], 3).tolist())

# 3. The armature, with Mixamo names.
P = "mixamorig:"
bones = [
    # name, head joint, tail joint, parent
    ("Hips", "Hips", "Spine", None),
    ("Spine", "Spine", "Spine1", "Hips"),
    ("Spine1", "Spine1", "Spine2", "Spine"),
    ("Spine2", "Spine2", "Neck", "Spine1"),
    ("Neck", "Neck", "Head", "Spine2"),
    ("Head", "Head", "HeadTop", "Neck"),
]
for n in ("Left", "Right"):
    bones += [
        (f"{n}Shoulder", f"{n}Shoulder", f"{n}Arm", "Spine2"),
        (f"{n}Arm", f"{n}Arm", f"{n}ForeArm", f"{n}Shoulder"),
        (f"{n}ForeArm", f"{n}ForeArm", f"{n}Hand", f"{n}Arm"),
        (f"{n}Hand", f"{n}Hand", f"{n}HandEnd", f"{n}ForeArm"),
        (f"{n}UpLeg", f"{n}Hip", f"{n}Knee", "Hips"),
        (f"{n}Leg", f"{n}Knee", f"{n}Ankle", f"{n}UpLeg"),
        (f"{n}Foot", f"{n}Ankle", f"{n}ToeBase", f"{n}Leg"),
        (f"{n}ToeBase", f"{n}ToeBase", f"{n}ToeEnd", f"{n}Foot"),
    ]

arm_data = bpy.data.armatures.new("LamplighterRig")
rig = bpy.data.objects.new("LamplighterRig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name, h, t, parent in bones:
    eb = arm_data.edit_bones.new(P + name)
    eb.head = Vector(joints[h].tolist())
    eb.tail = Vector(joints[t].tolist())
    # Knees and elbows hinge about X: keep each bone's X axis lateral.
    eb.align_roll(Vector((0, -1, 0)) if abs(eb.vector.normalized().y) < 0.9 else Vector((0, 0, 1)))
    if parent:
        eb.parent = arm_data.edit_bones[P + parent]
        eb.use_connect = (eb.head - eb.parent.tail).length < 1e-4
bpy.ops.object.mode_set(mode="OBJECT")

# Bone heat fails on a generated mesh's thin, overlapping cloth layers (on the 24,000-
# triangle hero it weighted no vertex at all). Solve it on a watertight voxel copy instead,
# then carry the weights over to the real mesh from the nearest point on that copy.
proxy = bpy.data.objects.new("HeatProxy", body.data.copy())
bpy.context.scene.collection.objects.link(proxy)
remesh = proxy.modifiers.new("Remesh", "REMESH")
remesh.mode = "VOXEL"
remesh.voxel_size = 0.008 * H
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = proxy
proxy.select_set(True)
bpy.ops.object.modifier_apply(modifier="Remesh")
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
proxy_unweighted = sum(1 for p in proxy.data.vertices if not p.groups)
print(f"heat proxy: {len(proxy.data.vertices)} vertices, {proxy_unweighted} without a weight")

for b in arm_data.bones:
    body.vertex_groups.new(name=b.name)
transfer = body.modifiers.new("Weights", "DATA_TRANSFER")
transfer.object = proxy
transfer.use_vert_data = True
transfer.data_types_verts = {"VGROUP_WEIGHTS"}
transfer.vert_mapping = "POLYINTERP_NEAREST"
transfer.layers_vgroup_select_src = "ALL"
transfer.layers_vgroup_select_dst = "NAME"
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.modifier_apply(modifier="Weights")
bpy.data.objects.remove(proxy)

body.parent = rig
body.matrix_parent_inverse = rig.matrix_world.inverted()
skin = body.modifiers.new("Armature", "ARMATURE")
skin.object = rig

# Any vertex without a weight goes to the nearest bone segment.
groups = {g.index: g.name for g in body.vertex_groups}
segs = []
for b in arm_data.bones:
    segs.append((b.name, np.array(b.head_local), np.array(b.tail_local)))
unweighted = 0
for p in body.data.vertices:
    if sum(g.weight for g in p.groups) > 1e-4:
        continue
    unweighted += 1
    x = np.array(p.co)
    best, bd = None, 1e9
    for name, a, b in segs:
        ab = b - a
        t = np.clip(np.dot(x - a, ab) / np.dot(ab, ab), 0, 1)
        d = np.linalg.norm(x - (a + t * ab))
        if d < bd:
            best, bd = name, d
    body.vertex_groups[best].add([p.index], 1.0, "REPLACE")
print(f"vertices without a weight after the heat solve: {unweighted} of {len(body.data.vertices)}")

# Around the tunic's hem, cloth and trousers lie in thin layers that the heat solve splits
# between the thighs and the hips, so a swinging thigh pushes the trousers through the hem.
# From a little below the crotch up to the hip joints, hand a growing share of each thigh's
# weight to the hips, so the layers move together.
hips_group = body.vertex_groups[P + "Hips"]
leg_groups = {body.vertex_groups[P + n].index for n in ("LeftUpLeg", "RightUpLeg")}
z_lo, z_hi = crotch - 0.06 * H, hip_z + 0.02 * H
moved = 0
for p in body.data.vertices:
    z = p.co.z
    if not z_lo < z < z_hi:
        continue
    share = 0.6 * (z - z_lo) / (z_hi - z_lo)
    for g in p.groups:
        if g.group in leg_groups and g.weight > 0:
            give = g.weight * share
            g.weight -= give
            hips_group.add([p.index], give, "ADD")
            moved += 1
print(f"thigh weights blended into the hips near the hem: {moved}")

# The motion source, if any: import its armature alone (its meshes go).
src_rig = None
if opts["--motion"]:
    before = set(bpy.data.objects)
    src_fps = bpy.context.scene.render.fps
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(opts["--motion"]))
    new = [o for o in bpy.data.objects if o not in before]
    src_rig = next(o for o in new if o.type == "ARMATURE")
    for o in new:
        if o is not src_rig:
            bpy.data.objects.remove(o)
    src_rig.name = "MotionSource"
    if not src_rig.animation_data:
        src_rig.animation_data_create()
    src_rig.animation_data.action = None

# 4. Clips, by aiming bones in armature space.
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
pb = rig.pose.bones
for b in pb:
    b.rotation_mode = "QUATERNION"
FWD = Vector((0, -1, 0))


def aim(name, direction):
    """Turn a bone so it points along `direction` (armature space), keeping its twist."""
    b = pb[P + name]
    bpy.context.view_layer.update()
    cur = b.matrix.to_3x3() @ Vector((0, 1, 0))
    q = cur.rotation_difference(Vector(direction).normalized())
    m = b.matrix.copy()
    head = m.to_translation()
    m = (q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ m)
    m.translation = head
    b.matrix = m


def sag(angle_deg, lean=0.0):
    """A direction in the sagittal plane: 0 is straight down, positive swings forward."""
    a = math.radians(angle_deg)
    return Vector((lean, -math.sin(a), -math.cos(a)))


def up(angle_deg):
    """Straight up tilted forward by angle_deg."""
    a = math.radians(angle_deg)
    return Vector((0, -math.sin(a), math.cos(a)))


def bent(upper, angle_deg):
    """The direction `upper` bent forward by angle_deg (for elbows)."""
    u = Vector(upper).normalized()
    perp = (FWD - u * FWD.dot(u)).normalized()
    a = math.radians(angle_deg)
    return u * math.cos(a) + perp * math.sin(a)


def clear():
    for b in pb:
        b.rotation_quaternion = (1, 0, 0, 0)
        b.location = (0, 0, 0)


def key_all(frame):
    for b in pb:
        b.keyframe_insert("rotation_quaternion", frame=frame)
        b.keyframe_insert("location", frame=frame)


hips_rest = rig.data.bones[P + "Hips"].matrix_local.to_3x3()


def pose_run(p):
    clear()
    lean = 12
    # Hips bob twice per cycle, lowest at each mid-stance.
    bob = -0.022 * H * math.cos(4 * math.pi * p) - 0.01 * H
    pb[P + "Hips"].location = hips_rest.inverted() @ Vector((0, 0, bob))
    aim("Spine", up(lean * 0.5))
    aim("Spine1", up(lean))
    aim("Spine2", up(lean))
    aim("Neck", up(4))
    aim("Head", up(0))
    for side, name, ph in ((1, "Left", 0.0), (-1, "Right", 0.5)):
        t = 2 * math.pi * (p + ph)
        thigh = 38 * math.sin(t)
        knee = 15 + 85 * ((1 + math.cos(t)) / 2) ** 2
        aim(f"{name}UpLeg", sag(thigh, side * 0.06))
        aim(f"{name}Leg", sag(thigh - knee, side * 0.03))
        # The foot stays near level: toes up as the leg reaches, down at push-off.
        foot = 80 + 20 * math.sin(t)
        aim(f"{name}Foot", sag(foot))
        aim(f"{name}ToeBase", sag(90))
        # Arms swing against the legs: further back than forward, elbows near a right
        # angle, forearms drifting in towards the body's midline as they come forward.
        swing = -30 * math.sin(t) - 10
        upper = sag(swing, side * 0.16)
        aim(f"{name}Shoulder", Vector((side, 0, 0)))
        aim(f"{name}Arm", upper)
        fore = bent(upper, 75 - 15 * math.sin(t))
        fore = (fore - Vector((side * 0.3, 0, 0)) * max(0.0, -math.sin(t))).normalized()
        aim(f"{name}ForeArm", fore)
        # Hands relaxed: bent a little down from the forearm.
        aim(f"{name}Hand", (fore + Vector((0, 0, -0.5))).normalized())


# Retargeting: each of our bones aims along the line between two joints of the source.
SOURCE_LINES = [
    ("Hips", "pelvis", "spine_01"),
    ("Spine", "spine_01", "spine_02"),
    ("Spine1", "spine_02", "spine_03"),
    ("Spine2", "spine_03", "neck_01"),
    ("Neck", "neck_01", "Head"),
]
for n, x in (("Left", "l"), ("Right", "r")):
    SOURCE_LINES += [
        (f"{n}Shoulder", f"clavicle_{x}", f"upperarm_{x}"),
        (f"{n}Arm", f"upperarm_{x}", f"lowerarm_{x}"),
        (f"{n}ForeArm", f"lowerarm_{x}", f"hand_{x}"),
        (f"{n}Hand", f"hand_{x}", f"middle_01_{x}"),
        (f"{n}UpLeg", f"thigh_{x}", f"calf_{x}"),
        (f"{n}Leg", f"calf_{x}", f"foot_{x}"),
        (f"{n}Foot", f"foot_{x}", f"ball_{x}"),
        (f"{n}ToeBase", f"ball_{x}", f"ball_leaf_{x}"),
    ]
POLE_ARM = ("RightShoulder", "RightArm", "RightForeArm", "RightHand")
UPRIGHT_CHAIN = ("Hips", "Spine", "Spine1", "Spine2", "Neck")
upright = float(opts["--upright"])


def source_action(name):
    for a in bpy.data.actions:
        if a.name == name or a.name.startswith(name + "_"):
            return a
    raise SystemExit(f"no clip {name} in {opts['--motion']}: " + ", ".join(sorted(a.name for a in bpy.data.actions)))


def source_joints(action, t):
    """World positions of the source's joints `t` seconds into `action`, looped."""
    f0, f1 = action.frame_range
    f = f0 + (t * src_fps) % (f1 - f0)
    src_rig.animation_data.action = action
    bpy.context.scene.frame_set(int(f), subframe=f - int(f))
    mw = src_rig.matrix_world
    out = {b.name: mw @ b.head for b in src_rig.pose.bones}
    hb = src_rig.pose.bones["Head"]
    out["@head_up"] = (mw.to_3x3() @ hb.matrix.to_3x3() @ src_rig.data.bones["Head"].matrix_local.to_3x3().inverted()) @ Vector((0, 0, 1))
    return out


if src_rig:
    src_rest = {b.name: src_rig.matrix_world @ b.head_local for b in src_rig.data.bones}
    # Leg length as hip height above the ankle, ours against the source's.
    leg_ratio = (hip_z - joints["LeftAnkle"][2]) / (src_rest["thigh_l"].z - src_rest["foot_l"].z)
    run_src = source_action(opts["--run-clip"])
    hold_src = source_action(opts["--hold-clip"])
    run_len = (run_src.frame_range[1] - run_src.frame_range[0]) / src_fps


def pose_run_motion(p):
    # Sample first: changing frame re-evaluates our own action and would undo a cleared pose.
    t = p * run_len
    j = source_joints(run_src, t)
    hold = source_joints(hold_src, t)
    clear()
    off = (j["pelvis"] - src_rest["pelvis"]) * leg_ratio
    pb[P + "Hips"].location = hips_rest.inverted() @ off
    for ours, a, b in SOURCE_LINES:
        if ours in POLE_ARM:
            # The torch arm is the source's left: mirror it across the body.
            a, b = a[:-1] + "l", b[:-1] + "l"
            d = hold[b] - hold[a]
            d = Vector((-d.x, d.y, d.z))
        else:
            d = j[b] - j[a]
        if ours in UPRIGHT_CHAIN:
            d = Vector((d.x, d.y * (1 - upright), d.z))
        aim(ours, d)
        if ours == "Neck":
            # Eyes ahead: keep the source head's sway from side to side, not its nod.
            hu = j["@head_up"]
            aim("Head", Vector((hu.x * 0.6, -0.06, 1.0)))


def source_run_speed():
    """Ground speed the source clip implies: how fast a planted foot slides back."""
    n = 48
    ys, zs = [], []
    for k in range(n):
        jj = source_joints(run_src, k * run_len / n)
        ys.append(jj["ball_l"].y)
        zs.append(jj["ball_l"].z)
    floor = min(zs)
    v = [(ys[(k + 1) % n] - ys[k]) / (run_len / n) for k in range(n) if zs[k] < floor + 0.02 and zs[(k + 1) % n] < floor + 0.02]
    return sum(v) / len(v) * leg_ratio if v else 0.0


# The jump, as three key poses blended smoothly: the push off the roof's edge, a tuck at
# the top, and the reach for the next roof. Each value is (take-off, apex, landing).
JUMP_KEYS = {
    "lean": (16, 10, 4),            # spine tilt forward, degrees
    "lead_thigh": (55, 80, 38),     # left leg leads
    "lead_knee": (75, 115, 35),
    "trail_thigh": (-28, 30, 18),   # right leg pushes, then folds under
    "trail_knee": (15, 105, 45),
    "lead_foot": (70, 55, 85),
    "trail_foot": (5, 40, 75),
    "pole_arm": (60, 75, 50),       # right arm keeps the pole raised forward
    "free_arm": (-35, 20, 10),      # left arm swings back on the push, then out for balance
    "free_out": (0.3, 0.6, 0.9),
    "hips": (-0.01, 0.03, -0.02),   # hip height, in heights
}


def jump_value(key, p):
    a, b, c = JUMP_KEYS[key]
    if p < 0.45:
        t = p / 0.45
        lo, hi = a, b
    else:
        t = (p - 0.45) / 0.55
        lo, hi = b, c
    t = t * t * (3 - 2 * t)
    return lo + (hi - lo) * t


def pose_jump(p):
    clear()
    j = lambda k: jump_value(k, p)  # noqa: E731
    pb[P + "Hips"].location = hips_rest.inverted() @ Vector((0, 0, j("hips") * H))
    lean = j("lean")
    aim("Spine", up(lean * 0.6))
    aim("Spine1", up(lean))
    aim("Spine2", up(lean))
    aim("Neck", up(lean * 0.3))
    aim("Head", up(0))
    aim("LeftUpLeg", sag(j("lead_thigh"), 0.05))
    aim("LeftLeg", sag(j("lead_thigh") - j("lead_knee"), 0.03))
    aim("LeftFoot", sag(j("lead_foot")))
    aim("LeftToeBase", sag(90))
    aim("RightUpLeg", sag(j("trail_thigh"), -0.05))
    aim("RightLeg", sag(j("trail_thigh") - j("trail_knee"), -0.03))
    aim("RightFoot", sag(j("trail_foot")))
    aim("RightToeBase", sag(90))
    for side, name, swing, out in ((1, "Left", j("free_arm"), j("free_out")), (-1, "Right", j("pole_arm"), 0.25)):
        upper = sag(swing, side * out)
        aim(f"{name}Shoulder", Vector((side, 0, 0)))
        aim(f"{name}Arm", upper)
        fore = bent(upper, 35)
        aim(f"{name}ForeArm", fore)
        aim(f"{name}Hand", (fore + Vector((0, 0, -0.4))).normalized())


scene = bpy.context.scene
scene.render.fps = 30
rig.animation_data_create()

run = bpy.data.actions.new("run")
rig.animation_data.action = run
FRAMES = 20
if src_rig:
    # As many frames at 30 fps as the source loop lasts.
    FRAMES = max(8, round(run_len * 30))
    run_speed = source_run_speed()
    print(f"retargeting {run_src.name} ({run_len:.3f} s), leg ratio {leg_ratio:.3f}, ground speed at 1x {run_speed:.2f} m/s")
for f in range(FRAMES + 1):
    if src_rig:
        pose_run_motion((f % FRAMES) / FRAMES)
    else:
        pose_run((f % FRAMES) / FRAMES)
    key_all(f + 1)
run.use_fake_user = True

# The jump plays once across the hero's time in the air; the page sets its time from how
# far through the jump the hero is, so its length here only sets how finely it is sampled.
JUMP_FRAMES = 24
jump = bpy.data.actions.new("jump")
rig.animation_data.action = jump
for f in range(JUMP_FRAMES + 1):
    pose_jump(f / JUMP_FRAMES)
    key_all(f + 1)
jump.use_fake_user = True

# glTF exports each action as a clip when it sits in an NLA track. Pin each action's
# frame range, or the strip runs one frame long and the loop hitches.
# (glTF's exporter samples one frame past the end, so the end is the last frame before the
# loop closes: 20 frames give a 0.667 s clip whose last key equals its first.)
run.use_frame_range, run.frame_start, run.frame_end = True, 1, FRAMES
jump.use_frame_range, jump.frame_start, jump.frame_end = True, 1, JUMP_FRAMES
rig.animation_data.action = None
for act in (run, jump):
    track = rig.animation_data.nla_tracks.new()
    track.name = act.name
    strip = track.strips.new(act.name, 1, act)
    strip.frame_end = act.frame_end
clear()
bpy.ops.object.mode_set(mode="OBJECT")
if src_rig:
    bpy.data.objects.remove(src_rig)

# 5. Export.
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
rig.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_skins=True,
    export_yup=True,
)
report = {
    "out": dst,
    "triangles": sum(len(p.vertices) - 2 for p in body.data.polygons),
    "bones": len(arm_data.bones),
    "height": height,
    "unweighted_before_fill": unweighted,
    "joints": {k: np.round(j, 4).tolist() for k, j in joints.items()},
}
if src_rig is not None or opts["--motion"]:
    report["run_source"] = opts["--run-clip"]
    report["run_speed"] = round(run_speed, 3)
print(json.dumps(report))
if opts["--report"]:
    with open(opts["--report"], "w") as fh:
        json.dump(report, fh, indent=1)
