import {
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  HavokPlugin,
  PhysicsAggregate,
  PhysicsShapeCapsule,
  PhysicsShapeContainer,
  PhysicsShapeSphere,
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
  position?: Vector3;
  rotation?: Quaternion;
}
interface Tree extends BreakableTree {
  bindings: Binding[];
  fall?: Fall;
  log?: {
    mesh: Mesh;
    aggregate: PhysicsAggregate;
    center: number;
    length: number;
    samples: { point: Vector3; radius: number }[];
  };
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
  private physicsObserverAdded = false;
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
        this.createPhysicalLog(tree, sector, 0);
        if (tree.log) this.updatePhysicalTree(tree);
        else this.animateTree(tree);
      }
  }

  unregister(key: string): void {
    const sector = this.sectors.get(key);
    sector?.trees.forEach((tree) => {
      if (!tree.log) return;
      tree.fall!.position = tree.log.mesh.position.clone();
      tree.fall!.rotation = tree.log.mesh.rotationQuaternion!.clone();
      tree.log.aggregate.dispose();
    });
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
            this.createPhysicalLog(tree, sector, speed);
            broken++;
          }
        }
        if (tree.fall && !tree.log && tree.fall.age < 0.35 + tree.height * 0.021) {
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
      t = Math.min(1, fall.age / (0.28 + tree.height * 0.021));
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
  private createPhysicalLog(tree: Tree, sector: TreeSector, impactSpeed: number): void {
    if (!this.scene.getPhysicsEngine() || tree.log) return;
    if (!this.physicsObserverAdded) {
      this.physicsObserverAdded = true;
      this.scene.onAfterPhysicsObservable.add(() => {
        for (const sector of this.sectors.values())
          for (const tree of sector.trees)
            if (tree.log) {
              if (
                tree.fall?.position?.equalsWithEpsilon(tree.log.mesh.position, 0.00001) &&
                tree.fall.rotation &&
                Math.abs(Quaternion.Dot(tree.fall.rotation, tree.log.mesh.rotationQuaternion!)) >
                  0.99999999
              )
                continue;
              this.keepLogAboveGround(tree);
              this.updatePhysicalTree(tree);
            }
      });
    }
    const cut = this.breakHeight(tree),
      length = Math.max(1, tree.height * 0.84 - cut),
      center = cut + length / 2;
    const radius = Math.max(0.09, tree.diameter * 0.5),
      endpoint = Math.max(0.05, length / 2 - radius);
    const mesh = MeshBuilder.CreateCylinder(
      'fallen tree collision',
      { height: length, diameter: radius * 2, tessellation: 8 },
      this.scene,
    );
    mesh.isVisible = false;
    mesh.isPickable = false;
    mesh.rotationQuaternion =
      tree.fall!.rotation?.clone() ??
      Quaternion.RotationAxis(
        Vector3.Cross(Vector3.Up(), tree.fall!.direction).normalize(),
        impactSpeed > 0 ? 0.08 : tree.fall!.angle,
      );
    const rotatedCenter = Vector3.TransformNormal(
      new Vector3(0, center, 0),
      Matrix.Compose(Vector3.One(), mesh.rotationQuaternion, Vector3.Zero()),
    );
    mesh.position.copyFrom(tree.fall!.position ?? tree.position.add(rotatedCenter));
    const shape = new PhysicsShapeContainer(this.scene);
    shape.addChild(
      new PhysicsShapeCapsule(
        new Vector3(0, -endpoint, 0),
        new Vector3(0, endpoint, 0),
        radius,
        this.scene,
      ),
    );
    const samples: { point: Vector3; radius: number }[] = [];
    for (let i = 0; i <= 12; i++)
      samples.push({ point: new Vector3(0, -endpoint + (endpoint * 2 * i) / 12, 0), radius });
    const snag = tree.bindings.some(
      (binding) => binding.mesh.metadata?.vegetation === 'forest-snag',
    );
    if (!snag)
      for (const [fraction, size] of [
        [0.57, 0.1],
        [0.77, 0.07],
      ]) {
        const point = new Vector3(0, tree.height * fraction - center, 0),
          branchRadius = Math.max(radius, Math.min(1.5, tree.height * size));
        shape.addChild(new PhysicsShapeSphere(point, branchRadius, this.scene));
        samples.push({ point, radius: branchRadius });
      }
    const mass = Math.min(380, 25 + tree.diameter ** 2 * tree.height * 30);
    const aggregate = new PhysicsAggregate(
      mesh,
      shape,
      { mass, friction: 0.65, restitution: 0.04 },
      this.scene,
    );
    aggregate.shape.filterMembershipMask = 1;
    aggregate.body.setLinearDamping(0.12);
    aggregate.body.setAngularDamping(0.35);
    aggregate.body.setMassProperties({
      mass,
      inertia: new Vector3(
        (mass * length * length) / 12,
        (mass * radius * radius) / 2,
        (mass * length * length) / 12,
      ),
    });
    if (impactSpeed > 0) {
      aggregate.body.setLinearVelocity(tree.fall!.direction.scale(Math.min(6, impactSpeed * 0.19)));
      const angularSpeed = Math.min(4, 28 / length);
      aggregate.body.setAngularVelocity(
        Vector3.Cross(Vector3.Up(), tree.fall!.direction).normalize().scale(angularSpeed),
      );
    }
    tree.log = { mesh, aggregate, center, length, samples };
    sector.fragments.push(mesh);
    this.keepLogAboveGround(tree);
    this.updatePhysicalTree(tree);
  }
  private updatePhysicalTree(tree: Tree): void {
    const log = tree.log!,
      rotation = log.mesh.rotationQuaternion!,
      matrix = Matrix.Compose(Vector3.One(), rotation, Vector3.Zero());
    const translation = log.mesh.position.subtract(
      Vector3.TransformNormal(new Vector3(0, log.center, 0), matrix),
    );
    for (const binding of tree.bindings)
      binding.mesh.thinInstanceSetMatrixAt(
        binding.index,
        Matrix.Compose(binding.scale, rotation.multiply(binding.rotation), translation),
        true,
      );
    tree.fall!.position = log.mesh.position.clone();
    tree.fall!.rotation = rotation.clone();
  }
  /** Substep capsule/branch samples correct residual thin-terrain penetration immediately. */
  private keepLogAboveGround(tree: Tree): void {
    const log = tree.log!,
      mesh = log.mesh,
      body = log.aggregate.body;
    const matrix = mesh.computeWorldMatrix(true);
    let correction = 0;
    for (const sample of log.samples) {
      const point = Vector3.TransformCoordinates(sample.point, matrix);
      correction = Math.max(correction, this.heightAt(point.x, point.z) + sample.radius - point.y);
    }
    const angular = body.getAngularVelocity(),
      maxAngular = 32 / log.length;
    if (angular.length() > maxAngular)
      body.setAngularVelocity(angular.normalize().scale(maxAngular));
    if (correction <= 0.012) return;
    mesh.position.y += correction + 0.012;
    const velocity = body.getLinearVelocity();
    if (velocity.y < 0) {
      velocity.y = 0;
      body.setLinearVelocity(velocity);
    }
    mesh.computeWorldMatrix(true);
    (this.scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin).setPhysicsBodyTransformation(
      body,
      mesh,
    );
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
