import { ForestAssets } from './ForestAssets';
import { TerrainMaterials } from './TerrainMaterials';
import { RockAssets } from './RockAssets';
import { createRockVisual } from './RockVisual';
import { TreeDestruction, type BreakableTree } from './TreeDestruction';
import type { VehicleKind } from '../vehicles/VehicleModels';
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
  VertexData,
} from '@babylonjs/core';
import { world } from '@brumbrum/configuration';
import {
  hash,
  jumps,
  sectorAt,
  sectorKey,
  terrainHeight,
  collisionHeight,
  trailDistance,
  waterAt,
  snowAmount,
  railwayClearing,
  isTimberFootprint,
  bridgeRoadClearing,
} from '@brumbrum/world-format';
interface Sector {
  mesh: Mesh;
  trees: Mesh[];
  collision?: PhysicsAggregate;
  props: PhysicsAggregate[];
  near: boolean;
}
export class TerrainWorld {
  private sectors = new Map<string, Sector>();
  private queue: { x: number; z: number; near: boolean }[] = [];
  private center = '';
  private terrainMaterial: StandardMaterial;
  private foliage: StandardMaterial;
  private bark: StandardMaterial;
  private markerMaterial: StandardMaterial;
  private grassMaterial: StandardMaterial;
  private rockMaterial: StandardMaterial;
  readonly markers: Mesh[] = [];
  private materials?: TerrainMaterials;
  private destruction: TreeDestruction;
  constructor(
    private scene: Scene,
    private addCaster: (mesh: Mesh) => void = () => {},
    private assets?: ForestAssets,
    private vegetationDensity = 1,
    private rocks?: RockAssets,
  ) {
    this.destruction = new TreeDestruction(scene, addCaster);
    if (typeof document !== 'undefined') this.materials = new TerrainMaterials(scene);
    this.terrainMaterial = new StandardMaterial('earth', scene);
    this.terrainMaterial.diffuseColor = Color3.White();
    this.terrainMaterial.specularColor = Color3.Black();
    // A shared procedural detail map keeps the prototype entirely self-contained.
    if (typeof document !== 'undefined') {
      const texture = new DynamicTexture('soil grain', 256, scene, true);
      const ctx = texture.getContext();
      for (let z = 0; z < 256; z++)
        for (let x = 0; x < 256; x++) {
          const v = Math.floor(185 + hash(x, z) * 60);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x, z, 1, 1);
        }
      texture.update();
      texture.wrapU = 1;
      texture.wrapV = 1;
      texture.anisotropicFilteringLevel = 8;
      this.terrainMaterial.diffuseTexture = texture;
    }
    this.grassMaterial = new StandardMaterial('meadow grass', scene);
    this.grassMaterial.diffuseColor = new Color3(0.35, 0.42, 0.19);
    this.grassMaterial.specularColor = Color3.Black();
    this.grassMaterial.backFaceCulling = false;
    this.rockMaterial = new StandardMaterial('granite', scene);
    this.rockMaterial.diffuseColor = new Color3(0.42, 0.43, 0.36);
    this.rockMaterial.specularColor = Color3.Black();
    this.foliage = new StandardMaterial('pine needles', scene);
    this.foliage.diffuseColor = new Color3(0.16, 0.29, 0.19);
    this.foliage.specularColor = Color3.Black();
    this.bark = new StandardMaterial('bark', scene);
    this.bark.diffuseColor = new Color3(0.24, 0.2, 0.14);
    this.bark.specularColor = Color3.Black();
    this.markerMaterial = new StandardMaterial('trail signs', scene);
    this.markerMaterial.diffuseColor = Color3.FromHexString('#e5ee6c');
    this.markerMaterial.emissiveColor = new Color3(0.15, 0.17, 0.03);
    for (const jump of jumps)
      for (const side of [-1, 1]) {
        const x = jump.x + side * (jump.width + 1),
          y = terrainHeight(x, jump.z);
        const post = MeshBuilder.CreateCylinder(
          'jump marker',
          { height: 4, diameter: 0.15 },
          scene,
        );
        post.position.set(x, y + 2, jump.z);
        post.material = this.bark;
        const flag = MeshBuilder.CreateBox(
          'route pennant',
          { width: 0.85, height: 1.3, depth: 0.08 },
          scene,
        );
        flag.position.set(x, y + 3.1, jump.z);
        flag.material = this.markerMaterial;
        this.markers.push(post, flag);
      }
    this.update(new Vector3(0, 0, 12), true);
  }
  get loadedCount(): number {
    return this.sectors.size;
  }
  get collisionCount(): number {
    return [...this.sectors.values()].filter((s) => s.near).length;
  }
  get brokenTreeCount(): number {
    return this.destruction.brokenCount;
  }
  interactVehicle(position: Vector3, velocity: Vector3, kind: VehicleKind, dt: number): number {
    return this.destruction.interact(position, velocity, kind, dt);
  }
  setVegetationDensity(density: number): void {
    if (Math.abs(density - this.vegetationDensity) < 0.01) return;
    this.vegetationDensity = density;
    for (const key of [...this.sectors.keys()]) this.remove(key);
    this.center = '';
  }
  update(position: Vector3, immediate = false): void {
    const center = sectorAt(position.x, position.z),
      key = sectorKey(center);
    if (key !== this.center) {
      this.center = key;
      const wanted = new Set<string>();
      this.queue = [];
      for (let dz = -world.radius; dz <= world.radius; dz++)
        for (let dx = -world.radius; dx <= world.radius; dx++) {
          const x = center.x + dx,
            z = center.z + dz,
            k = sectorKey({ x, z }),
            near = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
          wanted.add(k);
          const previous = this.sectors.get(k);
          if (previous && previous.near !== near) this.remove(k);
          if (!this.sectors.has(k)) this.queue.push({ x, z, near });
        }
      for (const k of this.sectors.keys()) if (!wanted.has(k)) this.remove(k);
      this.queue.sort(
        (a, b) =>
          (a.x - center.x) ** 2 +
          (a.z - center.z) ** 2 -
          ((b.x - center.x) ** 2 + (b.z - center.z) ** 2),
      );
    }
    // Near collision is created synchronously before the rider can enter a missing sector.
    while (this.queue.length && (immediate || this.queue[0].near)) {
      const next = this.queue.shift()!;
      this.create(next.x, next.z, next.near);
    }
    if (this.queue.length) {
      const next = this.queue.shift()!;
      this.create(next.x, next.z, next.near);
    }
  }
  setWireframe(enabled: boolean): void {
    this.terrainMaterial.wireframe = enabled;
    if (this.materials) {
      this.materials.wireframe = enabled;
      this.materials.materials.forEach((m) => (m.wireframe = enabled));
    }
  }
  private remove(key: string): void {
    const s = this.sectors.get(key)!;
    this.destruction.unregister(key);
    s.collision?.dispose();
    for (const p of s.props) {
      const mesh = p.transformNode;
      p.dispose();
      mesh.dispose();
    }
    if (s.mesh.material !== this.terrainMaterial) s.mesh.material?.dispose();
    s.mesh.dispose();
    s.trees.forEach((t) => t.dispose());
    this.sectors.delete(key);
  }
  private create(sx: number, sz: number, near: boolean): void {
    const resolution = near ? world.nearResolution : world.farResolution,
      size = world.sectorSize;
    const positions: number[] = [],
      indices: number[] = [],
      colors: number[] = [],
      normals: number[] = [],
      uvs: number[] = [];
    for (let z = 0; z <= resolution; z++)
      for (let x = 0; x <= resolution; x++) {
        const lx = (x * size) / resolution,
          lz = (z * size) / resolution,
          wx = sx * size + lx,
          wz = sz * size + lz;
        positions.push(lx, terrainHeight(wx, wz), lz);
        uvs.push(lx / size, lz / size);
        const trail = 1 - Math.min(1, Math.max(0, (trailDistance(wx, wz) - 5) / 6));
        const variation = hash(wx, wz) * 0.06;
        if (this.materials) {
          const snow = snowAmount(wx, wz);
          colors.push(0.64 + snow * 0.36, 0.68 + snow * 0.32, 0.59 + snow * 0.41, 1);
        } else
          colors.push(
            0.32 + trail * 0.23 + variation,
            0.39 + trail * 0.06 + variation,
            0.22 + trail * 0.1 + variation,
            1,
          );
      }
    for (let z = 0; z < resolution; z++)
      for (let x = 0; x < resolution; x++) {
        const i = z * (resolution + 1) + x;
        indices.push(i, i + 1, i + resolution + 1, i + 1, i + resolution + 2, i + resolution + 1);
      }
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.colors = colors;
    data.uvs = uvs;
    const mesh = new Mesh(`sector ${sx},${sz}`, this.scene);
    data.applyToMesh(mesh);
    mesh.position.set(sx * size, 0, sz * size);
    mesh.material = this.materials?.create(sx, sz) ?? this.terrainMaterial;
    mesh.useVertexColors = true;
    mesh.receiveShadows = true;
    this.addCaster(mesh);
    mesh.freezeWorldMatrix();
    const collision = near
      ? new PhysicsAggregate(
          mesh,
          PhysicsShapeType.MESH,
          { mass: 0, friction: 0.8, restitution: 0.05 },
          this.scene,
        )
      : undefined;
    const trees: Mesh[] = [],
      props: PhysicsAggregate[] = [];
    const matrices: number[] = [],
      trunks: number[] = [];
    const breakableTrees: BreakableTree[] = [];
    for (let i = 0; i < Math.round((near ? 85 : 45) * this.vegetationDensity); i++) {
      const x = (sx + hash(i + sx * 37, sz * 19)) * size,
        z = (sz + hash(i + 98, sx * 23 + sz)) * size;
      if (
        waterAt(x, z) !== undefined ||
        railwayClearing(x, z) ||
        isTimberFootprint(x, z, 5) ||
        bridgeRoadClearing(x, z, 5) ||
        trailDistance(x, z) < 14 ||
        jumps.some((j) => Math.abs(j.x - x) < j.width + 9 && Math.abs(j.z - z) < j.length + 15)
      )
        continue;
      const growth = hash(i, sx + sz * 7);
      const h = i % 7 === 0 ? 3 + growth * 3 : i % 3 === 0 ? 20 + growth * 14 : 10 + growth * 10,
        y = collisionHeight(x, z) - 0.3,
        scale = h / 10;
      const id = `${sx},${sz}:${i}`;
      let treePhysics: PhysicsAggregate | undefined;
      breakableTrees.push({
        id,
        position: new Vector3(x, y, z),
        height: h,
        diameter: 0.65 * scale,
        removeCollider: () => {
          if (!treePhysics) return;
          const index = props.indexOf(treePhysics);
          if (index >= 0) props.splice(index, 1);
          const colliderMesh = treePhysics.transformNode;
          treePhysics.dispose();
          colliderMesh.dispose();
          treePhysics = undefined;
        },
      });
      Matrix.Compose(
        new Vector3(scale, scale, scale),
        Quaternion.RotationAxis(Vector3.Up(), hash(i, z) * 6),
        new Vector3(x, y, z),
      ).copyToArray(matrices, matrices.length);
      Matrix.Compose(
        new Vector3(scale, scale, scale),
        Quaternion.Identity(),
        new Vector3(x, y, z),
      ).copyToArray(trunks, trunks.length);
      if (near && !this.destruction.isBroken(id)) {
        const trunkCollider = MeshBuilder.CreateCylinder(
          'tree collider',
          { height: h * 0.65, diameter: 0.65 * scale, tessellation: 6 },
          this.scene,
        );
        trunkCollider.position.set(x, y + h * 0.325, z);
        trunkCollider.isVisible = false;
        treePhysics = new PhysicsAggregate(
          trunkCollider,
          PhysicsShapeType.CYLINDER,
          { mass: 0, friction: 0.7 },
          this.scene,
        );
        props.push(treePhysics);
      }
    }
    if (this.assets) {
      const batches = this.assets.trees(matrices, near, `${sx},${sz}`);
      trees.push(...batches);
      if (near) batches.forEach((m) => this.addCaster(m));
    } else {
      const layers: Mesh[] = [];
      for (let layer = 0; layer < 3; layer++) {
        const cone = MeshBuilder.CreateCylinder(
          'pine layer',
          {
            height: 4.8 - layer * 0.6,
            diameterTop: 0,
            diameterBottom: 4.7 - layer,
            tessellation: 7,
          },
          this.scene,
        );
        cone.position.y = 4 + layer * 2;
        layers.push(cone);
      }
      const canopy = Mesh.MergeMeshes(layers, true)!;
      canopy.name = `pine batch ${sx},${sz}`;
      canopy.material = this.foliage;
      const trunk = MeshBuilder.CreateCylinder(
        'trunk batch',
        { height: 6, diameter: 0.45, tessellation: 5 },
        this.scene,
      );
      trunk.bakeTransformIntoVertices(Matrix.Translation(0, 3, 0));
      trunk.material = this.bark;
      if (matrices.length) {
        canopy.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16);
        trunk.thinInstanceSetBuffer('matrix', new Float32Array(trunks), 16);
      } else {
        canopy.setEnabled(false);
        trunk.setEnabled(false);
      }
      trees.push(canopy, trunk);
      if (near) {
        this.addCaster(canopy);
        this.addCaster(trunk);
      }
    }
    this.destruction.register(sectorKey({ x: sx, z: sz }), breakableTrees, trees);
    if (near) {
      const blades = new Mesh(`grass batch ${sx},${sz}`, this.scene),
        gd = new VertexData();
      const bladePositions: number[] = [],
        bladeIndices: number[] = [];
      for (let blade = 0; blade < 13; blade++) {
        const angle = blade * 2.4,
          x = Math.cos(angle) * 0.19,
          z = Math.sin(angle) * 0.19,
          height = 0.22 + hash(blade, 15) * 0.38;
        const width = 0.014 + hash(blade, 44) * 0.014,
          i = bladePositions.length / 3;
        bladePositions.push(
          x - width,
          0,
          z,
          x + width,
          0,
          z,
          x + Math.sin(angle) * 0.06,
          height * 0.65,
          z + 0.03,
          x + Math.sin(angle) * 0.14,
          height,
          z + 0.08,
        );
        bladeIndices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
      }
      gd.positions = bladePositions;
      gd.indices = bladeIndices;
      const gn: number[] = [];
      VertexData.ComputeNormals(gd.positions, gd.indices, gn);
      gd.normals = gn;
      gd.applyToMesh(blades);
      blades.material = this.grassMaterial;
      const grassMatrices: number[] = [];
      for (let i = 0; i < Math.round(2200 * this.vegetationDensity); i++) {
        const x = (sx + hash(i + 500, sz * 37)) * size,
          z = (sz + hash(i + 9500, sx * 29)) * size;
        if (
          trailDistance(x, z) < 9 ||
          waterAt(x, z) !== undefined ||
          snowAmount(x, z) > 0.4 ||
          railwayClearing(x, z) ||
          isTimberFootprint(x, z, 2) ||
          bridgeRoadClearing(x, z, 2)
        )
          continue;
        const scale = 0.6 + hash(i, z) * 0.5;
        Matrix.Compose(
          new Vector3(scale, scale, scale),
          Quaternion.RotationAxis(Vector3.Up(), i),
          new Vector3(x, collisionHeight(x, z) - 0.04, z),
        ).copyToArray(grassMatrices, grassMatrices.length);
      }
      if (grassMatrices.length)
        blades.thinInstanceSetBuffer('matrix', new Float32Array(grassMatrices), 16);
      trees.push(blades);
      for (let i = 0; i < 28; i++) {
        const x = (sx + hash(i + 370, sz)) * size,
          z = (sz + hash(i + 1270, sx)) * size;
        if (
          trailDistance(x, z) < 20 ||
          waterAt(x, z) !== undefined ||
          railwayClearing(x, z) ||
          isTimberFootprint(x, z, 8) ||
          bridgeRoadClearing(x, z, 8)
        )
          continue;
        const large = i % 4 === 0 ? 2 : 1;
        const placement = {
          x,
          z,
          seed: i + sx * 173 + sz * 941,
          yaw: i,
          scale: new Vector3(
            (2 + hash(i, sx) * 3) * large,
            (1.5 + hash(i, sz) * 2) * large,
            (2.5 + hash(i, sx + sz) * 2) * large,
          ),
        };
        const rock = this.rocks?.create(placement) ?? createRockVisual(this.scene, placement);
        props.push(
          new PhysicsAggregate(
            rock,
            PhysicsShapeType.CONVEX_HULL,
            { mass: 0, friction: 0.8 },
            this.scene,
          ),
        );
        this.addCaster(rock);
      }
    }
    this.sectors.set(sectorKey({ x: sx, z: sz }), { mesh, trees, collision, props, near });
  }
}
