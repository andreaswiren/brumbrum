import {
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { railwayPoint, waterAt, collisionHeight } from '@brumbrum/world-format';

/** Continuous graded railway with instanced rails/sleepers and a small rural station. */
export class Railway {
  readonly meshes: Mesh[] = [];
  readonly colliders: PhysicsAggregate[] = [];
  constructor(
    private scene: Scene,
    private addCaster: (mesh: Mesh) => void,
  ) {
    const steel = this.material('rail steel', '#61676b'),
      timber = this.material('weathered sleepers', '#4e3e2d'),
      ballast = this.material('rail ballast', '#77766e'),
      wall = this.material('station ochre plaster', '#b29a68'),
      roof = this.material('station slate roof', '#39444b'),
      trim = this.material('cream station trim', '#ddd2b2'),
      glass = this.material('station glass', '#345866');
    const rails: number[] = [],
      sleepers: number[] = [],
      beds: number[] = [],
      trestles: number[] = [];
    const count = 1024;
    for (let i = 0; i < count; i++) {
      const a = railwayPoint((i / count) * Math.PI * 2),
        b = railwayPoint(((i + 1) / count) * Math.PI * 2);
      const av = new Vector3(a.x, a.y, a.z),
        bv = new Vector3(b.x, b.y, b.z),
        center = av.add(bv).scale(0.5),
        dir = bv.subtract(av),
        length = dir.length(),
        yaw = Math.atan2(dir.x, dir.z),
        rotation = Quaternion.FromEulerAngles(-Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), yaw, 0),
        side = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      for (const sign of [-1, 1])
        this.matrix(
          rails,
          new Vector3(0.1, 0.16, length + 0.04),
          rotation,
          center.add(side.scale(sign * 0.85)).add(new Vector3(0, 0.24, 0)),
        );
      this.matrix(
        beds,
        new Vector3(4.6, 0.18, length + 0.08),
        rotation,
        center.add(new Vector3(0, 0.04, 0)),
      );
      for (let j = 0; j < 4; j++)
        this.matrix(
          sleepers,
          new Vector3(2.8, 0.16, 0.24),
          rotation,
          Vector3.Lerp(av, bv, (j + 0.5) / 4).add(new Vector3(0, 0.14, 0)),
        );
      if (
        waterAt(center.x, center.z) !== undefined ||
        collisionHeight(center.x, center.z) < center.y - 0.6
      ) {
        const deck = this.box(
          'railway river bridge',
          new Vector3(4.5, 0.45, length + 0.1),
          center,
          ballast,
          true,
        );
        deck.rotationQuaternion = rotation;
        deck.computeWorldMatrix(true);
        // Collider is created after rotation so it matches the graded deck.
        this.collide(deck);
        const ground = collisionHeight(center.x, center.z),
          height = center.y - ground;
        for (const sign of [-1, 1])
          this.matrix(
            trestles,
            new Vector3(0.4, height, 0.4),
            Quaternion.Identity(),
            center.add(side.scale(sign * 1.7)).subtract(new Vector3(0, height / 2, 0)),
          );
      }
    }
    this.batch('continuous railway rails', rails, steel);
    this.batch('railway timber sleepers', sleepers, timber);
    this.batch('graded ballast bed', beds, ballast);
    if (trestles.length) this.batch('river trestle supports', trestles, timber);
    // Station platform stays clear of the track. A broad ramp joins the apron.
    const platform = this.box(
      'station platform',
      new Vector3(48, 0.7, 9),
      new Vector3(0, 32.35, -909),
      ballast,
    );
    this.collide(platform);
    const access = this.box(
      'station platform access ramp',
      new Vector3(6.1, 0.18, 9),
      new Vector3(27, 32.3, -909),
      ballast,
    );
    access.rotation.z = -Math.atan2(0.7, 6);
    access.computeWorldMatrix(true);
    this.collide(access);
    const house = this.box(
      'Pine Valley station building',
      new Vector3(18, 5, 8),
      new Vector3(0, 35.2, -921),
      wall,
    );
    this.collide(house);
    for (const sign of [-1, 1]) {
      const panel = this.box(
        'pitched station roof',
        new Vector3(20, 0.22, 5.3),
        new Vector3(0, 38.1, -921 + sign * 2.2),
        roof,
      );
      panel.rotation.x = sign * 0.44;
    }
    for (const x of [-6, 0, 6]) {
      this.box('window trim', new Vector3(2.5, 2.4, 0.18), new Vector3(x, 35.4, -916.93), trim);
      this.box('station window', new Vector3(2.15, 2.05, 0.2), new Vector3(x, 35.4, -916.8), glass);
      this.box('window mullion', new Vector3(0.1, 2.1, 0.24), new Vector3(x, 35.4, -916.65), trim);
    }
    this.box('station door', new Vector3(1.4, 3, 0.22), new Vector3(8, 34.35, -916.8), timber);
    this.box('platform canopy', new Vector3(26, 0.18, 4), new Vector3(0, 36.7, -913.5), roof);
    for (const x of [-12, -4, 4, 12])
      this.box('canopy post', new Vector3(0.17, 4, 0.17), new Vector3(x, 34.7, -912), trim);
    for (const x of [-17, 17]) {
      this.box('platform bench', new Vector3(3, 0.18, 0.65), new Vector3(x, 33.35, -910), timber);
      this.box('bench back', new Vector3(3, 0.65, 0.13), new Vector3(x, 33.7, -910.3), timber);
      for (const dx of [-1, 1])
        this.box(
          'bench leg',
          new Vector3(0.15, 0.65, 0.5),
          new Vector3(x + dx, 32.95, -910),
          steel,
        );
    }
    if (typeof document !== 'undefined') {
      const sign = this.box(
        'PINE VALLEY station sign',
        new Vector3(8, 1.1, 0.12),
        new Vector3(0, 36.95, -916.6),
        trim,
      );
      const texture = new DynamicTexture(
        'station lettering',
        { width: 1024, height: 128 },
        scene,
        false,
      );
      texture.drawText('PINE VALLEY', null, 88, 'bold 76px sans-serif', '#f4ead0', '#243a36', true);
      const material = new StandardMaterial('station sign', scene);
      material.diffuseTexture = texture;
      material.emissiveColor = new Color3(0.2, 0.2, 0.2);
      sign.material = material;
    }
  }
  private material(name: string, color: string) {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor.setAll(0.1);
    return material;
  }
  private matrix(buffer: number[], scale: Vector3, rotation: Quaternion, position: Vector3) {
    Matrix.Compose(scale, rotation, position).copyToArray(buffer, buffer.length);
  }
  private batch(name: string, matrices: number[], material: StandardMaterial) {
    const mesh = MeshBuilder.CreateBox(name, { size: 1 }, this.scene);
    mesh.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16, true);
    mesh.material = material;
    mesh.receiveShadows = true;
    this.meshes.push(mesh);
    this.addCaster(mesh);
  }
  private box(
    name: string,
    size: Vector3,
    position: Vector3,
    material: StandardMaterial,
    _defer = false,
  ) {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: size.x, height: size.y, depth: size.z },
      this.scene,
    );
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.receiveShadows = true;
    this.meshes.push(mesh);
    this.addCaster(mesh);
    return mesh;
  }
  private collide(mesh: Mesh) {
    if (this.scene.getPhysicsEngine())
      this.colliders.push(
        new PhysicsAggregate(
          mesh,
          PhysicsShapeType.BOX,
          { mass: 0, friction: 0.8, restitution: 0 },
          this.scene,
        ),
      );
  }
}
