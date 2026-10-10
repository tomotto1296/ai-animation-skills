"""T8 サイコロ: probe と scene で共有する部品（Blender 内で import）。単位はメートル。"""
import math
import bpy
from mathutils import Vector

FPS = 30
TOTAL = 300                 # 10 秒
SIZE = 0.08                 # サイコロの1辺
HALF = SIZE / 2
RELEASE = 8                 # このコマから自由落下（それまではキーフレームで投げる動き）
# 目の割り当て（向かい合う面の和が 7）: +Z=6, -Z=1, +X=3, -X=4, +Y=2, -Y=5
FACE_AXES = [((0, 0, 1), 6), ((0, 0, -1), 1), ((1, 0, 0), 3), ((-1, 0, 0), 4), ((0, 1, 0), 2), ((0, -1, 0), 5)]

# 目の点の配置（面の座標 u,v ∈ {-1,0,1}）
PIPS = {
    1: [(0, 0)],
    2: [(-1, -1), (1, 1)],
    3: [(-1, -1), (0, 0), (1, 1)],
    4: [(-1, -1), (-1, 1), (1, -1), (1, 1)],
    5: [(-1, -1), (-1, 1), (0, 0), (1, -1), (1, 1)],
    6: [(-1, -1), (-1, 0), (-1, 1), (1, -1), (1, 0), (1, 1)],
}


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def make_world(sc):
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 1, TOTAL
    sc.gravity = (0, 0, -9.81)
    if sc.rigidbody_world is None:
        bpy.ops.rigidbody.world_add()
    rw = sc.rigidbody_world
    rw.substeps_per_frame = 20
    rw.solver_iterations = 30
    rw.time_scale = 0.3          # スローで見せる（実時間 2〜3 秒の動きを 5〜7 秒に）
    rw.point_cache.frame_start, rw.point_cache.frame_end = 1, TOTAL


def make_table(sc):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    t = bpy.context.object
    t.name = "table"
    t.scale = (3.0, 2.0, 1.0)
    bpy.context.view_layer.objects.active = t
    bpy.ops.rigidbody.object_add(type="PASSIVE")
    rb = t.rigid_body
    rb.friction, rb.restitution = 0.6, 0.55
    rb.collision_shape = "BOX"
    return t


def make_dice(sc, pips=True):
    bpy.ops.mesh.primitive_cube_add(size=SIZE, location=(0, 0, HALF))
    d = bpy.context.object
    d.name = "dice"
    bev = d.modifiers.new("bevel", "BEVEL")
    bev.width, bev.segments = 0.006, 3
    bpy.context.view_layer.objects.active = d
    bpy.ops.rigidbody.object_add(type="ACTIVE")
    rb = d.rigid_body
    rb.mass, rb.friction, rb.restitution = 0.03, 0.45, 0.55
    rb.collision_shape = "BOX"
    rb.linear_damping, rb.angular_damping = 0.03, 0.08
    rb.use_margin = True
    rb.collision_margin = 0.0005
    if pips:
        pm = bpy.data.materials.new("pip")
        pm.use_nodes = True
        bsdf = pm.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (0.01, 0.01, 0.012, 1)
        bsdf.inputs["Roughness"].default_value = 0.3
        for axis, n in FACE_AXES:
            ax = Vector(axis)
            u = Vector((0, 0, 1)).cross(ax) if abs(ax.z) < 0.9 else Vector((1, 0, 0))
            u.normalize()
            v = ax.cross(u)
            for (a, b) in PIPS[n]:
                p = ax * (HALF + 0.0001) + u * (a * 0.021) + v * (b * 0.021)
                bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0072, segments=16, ring_count=8, location=(0, 0, 0))
                s = bpy.context.object
                s.scale = (1, 1, 0.28)
                s.rotation_mode = "QUATERNION"
                s.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(ax)
                s.location = p
                s.data.materials.append(pm)
                bpy.ops.object.shade_smooth()
                s.parent = d
                s.hide_select = True
        bpy.context.view_layer.objects.active = d
    return d


def set_throw(d, start, euler, vel, ang):
    """RELEASE-1 コマ目まではキーフレーム（kinematic）で等速に動かし、RELEASE で自由にする。"""
    rb = d.rigid_body
    d.rotation_mode = "XYZ"
    for f in range(1, RELEASE):
        k = (f - 1) / 30.0
        d.location = (start[0] + vel[0] * k, start[1] + vel[1] * k, start[2] + vel[2] * k)
        d.rotation_euler = (euler[0] + ang[0] * k, euler[1] + ang[1] * k, euler[2] + ang[2] * k)
        d.keyframe_insert("location", frame=f)
        d.keyframe_insert("rotation_euler", frame=f)
        rb.kinematic = True
        rb.keyframe_insert("kinematic", frame=f)
    rb.kinematic = False
    rb.keyframe_insert("kinematic", frame=RELEASE)


def face_up(d):
    m = d.matrix_world.to_3x3()
    best, bn = -2, 0
    for axis, n in FACE_AXES:
        z = (m @ Vector(axis)).normalized().z
        if z > best:
            best, bn = z, n
    return bn, best


def lowest_z(d):
    m = d.matrix_world
    return min((m @ Vector((sx * HALF, sy * HALF, sz * HALF))).z for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1))
