import {
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { collisionHeight } from '@brumbrum/world-format';
import type { VehicleKind } from '../vehicles/VehicleModels';

export interface BreakableTree {
  id: string;
  position: Vector3;
  height: number;
  diameter: number;
  removeCollider: () => void;
}
interface Binding {
  mesh: Mesh;
  index: number;
  scale: Vector3;
  rotation: Quaternion;
}
interface Fall {
  direction: Vector3;
  age: number;
  angle: number;
}
interface Tree extends BreakableTree {
  bindings: Binding[];
  fall?: Fall;
}
interface Chip {
  mesh: Mesh;
  start: Vector3;
  velocity: Vector3;
  age: number;
}
interface TreeSector {
  trees: Tree[];
  fragments: Mesh[];
  chips: Chip[];
}

export function treeBreakSpeed(kind: VehicleKind, diameter: number): number {
  return kind === 'monster'
    ? 4.8 + diameter * 3.5
    : kind === 'atv'
      ? 13 + diameter * 10
      : kind === 'snowmobile'
        ? 15 + diameter * 11
        : 18 + diameter * 17;
}

/** Swept collision anticipation removes a trunk before the physics solver stops the vehicle. */
export class TreeDestruction {
  private sectors = new Map<string, TreeSector>();
  private fallen = new Map<string, Fall>();
  private wood: StandardMaterial;
  constructor(
    private scene: Scene,
    private addCaster: (mesh: Mesh) => void = () => {},
    private heightAt = collisionHeight,
  ) {
    this.wood = new StandardMaterial('freshly fractured timber', scene);
    this.wood.diffuseColor = new Color3(0.46, 0.31, 0.17);
    this.wood.specularColor.setAll(0);
  }
  isBroken(id: string): boolean {
    return this.fallen.has(id);
  }
  get brokenCount(): number {
    return this.fallen.size;
  }

  register(key: string, definitions: BreakableTree[], batches: Mesh[]): void {
    const trees: Tree[] = definitions.map((tree) => ({
      ...tree,
      bindings: [],
      fall: this.fallen.get(tree.id),
    }));
    const byPosition = new Map(
      trees.map((tree) => [`${tree.position.x.toFixed(2)},${tree.position.z.toFixed(2)}`, tree]),
    );
    for (const mesh of batches) {
      const matrices = mesh.thinInstanceGetWorldMatrices();
      if (matrices.length) {
        const buffer = new Float32Array(matrices.length * 16);
        matrices.forEach((matrix, i) => matrix.copyToArray(buffer, i * 16));
        mesh.thinInstanceSetBuffer('matrix', buffer, 16, false);
      }
      for (const [index, matrix] of matrices.entries()) {
        const scale = new Vector3(),
          rotation = new Quaternion(),
          translation = new Vector3();
        matrix.decompose(scale, rotation, translation);
        const tree = byPosition.get(`${translation.x.toFixed(2)},${translation.z.toFixed(2)}`);
        tree?.bindings.push({ mesh, index, scale, rotation });
      }
    }
    const sector = { trees, fragments: [], chips: [] } as TreeSector;
    this.sectors.set(key, sector);
    for (const tree of trees)
      if (tree.fall) {
        tree.fall.age = Math.max(tree.fall.age, 10);
        this.stump(tree, sector, false);
        this.animateTree(tree);
      }
  }

  unregister(key: string): void {
    const sector = this.sectors.get(key);
    sector?.fragments.forEach((mesh) => mesh.dispose());
    this.sectors.delete(key);
  }

  interact(position: Vector3, velocity: Vector3, kind: VehicleKind, dt: number): number {
    const step = Math.max(0, Math.min(dt, 0.05)),
      speed = Math.hypot(velocity.x, velocity.z);
    const direction =
      speed > 0.01 ? new Vector3(velocity.x / speed, 0, velocity.z / speed) : Vector3.Forward();
    const reach = kind === 'monster' ? 2.6 : kind === 'atv' ? 1.3 : 1.02;
    const width =
      kind === 'monster' ? 2.35 : kind === 'atv' ? 1.04 : kind === 'snowmobile' ? 0.7 : 0.38;
    const end = position.add(direction.scale(speed * step + reach));
    const start = position.subtract(direction.scale(0.25));
    const dx = end.x - start.x,
      dz = end.z - start.z,
      length2 = dx * dx + dz * dz;
    let broken = 0;
    for (const sector of this.sectors.values()) {
      for (const tree of sector.trees) {
        if (
          !tree.fall &&
          speed >= treeBreakSpeed(kind, tree.diameter) &&
          position.y >= tree.position.y - 0.7 &&
          position.y <= tree.position.y + tree.height * 0.66 + 0.6
        ) {
          const t = Math.max(
            0,
            Math.min(
              1,
              ((tree.position.x - start.x) * dx + (tree.position.z - start.z) * dz) /
                Math.max(0.001, length2),
            ),
          );
          const distance = Math.hypot(
            tree.position.x - start.x - dx * t,
            tree.position.z - start.z - dz * t,
          );
          if (distance < width + tree.diameter * 0.5) {
            const pivot = tree.position.y + this.breakHeight(tree),
              length = tree.height * 0.75;
            let slope = -0.45;
            for (const part of [0.3, 0.5, 0.75, 1]) {
              const ground = this.heightAt(
                tree.position.x + direction.x * length * part,
                tree.position.z + direction.z * length * part,
              );
              slope = Math.max(slope, (ground + tree.diameter * 0.2 - pivot) / (length * part));
            }
            tree.fall = {
              direction: direction.clone(),
              age: 0,
              angle: Math.acos(Math.max(-0.45, Math.min(0.72, slope))),
            };
            this.fallen.set(tree.id, tree.fall);
            tree.removeCollider();
            this.stump(tree, sector, true);
            broken++;
          }
        }
        if (tree.fall && tree.fall.age < 1.16 + tree.height * 0.085) {
          tree.fall.age += step;
          this.animateTree(tree);
        }
      }
      for (const chip of sector.chips) {
        chip.age += step;
        if (chip.age > 1.3) {
          chip.mesh.setEnabled(false);
          continue;
        }
        chip.mesh.position.copyFrom(
          chip.start
            .add(chip.velocity.scale(chip.age))
            .add(new Vector3(0, -4.9 * chip.age * chip.age, 0)),
        );
        chip.mesh.rotation.x += step * 7;
        chip.mesh.rotation.z += step * 4;
      }
    }
    return broken;
  }

  private breakHeight(tree: BreakableTree): number {
    return Math.min(0.75, 0.25 + tree.height * 0.025);
  }
  private animateTree(tree: Tree): void {
    const fall = tree.fall!,
      t = Math.min(1, fall.age / (1.1 + tree.height * 0.085));
    const angle =
      fall.angle * t * t * (2 - t) +
      (t < 1 ? Math.sin(fall.age * 22) * Math.exp(-fall.age * 4) * 0.025 : 0);
    const axis = Vector3.Cross(Vector3.Up(), fall.direction).normalize(),
      tilt = Quaternion.RotationAxis(axis, angle);
    const pivot = this.breakHeight(tree),
      rotationMatrix = Matrix.Compose(Vector3.One(), tilt, Vector3.Zero());
    const offset = new Vector3(0, pivot, 0).subtract(
      Vector3.TransformNormal(new Vector3(0, pivot, 0), rotationMatrix),
    );
    const translation = tree.position.add(offset);
    for (const binding of tree.bindings) {
      const matrix = Matrix.Compose(binding.scale, tilt.multiply(binding.rotation), translation);
      binding.mesh.thinInstanceSetMatrixAt(binding.index, matrix, true);
    }
  }
  private stump(tree: Tree, sector: TreeSector, chips: boolean): void {
    const height = this.breakHeight(tree),
      ground = this.heightAt(tree.position.x, tree.position.z);
    const stump = MeshBuilder.CreateCylinder(
      'splintered standing tree stump',
      { height, diameterBottom: tree.diameter, diameterTop: tree.diameter * 0.78, tessellation: 9 },
      this.scene,
    );
    stump.position.set(tree.position.x, ground + height / 2 - 0.08, tree.position.z);
    stump.material = this.wood;
    stump.receiveShadows = true;
    sector.fragments.push(stump);
    this.addCaster(stump);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + tree.position.x;
      const splinter = MeshBuilder.CreateCylinder(
        'sharp fractured stump fibre',
        {
          height: 0.12 + i * 0.035,
          diameterBottom: tree.diameter * 0.12,
          diameterTop: 0.005,
          tessellation: 3,
        },
        this.scene,
      );
      splinter.position.set(
        tree.position.x + Math.cos(a) * tree.diameter * 0.27,
        ground + height - 0.03,
        tree.position.z + Math.sin(a) * tree.diameter * 0.27,
      );
      splinter.material = this.wood;
      sector.fragments.push(splinter);
    }
    if (chips)
      for (let i = 0; i < 8; i++) {
        const chip = MeshBuilder.CreateCylinder(
          'flying bark chip',
          {
            height: 0.13 + (i % 3) * 0.06,
            diameterBottom: 0.04 + (i % 2) * 0.025,
            diameterTop: 0.012,
            tessellation: 3,
          },
          this.scene,
        );
        chip.material = this.wood;
        const start = new Vector3(tree.position.x, ground + height, tree.position.z);
        chip.position.copyFrom(start);
        sector.fragments.push(chip);
        const a = i * 2.4;
        sector.chips.push({
          mesh: chip,
          start,
          velocity: tree
            .fall!.direction.scale(2)
            .add(new Vector3(Math.cos(a) * 2.2, 1.7 + i * 0.17, Math.sin(a) * 2.2)),
          age: 0,
        });
      }
  }
}
