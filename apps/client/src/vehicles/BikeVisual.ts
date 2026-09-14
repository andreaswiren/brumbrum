import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  Quaternion,
} from '@babylonjs/core';
export interface BikeVisual {
  chassis: Mesh;
  wheels: TransformNode[];
  rider: TransformNode;
  meshes: Mesh[];
}
export function createBikeVisual(scene: Scene): BikeVisual {
  const paint = new StandardMaterial('acid yellow plastics', scene);
  paint.diffuseColor = Color3.FromHexString('#dce94f');
  paint.specularColor = new Color3(0.5, 0.5, 0.4);
  const dark = new StandardMaterial('rubber and seat', scene);
  dark.diffuseColor = Color3.FromHexString('#202726');
  dark.specularColor = new Color3(0.08, 0.08, 0.08);
  const metal = new StandardMaterial('brushed aluminium', scene);
  metal.diffuseColor = new Color3(0.55, 0.59, 0.6);
  metal.specularColor = new Color3(0.8, 0.8, 0.8);
  const suit = new StandardMaterial('rider jersey', scene);
  suit.diffuseColor = Color3.FromHexString('#eae9d8');
  const chassis = MeshBuilder.CreateBox(
    'motorcycle rigid body',
    { width: 0.38, height: 0.36, depth: 1.15 },
    scene,
  );
  chassis.material = dark;
  chassis.rotationQuaternion = Quaternion.Identity();
  const meshes: Mesh[] = [chassis];
  function box(
    name: string,
    size: Vector3,
    position: Vector3,
    material: StandardMaterial,
    parent: TransformNode = chassis,
  ): Mesh {
    const m = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
    m.parent = parent;
    m.position.copyFrom(position);
    m.material = material;
    meshes.push(m);
    return m;
  }
  function rod(
    name: string,
    a: Vector3,
    b: Vector3,
    diameter: number,
    material: StandardMaterial,
    parent: TransformNode = chassis,
  ): Mesh {
    const d = b.subtract(a);
    const m = MeshBuilder.CreateCylinder(
      name,
      { height: d.length(), diameter, tessellation: 8 },
      scene,
    );
    m.parent = parent;
    m.position.copyFrom(a.add(b).scale(0.5));
    m.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      d.normalize(),
      new Quaternion(),
    );
    m.material = material;
    meshes.push(m);
    return m;
  }
  box('fuel tank', new Vector3(0.45, 0.3, 0.65), new Vector3(0, 0.29, 0.2), paint);
  box('saddle', new Vector3(0.32, 0.12, 0.85), new Vector3(0, 0.43, -0.24), dark);
  box('rear fender', new Vector3(0.3, 0.07, 0.55), new Vector3(0, 0.35, -0.83), paint);
  box('front fender', new Vector3(0.27, 0.07, 0.7), new Vector3(0, 0.19, 0.92), paint);
  box('number plate', new Vector3(0.37, 0.4, 0.07), new Vector3(0, 0.43, 0.7), suit);
  rod('handlebars', new Vector3(-0.48, 0.68, 0.55), new Vector3(0.48, 0.68, 0.55), 0.055, metal);
  for (const side of [-1, 1]) {
    rod(
      'front fork',
      new Vector3(side * 0.13, 0.45, 0.62),
      new Vector3(side * 0.13, -0.42, 0.825),
      0.065,
      metal,
    );
    rod(
      'swing arm',
      new Vector3(side * 0.16, -0.05, 0),
      new Vector3(side * 0.16, -0.42, -0.825),
      0.075,
      metal,
    );
  }
  const wheels = [-0.825, 0.825].map((z) => {
    const root = new TransformNode('wheel suspension', scene);
    root.parent = chassis;
    root.position.set(0, -0.42, z);
    const tire = MeshBuilder.CreateTorus(
      'knobby tyre',
      { diameter: 0.59, thickness: 0.16, tessellation: 24 },
      scene,
    );
    tire.rotation.z = Math.PI / 2;
    tire.parent = root;
    tire.material = dark;
    meshes.push(tire);
    const rim = MeshBuilder.CreateTorus(
      'wheel rim',
      { diameter: 0.42, thickness: 0.035, tessellation: 24 },
      scene,
    );
    rim.rotation.z = Math.PI / 2;
    rim.parent = root;
    rim.material = metal;
    meshes.push(rim);
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 8;
      rod(
        'spoke',
        new Vector3(0, Math.cos(angle) * 0.2, Math.sin(angle) * 0.2),
        new Vector3(0, -Math.cos(angle) * 0.2, -Math.sin(angle) * 0.2),
        0.012,
        metal,
        root,
      );
    }
    return root;
  });
  const rider = new TransformNode('independent rider placeholder', scene);
  rider.parent = chassis;
  const torso = box(
    'jersey',
    new Vector3(0.5, 0.61, 0.28),
    new Vector3(0, 1.04, -0.18),
    suit,
    rider,
  );
  torso.rotation.x = 0.22;
  const helmet = MeshBuilder.CreateSphere('helmet', { diameter: 0.41, segments: 12 }, scene);
  helmet.parent = rider;
  helmet.position.set(0, 1.54, 0.03);
  helmet.material = paint;
  meshes.push(helmet);
  box('goggles', new Vector3(0.32, 0.11, 0.13), new Vector3(0, 1.57, 0.21), dark, rider);
  for (const side of [-1, 1]) {
    rod(
      'upper arm',
      new Vector3(side * 0.27, 1.26, -0.08),
      new Vector3(side * 0.42, 0.98, 0.19),
      0.15,
      suit,
      rider,
    );
    rod(
      'forearm',
      new Vector3(side * 0.42, 0.98, 0.19),
      new Vector3(side * 0.4, 0.68, 0.55),
      0.12,
      dark,
      rider,
    );
    rod(
      'thigh',
      new Vector3(side * 0.19, 0.72, -0.32),
      new Vector3(side * 0.29, 0.38, 0.17),
      0.19,
      dark,
      rider,
    );
    rod(
      'boot',
      new Vector3(side * 0.29, 0.38, 0.17),
      new Vector3(side * 0.3, -0.1, -0.04),
      0.16,
      suit,
      rider,
    );
  }
  return { chassis, wheels, rider, meshes };
}
