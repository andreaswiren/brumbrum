import {
  Color3,
  Curve3,
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
import { addBikeDetails } from './BikeDetails';
export interface BikeVisual {
  chassis: Mesh;
  wheels: TransformNode[];
  rider: TransformNode;
  riderRig: RiderRig;
  meshes: Mesh[];
}

/** Rounded cross sections follow the silhouette of moulded racing plastics. */
interface Section {
  z: number;
  y: number;
  w: number;
  h: number;
  x?: number;
}
export function createBikeVisual(scene: Scene): BikeVisual {
  const material = (name: string, color: string, metal: number, rough: number) => {
    const m = new PBRMaterial(name, scene);
    m.albedoColor = Color3.FromHexString(color);
    m.metallic = metal;
    m.roughness = rough;
    return m;
  };
  const paint = material('satin lime injection moulded plastics', '#65b62c', 0.05, 0.31);
  const dark = material('matte rubber and polymer', '#182023', 0.03, 0.86);
  const metal = material('brushed aluminium bike components', '#aab0b0', 0.87, 0.3);
  const suit = material('ivory number panel', '#e3e3d4', 0.02, 0.39);
  const seat = material('charcoal gripper saddle', '#222d30', 0, 0.94);
  const gold = material('anodised titanium fork sleeves', '#bbaa70', 0.75, 0.29);
  const chassis = MeshBuilder.CreateBox(
    'motorcycle rigid body',
    { width: 0.38, height: 0.36, depth: 1.15 },
    scene,
  );
  chassis.rotationQuaternion = Quaternion.Identity();
  // The collision root has no visible block: frame, engine and plastics define the silhouette.
  chassis.isVisible = false;
  const meshes: Mesh[] = [chassis];
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const register = (m: Mesh, mat: PBRMaterial, parent: TransformNode = chassis) => {
    m.parent = parent;
    m.material = mat;
    meshes.push(m);
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
    const delta = b.subtract(a),
      m = register(
        MeshBuilder.CreateCylinder(
          name,
          { height: delta.length(), diameter, tessellation: 24 },
          scene,
        ),
        mat,
        parent,
      );
    m.position.copyFrom(a.add(b).scale(0.5));
    m.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      delta.normalize(),
      new Quaternion(),
    );
    return m;
  };
  const tube = (name: string, points: Vector3[], radius: number, mat: PBRMaterial) =>
    register(
      MeshBuilder.CreateTube(
        name,
        {
          path: Curve3.CreateCatmullRomSpline(points, 6).getPoints(),
          radius,
          tessellation: 16,
          cap: Mesh.CAP_ALL,
        },
        scene,
      ),
      mat,
    );
  const loft = (name: string, sections: Section[], mat: PBRMaterial) =>
    createMouldedShell(
      scene,
      name,
      sections.map((section) => ({
        ...section,
        x: (section.x ?? 0) * 0.8,
        w: section.w * (name === 'sweeping front mudguard' ? 0.7 : 0.8),
      })),
      mat,
      chassis,
      meshes,
    );
  loft(
    'sculpted fuel tank',
    [
      { z: -0.38, y: 0.22, w: 0.04, h: 0.06 },
      { z: -0.18, y: 0.28, w: 0.17, h: 0.12 },
      { z: 0.15, y: 0.29, w: 0.205, h: 0.14 },
      { z: 0.39, y: 0.28, w: 0.16, h: 0.13 },
      { z: 0.53, y: 0.23, w: 0.055, h: 0.05 },
    ],
    paint,
  );
  loft(
    'contoured narrow gripper saddle',
    [
      { z: -0.91, y: 0.4, w: 0.04, h: 0.025 },
      { z: -0.73, y: 0.43, w: 0.155, h: 0.052 },
      { z: -0.29, y: 0.43, w: 0.15, h: 0.05 },
      { z: 0.06, y: 0.42, w: 0.11, h: 0.045 },
      { z: 0.22, y: 0.39, w: 0.055, h: 0.025 },
    ],
    seat,
  );
  loft(
    'sweeping front mudguard',
    [
      { z: 0.4, y: 0.1, w: 0.048, h: 0.014 },
      { z: 0.65, y: 0.18, w: 0.12, h: 0.024 },
      { z: 0.91, y: 0.21, w: 0.155, h: 0.035 },
      { z: 1.15, y: 0.16, w: 0.14, h: 0.024 },
      { z: 1.37, y: 0.05, w: 0.045, h: 0.008 },
    ],
    paint,
  );
  loft(
    'upswept rear mudguard',
    [
      { z: -1.31, y: 0.43, w: 0.04, h: 0.012 },
      { z: -1.1, y: 0.43, w: 0.13, h: 0.022 },
      { z: -0.84, y: 0.39, w: 0.16, h: 0.035 },
      { z: -0.52, y: 0.34, w: 0.145, h: 0.04 },
      { z: -0.35, y: 0.3, w: 0.07, h: 0.018 },
    ],
    paint,
  );
  for (const side of [-1, 1]) {
    loft(
      'flowing radiator shroud',
      [
        { z: -0.24, x: side * 0.2, y: 0.22, w: 0.013, h: 0.035 },
        { z: 0, x: side * 0.24, y: 0.17, w: 0.043, h: 0.18 },
        { z: 0.28, x: side * 0.28, y: 0.15, w: 0.04, h: 0.21 },
        { z: 0.49, x: side * 0.26, y: 0.04, w: 0.026, h: 0.15 },
        { z: 0.59, x: side * 0.2, y: -0.01, w: 0.007, h: 0.04 },
      ],
      paint,
    );
    loft(
      'tapered oval side number board',
      [
        { z: -0.97, x: side * 0.16, y: 0.31, w: 0.009, h: 0.035 },
        { z: -0.78, x: side * 0.22, y: 0.24, w: 0.025, h: 0.13 },
        { z: -0.5, x: side * 0.25, y: 0.2, w: 0.034, h: 0.15 },
        { z: -0.28, x: side * 0.23, y: 0.19, w: 0.021, h: 0.1 },
        { z: -0.21, x: side * 0.21, y: 0.19, w: 0.008, h: 0.035 },
      ],
      suit,
    );
    rod(
      'anodised upper fork tube',
      v(side * 0.13, 0.65, 0.565),
      v(side * 0.13, 0.05, 0.714),
      0.069,
      gold,
    );
    rod(
      'polished lower stanchion',
      v(side * 0.13, 0.08, 0.707),
      v(side * 0.13, -0.22, 0.825),
      0.046,
      metal,
    );
    rod('fork dust seal', v(side * 0.13, 0.07, 0.71), v(side * 0.13, 0.027, 0.72), 0.079, dark);
    rod(
      'moulded lower fork guard',
      v(side * 0.145, 0.01, 0.78),
      v(side * 0.145, -0.18, 0.834),
      0.068,
      suit,
    );
    rod(
      'rear swingarm box section',
      v(side * 0.15, -0.07, -0.02),
      v(side * 0.14, -0.22, -0.825),
      0.08,
      metal,
    );
    rod(
      'swingarm pivot cap',
      v(side * 0.16, -0.065, -0.025),
      v(side * 0.225, -0.065, -0.025),
      0.1,
      metal,
    );
    for (let rib = 0; rib < 7; rib++)
      tube(
        'raised saddle traction rib',
        [
          v(side * 0.02, 0.48, -0.72 + rib * 0.115),
          v(side * 0.068, 0.482, -0.7 + rib * 0.115),
          v(side * 0.112, 0.463, -0.69 + rib * 0.115),
        ],
        0.007,
        dark,
      );
  }
  // Front plate is a rounded shield, not a square suspended over the fork.
  const board = register(
    MeshBuilder.CreateSphere('rounded front race shield', { diameter: 1, segments: 32 }, scene),
    suit,
  );
  board.scaling.set(0.34, 0.43, 0.065);
  board.position.set(0, 0.43, 0.7);
  tube(
    'tapered aluminium handlebar',
    [
      v(-0.48, 0.68, 0.55),
      v(-0.29, 0.69, 0.55),
      v(-0.17, 0.76, 0.51),
      v(0.17, 0.76, 0.51),
      v(0.29, 0.69, 0.55),
      v(0.48, 0.68, 0.55),
    ],
    0.024,
    metal,
  );
  rod('handlebar crossbar pad', v(-0.18, 0.78, 0.515), v(0.18, 0.78, 0.515), 0.075, dark);
  for (const y of [0.27, 0.51])
    rod(
      'triple clamp crosspiece',
      v(-0.16, y, 0.73 - y * 0.24),
      v(0.16, y, 0.73 - y * 0.24),
      0.055,
      metal,
    );
  rod('fuel filler neck', v(0, 0.39, 0.28), v(0, 0.45, 0.28), 0.092, dark);
  rod('machined fuel cap', v(0, 0.445, 0.28), v(0, 0.465, 0.28), 0.106, metal);
  const wheels = [-0.825, 0.825].map((z) => {
    const root = new TransformNode('wheel suspension', scene);
    root.parent = chassis;
    root.position.set(0, -0.22, z);
    const front = z > 0,
      rimDiameter = front ? 0.535 : 0.47;
    const tire = register(
      MeshBuilder.CreateTorus(
        'rounded knobby tyre carcass',
        { diameter: front ? 0.625 : 0.59, thickness: front ? 0.07 : 0.1, tessellation: 64 },
        scene,
      ),
      dark,
      root,
    );
    tire.rotation.z = Math.PI / 2;
    tire.scaling.y = front ? 1.2 : 1.3;
    for (const side of [-1, 1]) {
      const rim = register(
        MeshBuilder.CreateTorus(
          'polished rim lip',
          { diameter: rimDiameter, thickness: 0.025, tessellation: 64 },
          scene,
        ),
        metal,
        root,
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.x = side * (front ? 0.033 : 0.046);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2,
          b = a + side * 0.33;
        rod(
          'cross laced steel spoke',
          v(side * 0.06, Math.cos(a) * 0.045, Math.sin(a) * 0.045),
          v(
            side * (front ? 0.03 : 0.041),
            Math.cos(b) * rimDiameter * 0.49,
            Math.sin(b) * rimDiameter * 0.49,
          ),
          0.006,
          metal,
          root,
        );
      }
    }
    return root;
  });
  const riderRig = new RiderRig(scene, chassis);
  meshes.push(...riderRig.meshes);
  addBikeDetails(scene, chassis, wheels, meshes, { paint, dark, metal, suit });
  return { chassis, wheels, rider: riderRig.root, riderRig, meshes };
}

export function createMouldedShell(
  scene: Scene,
  name: string,
  sections: Section[],
  mat: PBRMaterial,
  parent: TransformNode,
  meshes: Mesh[],
): Mesh {
  const rings = 28,
    points: Section[] = [];
  const spline = (a: number, b: number, c: number, d: number, t: number) =>
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t * t +
      (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < sections.length - 1; i++)
    for (let step = 0; step < 5; step++) {
      const a = sections[Math.max(0, i - 1)],
        b = sections[i],
        c = sections[i + 1],
        d = sections[Math.min(sections.length - 1, i + 2)],
        t = step / 5;
      points.push({
        x: spline(a.x ?? 0, b.x ?? 0, c.x ?? 0, d.x ?? 0, t),
        y: spline(a.y, b.y, c.y, d.y, t),
        z: spline(a.z, b.z, c.z, d.z, t),
        w: Math.max(0.003, spline(a.w, b.w, c.w, d.w, t)),
        h: Math.max(0.003, spline(a.h, b.h, c.h, d.h, t)),
      });
    }
  points.push(sections.at(-1)!);
  const positions: number[] = [],
    indices: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  points.forEach((p, row) => {
    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * Math.PI * 2;
      positions.push((p.x ?? 0) + Math.cos(a) * p.w, p.y + Math.sin(a) * p.h, p.z);
      uvs.push(j / rings, row / (points.length - 1));
    }
  });
  for (let i = 0; i < points.length - 1; i++)
    for (let j = 0; j < rings; j++) {
      const a = i * (rings + 1) + j,
        b = a + rings + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  for (const end of [0, points.length - 1]) {
    const p = points[end],
      centre = positions.length / 3;
    positions.push(p.x ?? 0, p.y, p.z);
    uvs.push(0.5, end ? 1 : 0);
    for (let j = 0; j < rings; j++) {
      const a = end * (rings + 1) + j;
      if (end) indices.push(centre, a + 1, a);
      else indices.push(centre, a, a + 1);
    }
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.parent = parent;
  mesh.material = mat;
  meshes.push(mesh);
  return mesh;
}
