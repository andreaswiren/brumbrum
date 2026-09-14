import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { RiderRig } from '../rider/RiderRig';
import { createMouldedShell, type BikeVisual } from './BikeVisual';

export type VehicleKind = 'bike' | 'atv' | 'monster' | 'snowmobile';

export const vehicleVisualDimensions = {
  atv: {
    wheelbase: 1.85,
    trackHalf: 0.78,
    wheelRadius: 0.47,
    suspensionLength: 0.48,
    chassisWidth: 0.72,
    chassisHeight: 0.34,
    chassisLength: 1.5,
    mass: 310,
    inertia: [110, 160, 110] as [number, number, number],
  },
  monster: {
    wheelbase: 3.65,
    trackHalf: 1.9,
    wheelRadius: 1.05,
    suspensionLength: 0.95,
    chassisWidth: 2.5,
    chassisHeight: 0.65,
    chassisLength: 4.5,
    mass: 3500,
    inertia: [6500, 10000, 7000] as [number, number, number],
  },
};

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Procedural vehicle detailing is batched by material while each wheel remains articulated. */
export function createFourWheelVisual(scene: Scene, kind: 'atv' | 'monster'): BikeVisual {
  const d = vehicleVisualDimensions[kind],
    truck = kind === 'monster';
  const material = (name: string, color: string, metallic: number, roughness: number) => {
    const m = new PBRMaterial(`${kind} ${name}`, scene);
    m.albedoColor = Color3.FromHexString(color);
    m.metallic = metallic;
    m.roughness = roughness;
    return m;
  };
  const paint = material(
    'painted bodywork',
    truck ? '#982f29' : '#353f40',
    truck ? 0.38 : 0.08,
    0.32,
  );
  const dark = material('rubber and textured seat', '#171c20', 0.02, 0.91);
  const steel = material('powder coated frame', '#242e35', 0.65, 0.48);
  const alloy = material('machined aluminium', '#a1a7a8', 0.88, 0.26);
  const red = material('springs and recovery hooks', '#c93722', 0.35, 0.34);
  const white = material('ivory racing stripe', '#e0ded0', 0.05, 0.48);
  const glass = material('tinted safety glass', '#3e6570', 0.1, 0.09);
  glass.alpha = 0.28;
  const light = material('headlamp lenses', '#f3e9c4', 0.2, 0.13);
  light.emissiveColor = new Color3(0.45, 0.39, 0.25);
  const tail = material('red taillight lenses', '#a6110b', 0.1, 0.2);
  tail.emissiveColor = new Color3(0.2, 0, 0);
  const chassis = MeshBuilder.CreateBox(
    `${kind} rigid body`,
    { width: d.chassisWidth, height: d.chassisHeight, depth: d.chassisLength },
    scene,
  );
  chassis.material = steel;
  chassis.isVisible = false;
  chassis.rotationQuaternion = Quaternion.Identity();
  const meshes: Mesh[] = [chassis];
  const register = (mesh: Mesh, mat: PBRMaterial, parent: TransformNode = chassis) => {
    mesh.material = mat;
    mesh.parent = parent;
    meshes.push(mesh);
    return mesh;
  };
  const box = (
    name: string,
    size: Vector3,
    pos: Vector3,
    mat: PBRMaterial,
    parent = chassis as TransformNode,
  ) => {
    const m = register(
      MeshBuilder.CreateBox(
        `${kind} ${name}`,
        { width: size.x, height: size.y, depth: size.z },
        scene,
      ),
      mat,
      parent,
    );
    m.position.copyFrom(pos);
    return m;
  };
  const rod = (
    name: string,
    a: Vector3,
    b: Vector3,
    diameter: number,
    mat: PBRMaterial,
    parent = chassis as TransformNode,
  ) => {
    const direction = b.subtract(a);
    const m = register(
      MeshBuilder.CreateCylinder(
        `${kind} ${name}`,
        { height: direction.length(), diameter, tessellation: 16 },
        scene,
      ),
      mat,
      parent,
    );
    m.position.copyFrom(a.add(b).scale(0.5));
    m.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      direction.normalize(),
      new Quaternion(),
    );
    return m;
  };
  const tube = (name: string, points: Vector3[], radius: number, mat: PBRMaterial) =>
    register(
      MeshBuilder.CreateTube(
        `${kind} ${name}`,
        { path: points, radius, tessellation: 12, cap: Mesh.CAP_ALL },
        scene,
      ),
      mat,
    );
  const coil = (a: Vector3, b: Vector3, radius: number) => {
    const axis = b.subtract(a),
      unit = axis.normalizeToNew();
    const tangent = Vector3.Cross(unit, Vector3.Right()).normalize(),
      bitangent = Vector3.Cross(unit, tangent).normalize();
    const points = Array.from({ length: 121 }, (_, i) => {
      const t = i / 120,
        angle = t * Math.PI * 18;
      return a
        .add(axis.scale(t))
        .add(tangent.scale(Math.cos(angle) * radius))
        .add(bitangent.scale(Math.sin(angle) * radius));
    });
    tube('coil spring', points, truck ? 0.025 : 0.012, red);
    rod('chrome shock shaft', a, b, truck ? 0.09 : 0.035, alloy);
  };

  // Four independent visual wheel roots: rear left/right, then front left/right.
  const wheels: TransformNode[] = [];
  for (const z of [-d.wheelbase / 2, d.wheelbase / 2])
    for (const side of [-1, 1]) {
      const wheel = new TransformNode(
        `${kind} ${z < 0 ? 'rear' : 'front'} ${side < 0 ? 'left' : 'right'} wheel`,
        scene,
      );
      wheel.parent = chassis;
      wheel.position.set(side * d.trackHalf, -d.suspensionLength, z);
      wheels.push(wheel);
      const width = truck ? 0.86 : 0.31,
        radius = d.wheelRadius;
      const tire = register(
        MeshBuilder.CreateCylinder(
          'wide off road tyre carcass',
          { height: width * 0.92, diameter: radius * 1.83, tessellation: 56 },
          scene,
        ),
        dark,
        wheel,
      );
      tire.rotation.z = Math.PI / 2;
      for (const face of [-1, 1]) {
        const sidewall = register(
          MeshBuilder.CreateTorus(
            'rounded tyre shoulder',
            { diameter: radius * 1.65, thickness: radius * 0.19, tessellation: 48 },
            scene,
          ),
          dark,
          wheel,
        );
        sidewall.rotation.z = Math.PI / 2;
        sidewall.position.x = face * width * 0.4;
        const bead = register(
          MeshBuilder.CreateTorus(
            'beadlock wheel ring',
            { diameter: radius * 1.05, thickness: radius * 0.065, tessellation: 40 },
            scene,
          ),
          alloy,
          wheel,
        );
        bead.rotation.z = Math.PI / 2;
        bead.position.x = face * width * 0.5;
        rod(
          'wheel barrel',
          v(face * width * 0.34, 0, 0),
          v(face * width * 0.51, 0, 0),
          radius * 0.92,
          steel,
          wheel,
        );
        rod(
          'axle hub',
          v(face * width * 0.5, 0, 0),
          v(face * width * 0.6, 0, 0),
          radius * 0.29,
          alloy,
          wheel,
        );
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6,
            r = radius * 0.51;
          rod(
            'beadlock bolt',
            v(face * width * 0.48, Math.cos(a) * r, Math.sin(a) * r),
            v(face * width * 0.53, Math.cos(a) * r, Math.sin(a) * r),
            radius * 0.04,
            steel,
            wheel,
          );
        }
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          rod(
            'alloy wheel spoke',
            v(face * width * 0.52, Math.cos(a) * radius * 0.12, Math.sin(a) * radius * 0.12),
            v(
              face * width * 0.49,
              Math.cos(a + 0.17) * radius * 0.43,
              Math.sin(a + 0.17) * radius * 0.43,
            ),
            radius * 0.11,
            alloy,
            wheel,
          );
        }
      }
      for (let i = 0; i < (truck ? 22 : 32); i++)
        for (const row of [-1, 1]) {
          const a = (i * Math.PI * 2) / (truck ? 22 : 32) + row * 0.025;
          const tread = box(
            'chevron tread lug',
            v(width * (truck ? 0.65 : 0.54), radius * 0.095, radius * (truck ? 0.12 : 0.115)),
            v(row * width * 0.23, Math.cos(a) * radius * 0.955, Math.sin(a) * radius * 0.955),
            dark,
            wheel,
          );
          tread.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), a).multiply(
            Quaternion.RotationAxis(Vector3.Up(), row * (truck ? 0.6 : 0.4)),
          );
        }
      const hub = v(side * d.trackHalf, -d.suspensionLength, z);
      for (const height of [-0.13, 0.05]) {
        rod(
          'suspension A arm front',
          v(side * d.chassisWidth * 0.36, height, z - 0.27),
          hub,
          truck ? 0.085 : 0.038,
          steel,
        );
        rod(
          'suspension A arm rear',
          v(side * d.chassisWidth * 0.36, height, z + 0.27),
          hub,
          truck ? 0.085 : 0.038,
          steel,
        );
      }
      coil(
        v(side * d.chassisWidth * 0.38, truck ? 0.34 : 0.21, z - 0.08),
        hub.add(v(-side * 0.12, 0.05, 0)),
        truck ? 0.12 : 0.058,
      );
      rod('CV driveshaft', v(0, -0.2, z), hub, truck ? 0.085 : 0.05, alloy);
    }

  if (!truck) {
    const shell = (
      name: string,
      sections: Parameters<typeof createMouldedShell>[2],
      mat: PBRMaterial = paint,
    ) => createMouldedShell(scene, `atv ${name}`, sections, mat, chassis, meshes);
    const oval = (name: string, size: Vector3, pos: Vector3, mat: PBRMaterial) => {
      const m = register(
        MeshBuilder.CreateSphere(`atv ${name}`, { diameter: 1, segments: 24 }, scene),
        mat,
      );
      m.position.copyFrom(pos);
      m.scaling.copyFrom(size);
      return m;
    };
    shell('central sculpted cowling', [
      { z: -0.76, y: 0.15, w: 0.23, h: 0.1 },
      { z: -0.3, y: 0.19, w: 0.33, h: 0.2 },
      { z: 0.12, y: 0.23, w: 0.3, h: 0.22 },
      { z: 0.46, y: 0.28, w: 0.32, h: 0.18 },
      { z: 0.73, y: 0.23, w: 0.19, h: 0.12 },
    ]);
    shell(
      'broad contoured utility seat',
      [
        { z: -0.93, y: 0.42, w: 0.11, h: 0.035 },
        { z: -0.77, y: 0.47, w: 0.25, h: 0.075 },
        { z: -0.38, y: 0.46, w: 0.24, h: 0.075 },
        { z: -0.03, y: 0.44, w: 0.16, h: 0.055 },
        { z: 0.14, y: 0.42, w: 0.07, h: 0.02 },
      ],
      dark,
    );
    shell('front sculpted nose', [
      { z: 0.55, y: 0.28, w: 0.42, h: 0.08 },
      { z: 0.79, y: 0.28, w: 0.63, h: 0.16 },
      { z: 1.02, y: 0.21, w: 0.59, h: 0.23 },
      { z: 1.24, y: 0.04, w: 0.36, h: 0.17 },
      { z: 1.3, y: -0.04, w: 0.17, h: 0.06 },
    ]);
    for (const side of [-1, 1]) {
      shell('flowing front fender', [
        { z: 0.12, x: side * 0.48, y: -0.13, w: 0.17, h: 0.07 },
        { z: 0.36, x: side * 0.62, y: 0.21, w: 0.25, h: 0.07 },
        { z: 0.7, x: side * 0.67, y: 0.35, w: 0.33, h: 0.055 },
        { z: 1.02, x: side * 0.66, y: 0.31, w: 0.33, h: 0.045 },
        { z: 1.29, x: side * 0.64, y: 0.08, w: 0.21, h: 0.03 },
      ]);
      shell('flowing rear fender', [
        { z: -1.34, x: side * 0.61, y: 0.09, w: 0.21, h: 0.035 },
        { z: -1.15, x: side * 0.65, y: 0.27, w: 0.32, h: 0.06 },
        { z: -0.86, x: side * 0.65, y: 0.33, w: 0.33, h: 0.075 },
        { z: -0.56, x: side * 0.6, y: 0.23, w: 0.26, h: 0.06 },
        { z: -0.4, x: side * 0.47, y: -0.14, w: 0.14, h: 0.05 },
      ]);
      tube(
        'front wing edge moulding',
        [
          v(side * 0.83, -0.11, 0.19),
          v(side * 0.94, 0.25, 0.53),
          v(side * 1.0, 0.3, 0.9),
          v(side * 0.85, 0.06, 1.28),
        ],
        0.035,
        dark,
      );
      tube(
        'rear wing edge moulding',
        [
          v(side * 0.83, 0.08, -1.31),
          v(side * 0.99, 0.29, -1.01),
          v(side * 0.94, 0.24, -0.65),
          v(side * 0.79, -0.12, -0.44),
        ],
        0.035,
        dark,
      );
      shell(
        'side engine enclosure',
        [
          { z: -0.52, x: side * 0.32, y: 0.01, w: 0.055, h: 0.18 },
          { z: -0.17, x: side * 0.37, y: 0.01, w: 0.07, h: 0.24 },
          { z: 0.22, x: side * 0.36, y: 0.07, w: 0.035, h: 0.18 },
        ],
        dark,
      );
      box('rubber floorboard tray', v(0.43, 0.055, 0.86), v(side * 0.59, -0.19, -0.13), dark);
      for (let i = 0; i < 9; i++)
        rod(
          'floorboard traction ribs',
          v(side * 0.4, -0.155, -0.49 + i * 0.089),
          v(side * 0.77, -0.155, -0.49 + i * 0.089),
          0.018,
          steel,
        );
      tube(
        'outer floorboard rail',
        [
          v(side * 0.77, -0.12, -0.54),
          v(side * 0.82, -0.17, -0.48),
          v(side * 0.82, -0.17, 0.27),
          v(side * 0.73, -0.06, 0.31),
        ],
        0.032,
        steel,
      );
      oval('headlamp recessed housing', v(0.31, 0.2, 0.085), v(side * 0.48, 0.225, 1.11), dark);
      oval('projector headlamp bezel', v(0.205, 0.145, 0.05), v(side * 0.48, 0.23, 1.157), alloy);
      oval('projector headlamp lens', v(0.167, 0.113, 0.055), v(side * 0.48, 0.23, 1.181), light);
      oval('rear tail lens', v(0.19, 0.075, 0.035), v(side * 0.53, 0.26, -1.32), tail);
      rod(
        'rack side grab rail',
        v(side * 0.49, 0.52, -1.26),
        v(side * 0.49, 0.52, -0.72),
        0.033,
        steel,
      );
      tube(
        'lower tubular chassis',
        [v(side * 0.31, -0.19, -0.77), v(side * 0.31, -0.26, 0.46), v(side * 0.28, 0.14, 0.76)],
        0.039,
        steel,
      );
    }
    oval('front radiator recess', v(0.42, 0.27, 0.065), v(0, -0.03, 1.27), dark);
    for (let i = 0; i < 7; i++)
      box('radiator screen slat', v(0.27, 0.012, 0.025), v(0, -0.11 + i * 0.029, 1.305), steel);
    tube(
      'protective front brush bar',
      [
        v(-0.52, -0.11, 1.13),
        v(-0.42, -0.17, 1.38),
        v(-0.32, 0.27, 1.37),
        v(0.32, 0.27, 1.37),
        v(0.42, -0.17, 1.38),
        v(0.52, -0.11, 1.13),
      ],
      0.037,
      steel,
    );
    rod('winch drum', v(-0.15, -0.16, 1.36), v(0.15, -0.16, 1.36), 0.1, alloy);
    tube(
      'red winch recovery strap',
      [v(0, -0.17, 1.43), v(0, -0.29, 1.45), v(0.07, -0.34, 1.43)],
      0.012,
      red,
    );
    for (const front of [false, true]) {
      const z0 = front ? 0.69 : -1.28,
        z1 = front ? 1.21 : -0.75,
        y = front ? 0.45 : 0.48;
      tube(
        'rounded luggage rack perimeter',
        [
          v(-0.66, y, z0 + 0.05),
          v(-0.6, y, z0),
          v(0.6, y, z0),
          v(0.66, y, z0 + 0.05),
          v(0.66, y, z1 - 0.05),
          v(0.6, y, z1),
          v(-0.6, y, z1),
          v(-0.66, y, z1 - 0.05),
          v(-0.66, y, z0 + 0.05),
        ],
        0.026,
        steel,
      );
      for (let i = 0; i < 6; i++)
        rod(
          'luggage rack load bar',
          v(-0.55 + i * 0.22, y, z0),
          v(-0.55 + i * 0.22, y, z1),
          0.022,
          steel,
        );
      for (const side of [-1, 1])
        rod(
          'rack mounting stanchion',
          v(side * 0.52, y - 0.14, (z0 + z1) / 2),
          v(side * 0.52, y, (z0 + z1) / 2),
          0.025,
          steel,
        );
    }
    rod('steering stem', v(0, 0.15, 0.35), v(0, 0.66, 0.53), 0.045, alloy);
    tube(
      'swept handlebar',
      [v(-0.46, 0.68, 0.55), v(-0.21, 0.73, 0.59), v(0.21, 0.73, 0.59), v(0.46, 0.68, 0.55)],
      0.025,
      alloy,
    );
    for (const side of [-1, 1]) {
      rod('rubber grip', v(side * 0.32, 0.68, 0.55), v(side * 0.49, 0.68, 0.55), 0.05, dark);
      tube(
        'brake lever',
        [v(side * 0.3, 0.7, 0.58), v(side * 0.35, 0.7, 0.64), v(side * 0.49, 0.69, 0.65)],
        0.009,
        alloy,
      );
    }
    oval('steering head instrument pod', v(0.3, 0.2, 0.27), v(0, 0.65, 0.58), paint);
    box(
      'recessed digital instrument screen',
      v(0.13, 0.025, 0.09),
      v(0, 0.75, 0.55),
      glass,
    ).rotation.x = -0.25;
    rod('fuel cap', v(0, 0.43, 0.27), v(0, 0.47, 0.27), 0.1, dark);
    oval('engine crankcase casting', v(0.46, 0.37, 0.39), v(0, -0.06, 0.04), alloy);
    tube(
      'curved exhaust header',
      [v(0.18, 0.02, 0.35), v(0.36, -0.09, 0.48), v(0.4, -0.11, -0.5), v(0.45, 0.08, -0.83)],
      0.032,
      alloy,
    );
    rod('exhaust muffler', v(0.46, 0.06, -0.57), v(0.46, 0.12, -1.12), 0.14, alloy);
    rod('exhaust outlet', v(0.46, 0.12, -1.11), v(0.46, 0.12, -1.17), 0.085, dark);
  } else {
    // Open roll cage and translucent glazing keep the articulated driver visible.
    createMouldedShell(
      scene,
      'monster rounded pickup hood',
      [
        { z: 0.57, y: 0.66, w: 1.05, h: 0.075 },
        { z: 0.8, y: 0.67, w: 1.18, h: 0.12 },
        { z: 1.55, y: 0.63, w: 1.19, h: 0.14 },
        { z: 2.12, y: 0.55, w: 1.16, h: 0.14 },
        { z: 2.3, y: 0.49, w: 1.05, h: 0.065 },
      ],
      paint,
      chassis,
      meshes,
    );
    box('pickup bed floor', v(2.32, 0.1, 1.51), v(0, 0.49, -1.4), dark);
    box('tailgate', v(2.43, 0.68, 0.11), v(0, 0.79, -2.22), paint);
    for (const side of [-1, 1]) {
      box('bed side panel', v(0.12, 0.62, 1.65), v(side * 1.17, 0.8, -1.43), paint);
      box('door shell', v(0.1, 0.69, 1.51), v(side * 1.17, 0.79, 0.08), paint);
      box('door handle', v(0.065, 0.055, 0.2), v(side * 1.24, 1.02, -0.37), dark);
      box('door white racing stripe', v(0.025, 0.2, 1.22), v(side * 1.233, 0.86, 0.08), white);
      box('side window', v(0.018, 0.55, 1.23), v(side * 1.14, 1.38, 0.1), glass);
      tube(
        'roll cage roof edge',
        [
          v(side * 1.03, 0.38, -0.63),
          v(side * 1.02, 1.86, -0.6),
          v(side * 0.96, 1.86, 0.7),
          v(side * 1.08, 0.57, 1.08),
        ],
        0.075,
        steel,
      );
      tube(
        'side protection rail',
        [
          v(side * 1.23, 0.17, -0.72),
          v(side * 1.47, 0.1, -0.7),
          v(side * 1.47, 0.1, 0.71),
          v(side * 1.23, 0.17, 0.73),
        ],
        0.09,
        steel,
      );
      box('wing mirror', v(0.14, 0.21, 0.26), v(side * 1.36, 1.25, 0.64), dark);
      for (const z of [-1.65, 1.7]) {
        const arch = Array.from({ length: 25 }, (_, i) => {
          const a = (0.14 + (i / 24) * 0.72) * Math.PI;
          return v(side * 1.28, -0.35 + Math.sin(a) * 0.98, z + Math.cos(a) * 0.82);
        });
        tube('sculpted wheel arch lip', arch, 0.1, paint);
        tube(
          'wheel arch black edge',
          arch.map((p) => p.add(v(side * 0.07, -0.025, 0))),
          0.035,
          dark,
        );
      }
      rod(
        'chrome beltline trim',
        v(side * 1.235, 0.65, -2.13),
        v(side * 1.235, 0.65, 2.17),
        0.024,
        alloy,
      );
      tube(
        'raised pickup cab pillar',
        [v(side * 1.12, 0.82, 0.88), v(side * 1.01, 1.8, 0.66), v(side * 0.95, 1.91, 0.53)],
        0.058,
        paint,
      );
      tube(
        'rear cab pillar',
        [v(side * 1.13, 0.95, -0.65), v(side * 1.04, 1.79, -0.62), v(side * 0.94, 1.89, -0.59)],
        0.062,
        paint,
      );
      box('headlamp lens', v(0.4, 0.22, 0.05), v(side * 0.9, 0.48, 2.3), light);
      box('rear combination lamp', v(0.19, 0.39, 0.05), v(side * 1.04, 0.8, -2.3), tail);
      tube(
        'side exit exhaust',
        [v(side * 0.4, -0.31, 0.55), v(side * 0.65, -0.4, -0.29), v(side * 1.38, -0.24, -0.68)],
        0.105,
        alloy,
      );
      rod(
        'exhaust black outlet',
        v(side * 1.38, -0.24, -0.68),
        v(side * 1.45, -0.23, -0.72),
        0.14,
        dark,
      );
      rod(
        'ladder chassis rail',
        v(side * 0.69, -0.28, -2.1),
        v(side * 0.69, -0.28, 2.06),
        0.17,
        steel,
      );
    }
    createMouldedShell(
      scene,
      'monster crowned pickup roof',
      [
        { z: -0.72, y: 1.86, w: 0.95, h: 0.025 },
        { z: -0.5, y: 1.9, w: 1.07, h: 0.045 },
        { z: 0.48, y: 1.9, w: 1.04, h: 0.045 },
        { z: 0.76, y: 1.85, w: 0.93, h: 0.02 },
      ],
      paint,
      chassis,
      meshes,
    );
    const windscreen = box('front windscreen', v(1.94, 0.96, 0.015), v(0, 1.36, 0.84), glass);
    windscreen.rotation.x = -0.22;
    box('rear cab window', v(1.99, 0.64, 0.015), v(0, 1.43, -0.6), glass);
    rod('roll cage diagonal one', v(-1.03, 0.5, -0.63), v(1.03, 1.81, -0.63), 0.065, steel);
    rod('roll cage diagonal two', v(1.03, 0.5, -0.63), v(-1.03, 1.81, -0.63), 0.065, steel);
    for (const z of [-0.56, 0.64])
      rod('roof cage cross brace', v(-1.04, 1.83, z), v(1.04, 1.83, z), 0.07, steel);
    box('front grille surround', v(2.38, 0.47, 0.12), v(0, 0.43, 2.25), alloy);
    tube(
      'chrome grille perimeter',
      [
        v(-0.7, 0.25, 2.39),
        v(-0.74, 0.28, 2.39),
        v(-0.74, 0.61, 2.39),
        v(0.74, 0.61, 2.39),
        v(0.74, 0.28, 2.39),
        v(0.7, 0.25, 2.39),
        v(-0.7, 0.25, 2.39),
      ],
      0.035,
      alloy,
    );
    box('vertical grille chrome divider', v(0.052, 0.37, 0.04), v(0, 0.44, 2.39), alloy);
    createMouldedShell(
      scene,
      'monster chrome front bumper',
      [
        { z: 2.37, y: 0.04, w: 1.21, h: 0.09 },
        { z: 2.47, y: 0.05, w: 1.3, h: 0.14 },
        { z: 2.56, y: 0.05, w: 1.2, h: 0.06 },
      ],
      alloy,
      chassis,
      meshes,
    );
    for (let i = 0; i < 7; i++)
      box('grille mesh upright', v(0.017, 0.31, 0.02), v(-0.57 + i * 0.19, 0.43, 2.365), alloy);
    box('radiator opening', v(1.3, 0.34, 0.04), v(0, 0.44, 2.33), dark);
    for (let i = 0; i < 6; i++)
      box('horizontal grille bar', v(1.29, 0.024, 0.03), v(0, 0.3 + i * 0.054, 2.36), alloy);
    for (const z of [-2.39, 2.43]) {
      rod('tubular bumper', v(-1.3, 0.05, z), v(1.3, 0.05, z), 0.14, steel);
      for (const side of [-1, 1]) {
        const hook = register(
          MeshBuilder.CreateTorus(
            'recovery shackle',
            { diameter: 0.19, thickness: 0.045, tessellation: 20 },
            scene,
          ),
          red,
        );
        hook.position.set(side * 0.53, -0.02, z);
        hook.rotation.x = Math.PI / 2;
      }
    }
    for (let i = 0; i < 6; i++)
      box('roof light bar module', v(0.24, 0.12, 0.14), v(-0.75 + i * 0.3, 1.98, 0.64), light);
    for (const z of [-d.wheelbase / 2, d.wheelbase / 2]) {
      rod('solid axle housing', v(-d.trackHalf, -0.93, z), v(d.trackHalf, -0.93, z), 0.18, steel);
      const differential = register(
        MeshBuilder.CreateSphere('differential casing', { diameter: 0.43, segments: 16 }, scene),
        steel,
      );
      differential.position.set(0, -0.93, z);
      rod('propeller shaft', v(0, -0.4, 0), v(0, -0.91, z), 0.12, alloy);
    }
    box('engine blower housing', v(0.63, 0.18, 0.6), v(0, 0.83, 1.45), alloy);
    for (const side of [-1, 0, 1]) {
      rod('air intake trumpet', v(side * 0.19, 0.9, 1.53), v(side * 0.19, 0.96, 1.82), 0.15, alloy);
      rod('intake dark bore', v(side * 0.19, 0.96, 1.818), v(side * 0.19, 0.963, 1.84), 0.11, dark);
    }
    box('dashboard', v(1.9, 0.19, 0.33), v(0, 0.84, 0.55), dark);
    box('bucket seat base', v(0.66, 0.12, 0.68), v(0, 0.42, -0.39), dark);
    box('bucket seat back', v(0.67, 0.72, 0.16), v(0, 0.83, -0.69), dark).rotation.x = -0.1;
    const steering = register(
      MeshBuilder.CreateTorus(
        'steering wheel',
        { diameter: 0.46, thickness: 0.045, tessellation: 32 },
        scene,
      ),
      dark,
    );
    steering.position.set(0, 0.78, 0.37);
    steering.rotation.x = Math.PI * 0.32;
    rod('steering column', v(0, 0.55, 0.63), v(0, 0.78, 0.37), 0.05, steel);
  }

  // Collapse hundreds of bolts, tread lugs and frame elements into material batches.
  for (const parent of [chassis, ...wheels])
    for (const mat of [paint, dark, steel, alloy, red, white, light, tail]) {
      const batch = meshes.filter(
        (m) => m !== chassis && m.parent === parent && m.material === mat,
      );
      if (batch.length < 2) continue;
      batch.forEach((m) => {
        m.parent = null;
      });
      const merged = Mesh.MergeMeshes(batch, true, true);
      if (merged) {
        merged.parent = parent;
        merged.material = mat;
        merged.name = `${kind} ${parent === chassis ? 'body' : 'wheel'} ${mat.name}`;
        for (const m of batch) meshes.splice(meshes.indexOf(m), 1);
        meshes.push(merged);
      }
    }
  const riderRig = new RiderRig(scene, chassis);
  meshes.push(...riderRig.meshes);
  return { chassis, wheels, rider: riderRig.root, riderRig, meshes };
}
