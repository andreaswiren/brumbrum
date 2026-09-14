import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PhysicsAggregate,
  PhysicsShapeType,
  Quaternion,
  Scene,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { terrainHeight } from '@brumbrum/world-format';
import {
  timberStructures,
  timberSurfaceHeight,
  timberSurfaceRange,
  type TimberStructure,
} from '../../../../packages/world-format/src/timber';

/** Constructed riding surfaces use one continuous collider each. The plank seams
 * are visual details so suspension never catches on hundreds of little box edges. */
export class TimberStructures {
  readonly meshes: Mesh[] = [];
  readonly colliders: PhysicsAggregate[] = [];
  private materials: PBRMaterial[] = [];

  constructor(
    private scene: Scene,
    private addCaster: (mesh: Mesh) => void = () => {},
  ) {
    const wood = this.material('weathered timber boards', '#856548', 0.91);
    const frame = this.material('pressure treated timber frame', '#56472f', 0.96);
    const steel = this.material('galvanized connectors', '#59656a', 0.45);
    steel.metallic = 0.65;
    if (typeof document !== 'undefined') {
      const grain = new DynamicTexture(
        'timber grain and saw marks',
        { width: 256, height: 128 },
        scene,
        true,
      );
      const context = grain.getContext();
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 256; x++) {
          const wave = Math.sin(y * 1.8 + Math.sin(x * 0.037) * 1.7),
            noise = Math.sin(x * 12.73 + y * 72.4) * 5;
          const shade = Math.floor(207 + wave * 20 + noise);
          context.fillStyle = `rgb(${shade},${shade},${shade})`;
          context.fillRect(x, y, 1, 1);
        }
      grain.update(false);
      wood.albedoTexture = grain;
      frame.albedoTexture = grain;
    }
    for (const structure of timberStructures) this.build(structure, wood, frame, steel);
  }

  private material(name: string, color: string, roughness: number): PBRMaterial {
    const material = new PBRMaterial(name, this.scene);
    material.albedoColor = Color3.FromHexString(color);
    material.roughness = roughness;
    this.materials.push(material);
    return material;
  }

  private build(
    structure: TimberStructure,
    wood: PBRMaterial,
    frame: PBRMaterial,
    steel: PBRMaterial,
  ): void {
    const groups = new Map<PBRMaterial, Mesh[]>();
    const add = (mesh: Mesh, material: PBRMaterial) => {
      mesh.material = material;
      const group = groups.get(material) ?? [];
      group.push(mesh);
      groups.set(material, group);
      return mesh;
    };
    const beam = (name: string, a: Vector3, b: Vector3, width = 0.22, depth = width) => {
      const mesh = MeshBuilder.CreateBox(
        name,
        { width, height: Vector3.Distance(a, b), depth },
        this.scene,
      );
      mesh.position.copyFrom(a.add(b).scale(0.5));
      mesh.rotationQuaternion = Quaternion.Identity();
      Quaternion.FromUnitVectorsToRef(
        Vector3.Up(),
        b.subtract(a).normalize(),
        mesh.rotationQuaternion,
      );
      return add(mesh, frame);
    };
    const point = (x: number, along: number, offset = 0) =>
      new Vector3(
        structure.x + x,
        timberSurfaceHeight(structure, along) + offset,
        structure.z + along,
      );
    const [start, end] = timberSurfaceRange(structure),
      count = Math.ceil((end - start) / 0.58),
      step = (end - start) / count;
    for (let index = 0; index < count; index++) {
      const along = start + (index + 0.5) * step;
      const plank = MeshBuilder.CreateBox(
        'individual deck plank',
        { width: structure.width, height: 0.14, depth: step - 0.012 },
        this.scene,
      );
      plank.position.copyFrom(point(0, along, -0.07));
      plank.rotation.x = -Math.atan2(
        timberSurfaceHeight(structure, along + step / 2) -
          timberSurfaceHeight(structure, along - step / 2),
        step,
      );
      add(plank, wood);
      if (index % 2 === 0)
        for (const side of [-1, 1]) {
          const bolt = MeshBuilder.CreateCylinder(
            'recessed carriage bolt',
            { height: 0.014, diameter: 0.055, tessellation: 6 },
            this.scene,
          );
          bolt.position.copyFrom(point(side * (structure.width / 2 - 0.3), along, 0.008));
          add(bolt, steel);
        }
    }
    const supportStart = structure.kind === 'bridge' ? -structure.span / 2 : 1;
    const supportEnd = structure.kind === 'bridge' ? structure.span / 2 : structure.length;
    const supports = Math.ceil((supportEnd - supportStart) / 6);
    for (const side of [-1, 1]) {
      const x = side * (structure.width / 2 - 0.55);
      for (let index = 0; index <= supports; index++) {
        const along = supportStart + ((supportEnd - supportStart) * index) / supports;
        const top = point(x, along, -0.2);
        const base = new Vector3(
          top.x,
          Math.min(top.y - 0.6, terrainHeight(top.x, top.z) - 0.3),
          top.z,
        );
        beam('timber pier', base, top, 0.36);
        if (index < supports) {
          const next = supportStart + ((supportEnd - supportStart) * (index + 1)) / supports;
          beam('longitudinal stringer', point(x, along, -0.28), point(x, next, -0.28), 0.25, 0.38);
          const nextTop = point(x, next, -0.5);
          beam('diagonal timber brace', base.add(new Vector3(0, 0.25, 0)), nextTop, 0.18);
          if (structure.kind === 'bridge') {
            const otherBase = new Vector3(
              nextTop.x,
              Math.min(nextTop.y - 0.35, terrainHeight(nextTop.x, nextTop.z) - 0.1),
              nextTop.z,
            );
            beam('crossed timber brace', otherBase, top.add(new Vector3(0, -0.3, 0)), 0.18);
          }
        }
        beam(
          'transverse deck joist',
          point(-structure.width / 2 + 0.2, along, -0.26),
          point(structure.width / 2 - 0.2, along, -0.26),
          0.24,
        );
      }
      if (structure.kind === 'bridge') {
        const railX = side * (structure.width / 2 + 0.04);
        for (let along = -structure.span / 2; along <= structure.span / 2; along += 4)
          beam('bridge railing post', point(railX, along, -0.2), point(railX, along, 1.28), 0.17);
        for (const height of [0.58, 1.12])
          beam(
            'bridge handrail',
            point(railX, -structure.span / 2, height),
            point(railX, structure.span / 2, height),
            0.14,
            0.18,
          );
        const rail = MeshBuilder.CreateBox(
          'bridge side barrier collision',
          { width: 0.2, height: 1.2, depth: structure.span },
          this.scene,
        );
        rail.position.set(structure.x + railX, structure.deckHeight + 0.6, structure.z);
        rail.isVisible = false;
        this.meshes.push(rail);
        this.colliders.push(
          new PhysicsAggregate(rail, PhysicsShapeType.BOX, { mass: 0, friction: 0.4 }, this.scene),
        );
      }
    }
    const collider = this.surfaceCollider(structure);
    this.colliders.push(
      new PhysicsAggregate(
        collider,
        PhysicsShapeType.MESH,
        { mass: 0, friction: 0.7, restitution: 0.02 },
        this.scene,
      ),
    );
    for (const [material, pieces] of groups) {
      const merged = Mesh.MergeMeshes(pieces, true, true)!;
      merged.name = `${structure.name} / ${material.name}`;
      merged.receiveShadows = true;
      merged.isPickable = false;
      this.meshes.push(merged);
      this.addCaster(merged);
    }
  }

  private surfaceCollider(structure: TimberStructure): Mesh {
    const [start, end] = timberSurfaceRange(structure),
      segments = Math.ceil((end - start) / 0.45);
    const positions: number[] = [],
      indices: number[] = [];
    for (let index = 0; index <= segments; index++) {
      const along = start + ((end - start) * index) / segments,
        height = timberSurfaceHeight(structure, along);
      for (const depth of [0, -0.22])
        for (const side of [-1, 1])
          positions.push(
            structure.x + (side * structure.width) / 2,
            height + depth,
            structure.z + along,
          );
      if (index < segments) {
        const a = index * 4,
          b = a + 4;
        indices.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
        indices.push(a, a + 2, b, a + 2, b + 2, b, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
      }
    }
    const last = segments * 4;
    indices.push(0, 1, 2, 1, 3, 2, last, last + 2, last + 1, last + 1, last + 2, last + 3);
    const mesh = new Mesh(`${structure.name} smooth collision surface`, this.scene),
      data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.isVisible = false;
    this.meshes.push(mesh);
    return mesh;
  }

  dispose(): void {
    this.colliders.forEach((collider) => collider.dispose());
    this.meshes.forEach((mesh) => mesh.dispose());
    this.materials.forEach((material) => material.dispose(false, true));
    this.colliders.length = 0;
    this.meshes.length = 0;
  }
}
