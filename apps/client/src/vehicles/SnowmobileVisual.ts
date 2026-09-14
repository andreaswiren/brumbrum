import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Scene,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { RiderRig } from '../rider/RiderRig';
import type { BikeVisual } from './BikeVisual';

export const snowmobileDimensions = {
  wheelbase: 2.05,
  trackHalf: 0.56,
  wheelRadius: 0.3,
  suspensionLength: 0.6,
  chassisWidth: 0.78,
  chassisHeight: 0.4,
  chassisLength: 2.4,
  mass: 255,
  inertia: [145, 190, 90] as [number, number, number],
} as const;

interface Animation {
  skis: TransformNode[];
  track: TransformNode;
  tread: Mesh[];
  phase: number;
}
const animations = new WeakMap<BikeVisual, Animation>();
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Detailed twin-ski mountain sled, with its forward direction along local +Z. */
export function createSnowmobileVisual(scene: Scene): BikeVisual {
  const material = (name: string, color: string, roughness: number, metallic = 0) => {
    const m = new PBRMaterial(name, scene);
    m.albedoColor = Color3.FromHexString(color);
    m.roughness = roughness;
    m.metallic = metallic;
    return m;
  };
  const paint = material('sled glacier blue metallic panels', '#227791', 0.3, 0.35);
  const trim = material('sled safety orange trim', '#eb641e', 0.34);
  const rubber = material('sled track rubber', '#171c21', 0.94);
  const seat = material('sled textured saddle', '#293039', 0.88);
  const alloy = material('sled brushed aluminium', '#9baeb9', 0.32, 0.86);
  const dark = material('sled graphite frame', '#303b44', 0.52, 0.55);
  const light = material('sled LED light strips', '#e9f5ff', 0.2);
  light.emissiveColor = new Color3(0.7, 0.88, 1);
  const glass = material('sled smoked windshield', '#172e3b', 0.08, 0.18);
  glass.alpha = 0.78;
  const chassis = MeshBuilder.CreateBox(
    'snowmobile rigid body',
    { width: 0.64, height: 0.24, depth: 1.65 },
    scene,
  );
  chassis.rotationQuaternion = Quaternion.Identity();
  chassis.material = dark;
  const meshes: Mesh[] = [chassis];
  const add = (m: Mesh, mat: PBRMaterial, parent: TransformNode = chassis) => {
    m.parent = parent;
    m.material = mat;
    meshes.push(m);
    return m;
  };
  const box = (
    name: string,
    size: Vector3,
    position: Vector3,
    mat: PBRMaterial,
    parent: TransformNode = chassis,
  ) => {
    const m = add(
      MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene),
      mat,
      parent,
    );
    m.position.copyFrom(position);
    return m;
  };
  const rod = (
    name: string,
    a: Vector3,
    b: Vector3,
    diameter: number,
    mat: PBRMaterial,
    parent: TransformNode = chassis,
  ) => {
    const d = b.subtract(a);
    const m = add(
      MeshBuilder.CreateCylinder(name, { height: d.length(), diameter, tessellation: 16 }, scene),
      mat,
      parent,
    );
    m.position.copyFrom(a.add(b).scale(0.5));
    m.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      d.normalize(),
      new Quaternion(),
    );
    return m;
  };
  // Six elliptical sections make a curved bonnet, tapering to the bumper.
  const sections = [
    [-0.22, 0.33, 0.19, 0.14],
    [0.05, 0.46, 0.25, 0.25],
    [0.48, 0.44, 0.23, 0.25],
    [0.85, 0.34, 0.16, 0.18],
    [1.12, 0.21, 0.09, 0.1],
    [1.2, 0.08, 0.04, 0.08],
  ];
  const positions: number[] = [],
    indices: number[] = [],
    normals: number[] = [];
  const segments = 20;
  for (const [z, width, height, cy] of sections)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * width, cy + Math.sin(a) * height, z);
    }
  for (let j = 0; j < sections.length - 1; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i,
        b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  VertexData.ComputeNormals(positions, indices, normals);
  const hood = add(new Mesh('sculpted snowmobile cowl', scene), paint);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.applyToMesh(hood);
  box('raised saddle cushion', v(0.41, 0.15, 1.05), v(0, 0.4, -0.55), seat);
  box('rear tunnel deck', v(0.61, 0.07, 1.45), v(0, 0.05, -0.74), alloy);
  box('tail lamp', v(0.31, 0.06, 0.03), v(0, 0.1, -1.49), trim);
  box('rear flexible snow flap', v(0.55, 0.35, 0.035), v(0, -0.21, -1.54), rubber).rotation.x =
    -0.22;
  box('windshield', v(0.54, 0.26, 0.025), v(0, 0.55, 0.4), glass).rotation.x = -0.5;
  box('centre cowl stripe', v(0.095, 0.022, 0.72), v(0, 0.45, 0.32), trim).rotation.x = 0.1;
  for (const side of [-1, 1]) {
    box('headlamp bezel', v(0.24, 0.105, 0.07), v(side * 0.21, 0.26, 0.87), dark).rotation.y =
      side * 0.2;
    box('projector headlight', v(0.19, 0.055, 0.075), v(side * 0.21, 0.27, 0.9), light).rotation.y =
      side * 0.2;
    box('running board', v(0.21, 0.06, 1.13), v(side * 0.4, -0.04, -0.5), alloy);
    for (let i = 0; i < 10; i++)
      box('boot grip cleat', v(0.18, 0.025, 0.018), v(side * 0.41, 0.006, -0.98 + i * 0.106), dark);
    for (let i = 0; i < 8; i++)
      box(
        'cowl cooling louvre',
        v(0.016, 0.14, 0.02),
        v(side * 0.425, 0.22, 0.03 + i * 0.057),
        dark,
      ).rotation.z = side * 0.23;
    rod('rear cargo rail', v(side * 0.31, 0.13, -1.39), v(side * 0.31, 0.13, -0.72), 0.033, dark);
    rod('handlebar riser', v(side * 0.07, 0.39, 0.21), v(side * 0.07, 0.68, 0.54), 0.032, alloy);
    rod('hand grip', v(side * 0.32, 0.68, 0.55), v(side * 0.48, 0.68, 0.55), 0.055, rubber);
    box('wind hand guard', v(0.19, 0.12, 0.065), v(side * 0.4, 0.7, 0.64), paint);
  }
  rod('handlebar cross tube', v(-0.46, 0.68, 0.55), v(0.46, 0.68, 0.55), 0.03, alloy);
  rod('rear bumper', v(-0.31, 0.13, -1.39), v(0.31, 0.13, -1.39), 0.035, dark);
  rod('front bumper', v(-0.31, 0.02, 1.18), v(0.31, 0.02, 1.18), 0.042, alloy);

  const track = new TransformNode('rear track suspension', scene);
  track.parent = chassis;
  track.position.set(0, -0.37, -0.6);
  const tread: Mesh[] = [];
  const halfLength = 0.63,
    radius = 0.27;
  // Stationary sidewalls are ribbon surfaces following the continuous belt loop.
  const loop = (x: number) =>
    Array.from({ length: 65 }, (_, i) => {
      const p = beltPoint(i / 64);
      return v(x, p.y, p.z);
    });
  const belt = add(
    MeshBuilder.CreateRibbon(
      'reinforced continuous track belt',
      { pathArray: [loop(-0.29), loop(0.29)], sideOrientation: Mesh.DOUBLESIDE },
      scene,
    ),
    rubber,
    track,
  );
  belt.receiveShadows = true;
  for (let i = 0; i < 48; i++)
    tread.push(box('deep powder track lug', v(0.61, 0.05, 0.045), v(0, 0, 0), rubber, track));
  for (const side of [-1, 1]) {
    rod(
      'rear skid rail',
      v(side * 0.22, -0.18, -halfLength),
      v(side * 0.22, -0.18, halfLength),
      0.037,
      alloy,
      track,
    );
    rod(
      'rear suspension arm',
      v(side * 0.2, 0.24, 0.4),
      v(side * 0.2, -0.16, -0.05),
      0.045,
      trim,
      track,
    );
    rod(
      'rear track shock',
      v(side * 0.12, 0.19, -0.4),
      v(side * 0.12, -0.1, 0.17),
      0.065,
      alloy,
      track,
    );
    for (const z of [-halfLength, -0.22, 0.22, halfLength]) {
      const wheel = add(
        MeshBuilder.CreateCylinder(
          'track bogie wheel',
          { diameter: Math.abs(z) > 0.5 ? radius * 1.84 : 0.28, height: 0.045, tessellation: 24 },
          scene,
        ),
        dark,
        track,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.25, Math.abs(z) > 0.5 ? 0 : -0.11, z);
      rod(
        'bogie axle cap',
        v(side * 0.265, wheel.position.y, z),
        v(side * 0.286, wheel.position.y, z),
        0.08,
        alloy,
        track,
      );
    }
  }
  const skis = [-1, 1].map((side) => {
    const ski = new TransformNode('steerable front ski', scene);
    ski.parent = chassis;
    ski.position.set(side * 0.56, -0.62, 1.025);
    const path = [
      v(0, 0.1, -0.55),
      v(0, 0, -0.4),
      v(0, -0.018, 0.12),
      v(0, 0.025, 0.48),
      v(0, 0.13, 0.7),
      v(0, 0.21, 0.78),
    ];
    add(
      MeshBuilder.CreateRibbon(
        'curved powder ski',
        {
          pathArray: [
            path.map((p) => p.add(v(-0.12, 0, 0))),
            path.map((p) => p.add(v(0.12, 0, 0))),
          ],
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene,
      ),
      dark,
      ski,
    );
    rod('ski carbide keel', v(0, -0.031, -0.37), v(0, -0.031, 0.49), 0.032, alloy, ski);
    rod('ski tip loop', v(-0.065, 0.11, 0.45), v(0, 0.25, 0.74), 0.025, trim, ski);
    rod('ski tip loop', v(0.065, 0.11, 0.45), v(0, 0.25, 0.74), 0.025, trim, ski);
    box('ski spindle shoe', v(0.12, 0.13, 0.21), v(0, 0.075, 0), alloy, ski);
    rod(
      'ski steering spindle',
      v(side * 0.56, -0.49, 1.025),
      v(side * 0.5, -0.19, 0.96),
      0.06,
      dark,
    );
    for (const z of [0.5, 0.9])
      rod(
        'front suspension wishbone',
        v(side * 0.22, -0.02, z),
        v(side * 0.51, -0.32, 1.0),
        0.037,
        alloy,
      );
    rod('front shock damper', v(side * 0.3, 0.14, 0.64), v(side * 0.51, -0.29, 0.98), 0.045, alloy);
    const a = v(side * 0.3, 0.14, 0.64),
      b = v(side * 0.51, -0.29, 0.98),
      axis = b.subtract(a).normalize();
    const across = Vector3.Cross(axis, Vector3.Right()).normalize(),
      other = Vector3.Cross(axis, across).normalize();
    const spring = Array.from({ length: 97 }, (_, i) =>
      a
        .add(b.subtract(a).scale(i / 96))
        .add(across.scale(Math.cos((i / 96) * 16 * Math.PI) * 0.045))
        .add(other.scale(Math.sin((i / 96) * 16 * Math.PI) * 0.045)),
    );
    add(
      MeshBuilder.CreateTube(
        'coil-over spring',
        { path: spring, radius: 0.009, tessellation: 6 },
        scene,
      ),
      trim,
    );
    return ski;
  });
  const wheels = [-1, 1].map((side) => {
    const contact = new TransformNode('sled suspension contact', scene);
    contact.parent = chassis;
    contact.position.set(0, -0.37, (side * snowmobileDimensions.wheelbase) / 2);
    return contact;
  });
  const riderRig = new RiderRig(scene, chassis);
  meshes.push(...riderRig.meshes);
  const visual: BikeVisual = { chassis, wheels, rider: riderRig.root, riderRig, meshes };
  animations.set(visual, { skis, track, tread, phase: 0 });
  animateSnowmobile(visual, 0, 0, 0);
  return visual;
}

/** Belt perimeter in local YZ; returns tangent angle for the transverse rubber lugs. */
function beltPoint(t: number): { y: number; z: number; angle: number } {
  const straight = 1.26,
    r = 0.27,
    arc = Math.PI * r,
    length = 2 * straight + 2 * arc;
  let d = (((t % 1) + 1) % 1) * length;
  if (d < straight) return { y: -r, z: -straight / 2 + d, angle: 0 };
  d -= straight;
  if (d < arc) {
    const a = d / r;
    return { y: -Math.cos(a) * r, z: straight / 2 + Math.sin(a) * r, angle: -a };
  }
  d -= arc;
  if (d < straight) return { y: r, z: straight / 2 - d, angle: -Math.PI };
  d -= straight;
  const a = d / r;
  return { y: Math.cos(a) * r, z: -straight / 2 - Math.sin(a) * r, angle: -Math.PI - a };
}

/** Call after generic wheel suspension updates. Existing wheel rotations are harmless. */
export function animateSnowmobile(
  visual: BikeVisual,
  dt: number,
  speed: number,
  steer: number,
): void {
  const animation = animations.get(visual);
  if (!animation) return;
  animation.phase = (animation.phase + (speed * dt) / (2.52 + Math.PI * 0.54)) % 1;
  for (let i = 0; i < animation.tread.length; i++) {
    const p = beltPoint(i / animation.tread.length + animation.phase),
      lug = animation.tread[i];
    lug.position.set(0, p.y, p.z);
    lug.rotation.x = p.angle;
  }
  animation.track.position.y = visual.wheels[0].position.y;
  for (const ski of animation.skis) {
    ski.rotation.y = steer * 0.46;
    ski.position.y = visual.wheels[1].position.y - 0.25;
  }
}
