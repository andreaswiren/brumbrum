import {
  Color3,
  Curve3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  TransformNode,
  Vector3,
  Quaternion,
} from '@babylonjs/core';
type Palette = Record<'paint' | 'dark' | 'metal' | 'suit', PBRMaterial>;
export function addBikeDetails(
  scene: Scene,
  chassis: Mesh,
  wheels: TransformNode[],
  meshes: Mesh[],
  materials: Palette,
): void {
  const { paint, dark, metal, suit } = materials;
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const steel = new PBRMaterial('gunmetal engine castings', scene);
  steel.albedoColor = Color3.FromHexString('#4a5558');
  steel.metallic = 0.78;
  steel.roughness = 0.52;
  const bronze = new PBRMaterial('heat stained titanium exhaust', scene);
  bronze.albedoColor = Color3.FromHexString('#9b8770');
  bronze.metallic = 0.85;
  bronze.roughness = 0.33;
  const register = (m: Mesh, mat: PBRMaterial, parent: TransformNode = chassis) => {
    m.parent = parent;
    m.material = mat;
    meshes.push(m);
    return m;
  };
  const box = (
    name: string,
    size: Vector3,
    pos: Vector3,
    mat: PBRMaterial,
    parent: TransformNode = chassis,
  ) => {
    const m = register(
      MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene),
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
    parent: TransformNode = chassis,
    diameterTop = diameter,
  ) => {
    const delta = b.subtract(a),
      m = register(
        MeshBuilder.CreateCylinder(
          name,
          { height: delta.length(), diameterBottom: diameter, diameterTop, tessellation: 24 },
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
  const tube = (name: string, path: Vector3[], radius: number, mat: PBRMaterial, smooth = true) =>
    register(
      MeshBuilder.CreateTube(
        name,
        {
          path: smooth ? Curve3.CreateCatmullRomSpline(path, 7).getPoints() : path,
          radius,
          tessellation: 16,
          cap: Mesh.CAP_ALL,
        },
        scene,
      ),
      mat,
    );
  const ellipsoid = (name: string, size: Vector3, pos: Vector3, mat: PBRMaterial) => {
    const m = register(MeshBuilder.CreateSphere(name, { diameter: 1, segments: 24 }, scene), mat);
    m.scaling.copyFrom(size);
    m.position.copyFrom(pos);
    return m;
  };
  for (const side of [-1, 1]) {
    const x = side * 0.18;
    tube(
      'welded twin spar perimeter frame',
      [
        v(x, 0.4, 0.49),
        v(x, 0.04, 0.34),
        v(x, -0.27, 0.27),
        v(x, -0.3, -0.17),
        v(x, -0.1, -0.31),
        v(x, 0.24, -0.36),
      ],
      0.036,
      metal,
    );
    tube(
      'rear tubular subframe',
      [v(x, -0.06, -0.12), v(x, 0.31, -0.69), v(side * 0.12, 0.34, -1.01)],
      0.026,
      metal,
    );
    rod('upper frame spar', v(x, 0.39, 0.48), v(x, 0.27, -0.39), 0.071, metal);
    box('radiator core', v(0.052, 0.34, 0.27), v(side * 0.18, 0.06, 0.32), steel);
    for (let i = 0; i < 13; i++)
      box(
        'radiator heat exchanger fin',
        v(0.022, 0.009, 0.25),
        v(side * 0.216, -0.085 + i * 0.024, 0.32),
        metal,
      );
    tube(
      'radiator coolant hose',
      [v(side * 0.22, -0.1, 0.4), v(side * 0.24, -0.16, 0.31), v(side * 0.13, -0.05, 0.14)],
      0.024,
      dark,
    );
    const casePos = v(side * 0.19, -0.105, -0.07);
    ellipsoid('rounded clutch and generator cover', v(0.095, 0.34, 0.35), casePos, metal);
    rod(
      'engine cover inspection cap',
      v(side * 0.23, -0.1, -0.07),
      v(side * 0.249, -0.1, -0.07),
      0.11,
      steel,
    );
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rod(
        'engine case perimeter fastener',
        v(side * 0.226, -0.1 + Math.cos(a) * 0.132, -0.07 + Math.sin(a) * 0.136),
        v(side * 0.245, -0.1 + Math.cos(a) * 0.132, -0.07 + Math.sin(a) * 0.136),
        0.023,
        steel,
      );
    }
    box('serrated footpeg platform', v(0.2, 0.034, 0.1), v(side * 0.29, -0.055, -0.035), steel);
    for (let i = 0; i < 6; i++)
      rod(
        'footpeg grip pin',
        v(side * (0.21 + i * 0.033), -0.054, -0.035),
        v(side * (0.21 + i * 0.033), -0.023, -0.035),
        0.016,
        metal,
      );
    rod(
      'rubber handlebar grip',
      v(side * 0.31, 0.68, 0.55),
      v(side * 0.49, 0.68, 0.55),
      0.061,
      dark,
    );
    for (let i = 0; i < 7; i++)
      rod(
        'handlebar grip rib',
        v(side * (0.32 + i * 0.023), 0.68, 0.55),
        v(side * (0.327 + i * 0.023), 0.68, 0.55),
        0.065,
        dark,
      );
    tube(
      'forged brake and clutch lever',
      [
        v(side * 0.29, 0.69, 0.57),
        v(side * 0.33, 0.7, 0.64),
        v(side * 0.47, 0.68, 0.65),
        v(side * 0.51, 0.675, 0.63),
      ],
      0.01,
      metal,
    );
    tube(
      'braided control hose',
      [
        v(side * 0.29, 0.69, 0.61),
        v(side * 0.23, 0.63, 0.78),
        v(side * 0.19, 0.28, 0.78),
        v(side * 0.16, -0.06, 0.8),
      ],
      0.007,
      dark,
    );
    rod('axle nut', v(side * 0.14, -0.22, 0.825), v(side * 0.18, -0.22, 0.825), 0.064, metal);
  }
  ellipsoid('cast crankcase body', v(0.36, 0.32, 0.47), v(0, -0.11, -0.03), steel);
  rod('single cylinder barrel', v(0, -0.05, 0.03), v(0, 0.22, 0.15), 0.23, steel, chassis, 0.21);
  for (let i = 0; i < 7; i++) {
    const y = 0.015 + i * 0.03,
      z = 0.055 + i * 0.012;
    const fin = rod(
      'rounded cylinder cooling fin',
      v(0, y, z),
      v(0, y + 0.012, z + 0.004),
      0.28,
      metal,
    );
    fin.scaling.x = 0.91;
  }
  ellipsoid('rounded valve cover', v(0.23, 0.095, 0.2), v(0, 0.245, 0.15), steel);
  tube(
    'spark plug lead',
    [v(0.08, 0.27, 0.15), v(0.13, 0.29, 0.1), v(0.12, 0.22, -0.1)],
    0.01,
    dark,
  );
  tube('oil line', [v(-0.17, -0.12, 0.1), v(-0.19, 0.01, 0.19), v(-0.12, 0.2, 0.15)], 0.012, steel);
  tube(
    'curving exhaust header',
    [
      v(0.1, 0.17, 0.25),
      v(0.21, 0.14, 0.38),
      v(0.33, -0.03, 0.38),
      v(0.34, -0.14, 0.11),
      v(0.29, -0.03, -0.3),
      v(0.27, 0.22, -0.55),
    ],
    0.037,
    bronze,
  );
  rod(
    'tapered muffler inlet',
    v(0.275, 0.21, -0.48),
    v(0.28, 0.26, -0.65),
    0.07,
    bronze,
    chassis,
    0.135,
  );
  rod('oval titanium silencer', v(0.28, 0.26, -0.64), v(0.28, 0.33, -0.99), 0.14, metal);
  rod(
    'tapered carbon exhaust end cap',
    v(0.28, 0.33, -0.98),
    v(0.28, 0.345, -1.065),
    0.14,
    steel,
    chassis,
    0.092,
  );
  rod('exhaust outlet bore', v(0.28, 0.345, -1.065), v(0.28, 0.347, -1.072), 0.064, dark);
  for (const z of [-0.71, -0.93])
    rod(
      'silencer retaining strap',
      v(0.28, 0.26 + (-z - 0.64) * 0.2, z + 0.008),
      v(0.28, 0.26 + (-z - 0.64) * 0.2, z - 0.008),
      0.145,
      steel,
    );
  tube(
    'brake pedal',
    [v(0.23, -0.08, -0.05), v(0.31, -0.1, 0.07), v(0.35, -0.09, 0.14)],
    0.015,
    metal,
  );
  tube(
    'gear selector',
    [v(-0.22, -0.09, -0.1), v(-0.29, -0.12, 0.04), v(-0.35, -0.1, 0.05)],
    0.014,
    metal,
  );
  tube('drive chain upper run', [v(-0.155, -0.08, -0.02), v(-0.145, -0.08, -0.825)], 0.014, steel);
  tube('drive chain lower run', [v(-0.155, -0.18, -0.02), v(-0.145, -0.36, -0.825)], 0.014, steel);
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    rod(
      'upper chain link pin',
      v(-0.17, -0.08, -0.02 - t * 0.805),
      v(-0.135, -0.08, -0.02 - t * 0.805),
      0.015,
      metal,
    );
  }
  const spring: Vector3[] = [];
  for (let i = 0; i < 150; i++) {
    const t = i / 149;
    spring.push(
      v(
        Math.sin(t * Math.PI * 20) * 0.065,
        0.25 - t * 0.43,
        -0.3 + Math.cos(t * Math.PI * 20) * 0.065,
      ),
    );
  }
  tube('rear shock coil', spring, 0.012, paint, false);
  rod('rear damper piston shaft', v(0, 0.28, -0.3), v(0, -0.22, -0.3), 0.036, metal);
  rod('rear shock reservoir', v(0.09, 0.15, -0.27), v(0.09, 0.28, -0.27), 0.059, steel);
  for (const wheel of wheels) {
    const front = wheel === wheels[1];
    for (let i = 0; i < 42; i++)
      for (const row of [-1, 0, 1]) {
        const a = (i * Math.PI * 2) / 42 + row * 0.035;
        const block = box(
          'individual tyre tread lug',
          v(front ? 0.028 : 0.042, 0.034, front ? 0.033 : 0.045),
          v(row * (front ? 0.028 : 0.045), Math.cos(a) * 0.342, Math.sin(a) * 0.342),
          dark,
          wheel,
        );
        block.rotation.x = a;
      }
    rod('machined wheel hub', v(-0.075, 0, 0), v(0.075, 0, 0), 0.11, metal, wheel);
    for (const side of [-1, 1])
      rod('spoke hub flange', v(side * 0.06, 0, 0), v(side * 0.07, 0, 0), 0.14, metal, wheel);
    const disc = register(
      MeshBuilder.CreateTorus(
        'wave brake rotor',
        { diameter: wheel === wheels[1] ? 0.245 : 0.22, thickness: 0.025, tessellation: 56 },
        scene,
      ),
      metal,
      wheel,
    );
    disc.rotation.z = Math.PI / 2;
    disc.position.x = 0.09;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      rod(
        'rotor carrier arm',
        v(0.09, Math.cos(a) * 0.045, Math.sin(a) * 0.045),
        v(0.09, Math.cos(a + 0.22) * 0.112, Math.sin(a + 0.22) * 0.112),
        0.015,
        metal,
        wheel,
      );
    }
    const caliper = ellipsoid(
      'rounded brake caliper',
      v(0.09, 0.13, 0.085),
      v(0.135, wheel.position.y + 0.065, wheel.position.z - 0.115),
      steel,
    );
    caliper.rotation.x = -0.4;
    if (wheel === wheels[0]) {
      const sprocket = register(
        MeshBuilder.CreateTorus(
          'rear drive sprocket',
          { diameter: 0.26, thickness: 0.025, tessellation: 48 },
          scene,
        ),
        steel,
        wheel,
      );
      sprocket.rotation.z = Math.PI / 2;
      sprocket.position.x = -0.14;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const tooth = box(
          'sprocket tooth',
          v(0.018, 0.018, 0.014),
          v(-0.14, Math.cos(a) * 0.141, Math.sin(a) * 0.141),
          metal,
          wheel,
        );
        tooth.rotation.x = a;
      }
    }
  }
  if (typeof document !== 'undefined') {
    const texture = new DynamicTexture(
        'race number graphic',
        { width: 256, height: 256 },
        scene,
        false,
      ),
      c = texture.getContext();
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = '#172226';
    c.font = 'italic 900 148px sans-serif';
    c.fillText('27', 29, 181);
    texture.hasAlpha = true;
    texture.update();
    const decal = new PBRMaterial('printed race numbers', scene);
    decal.albedoTexture = texture;
    decal.useAlphaFromAlbedoTexture = true;
    decal.metallic = 0;
    decal.roughness = 0.66;
    decal.backFaceCulling = false;
    const plate = register(
      MeshBuilder.CreatePlane('front race number print', { width: 0.34, height: 0.34 }, scene),
      decal,
    );
    plate.position.set(0, 0.43, 0.736);
    plate.rotation.y = Math.PI;
    for (const side of [-1, 1]) {
      const number = register(
        MeshBuilder.CreatePlane('side race number print', { width: 0.34, height: 0.21 }, scene),
        decal,
      );
      number.position.set(side * 0.228, 0.23, -0.55);
      number.rotation.y = (side * -Math.PI) / 2;
    }
  }
  // Material batching preserves wheel articulation, keeping the richer model inexpensive to draw.
  for (const parent of [chassis, ...wheels]) {
    const palette = new Set(
      meshes.filter((m) => m !== chassis && m.parent === parent).map((m) => m.material),
    );
    for (const mat of palette) {
      const fixed = meshes.filter(
        (m) => m !== chassis && m.parent === parent && m.material === mat,
      );
      if (fixed.length < 2) continue;
      fixed.forEach((m) => {
        m.parent = null;
      });
      const merged = Mesh.MergeMeshes(fixed, true, true);
      if (!merged) continue;
      merged.parent = parent;
      merged.material = mat;
      merged.name = `${mat?.name ?? 'unpainted'} ${parent === chassis ? 'motorcycle body' : 'wheel'} details`;
      for (const m of fixed) {
        const index = meshes.indexOf(m);
        if (index >= 0) meshes.splice(index, 1);
      }
      meshes.push(merged);
    }
  }
}
