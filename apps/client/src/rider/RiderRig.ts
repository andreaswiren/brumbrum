import {
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Physics6DoFConstraint,
  PhysicsAggregate,
  PhysicsConstraintAxis,
  PhysicsShapeType,
  Quaternion,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { riderAnatomy as anatomy } from './RiderAnatomy';
import { riderConfig } from '@brumbrum/configuration';
import { collisionHeight } from '@brumbrum/world-format';
import { enforceFloor } from '../physics/FloorGuard';
import { DriverCharacter } from './DriverCharacter';
import {
  RiderMotion,
  bendLimb,
  ridingContacts,
  ridingLeg,
  ridingHipOffset,
  type RidingStance,
} from './RiderMotion';
import { RiderRecovery, type RecoveryState } from './RiderRecovery';
interface Part {
  mesh: Mesh;
  mass: number;
  radius: number;
  height: number;
  home: { position: Vector3; rotation: Quaternion };
  aggregate?: PhysicsAggregate;
}
interface Joint {
  a: string;
  b: string;
  anchor: Vector3;
  swing: number;
}
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
export class RiderRig {
  readonly root: TransformNode;
  readonly parts = new Map<string, Part>();
  readonly meshes: Mesh[] = [];
  readonly constraints: Physics6DoFConstraint[] = [];
  private joints: Joint[] = [];
  private motion = new RiderMotion();
  private character?: DriverCharacter;
  private recovery?: RiderRecovery;
  private recoveryStart = new Map<string, { position: Vector3; rotation: Quaternion }>();
  active = false;
  constructor(
    private scene: Scene,
    private chassis: Mesh,
  ) {
    this.root = new TransformNode('articulated motocross rider', scene);
    this.root.parent = chassis;
    const material = (name: string, color: string, roughness: number) => {
      const m = new PBRMaterial(name, scene);
      m.albedoColor = Color3.FromHexString(color);
      m.roughness = roughness;
      m.metallic = 0;
      return m;
    };
    const suit = material('woven charcoal race suit', '#26333a', 0.92),
      jersey = material('ivory technical jersey', '#cbd1c2', 0.83),
      armour = material('carbon protection', '#121a1e', 0.6),
      yellow = material('lime helmet shell', '#c4d947', 0.25),
      lens = material('smoked goggle lens', '#162c38', 0.1);
    const capsule = (
      name: string,
      radius: number,
      height: number,
      mass: number,
      mat: PBRMaterial,
    ) => {
      const mesh = MeshBuilder.CreateCapsule(
        name,
        { radius, height, tessellation: 20, capSubdivisions: 6, subdivisions: 3 },
        scene,
      );
      mesh.parent = this.root;
      mesh.material = mat;
      mesh.rotationQuaternion = Quaternion.Identity();
      this.parts.set(name, {
        mesh,
        mass,
        radius,
        height,
        home: { position: Vector3.Zero(), rotation: Quaternion.Identity() },
      });
      this.meshes.push(mesh);
      return mesh;
    };
    const pelvis = capsule('pelvis', 0.13, 0.26, 14, suit);
    pelvis.scaling.x = 1.25;
    pelvis.bakeCurrentTransformIntoVertices();
    const torso = capsule('torso', 0.19, anatomy.torso, 25, jersey);
    torso.scaling.set(1.3, 1, 0.78);
    torso.bakeCurrentTransformIntoVertices();
    const head = capsule('head', 0.13, anatomy.head, 6, yellow);
    const detail = (name: string, parent: Mesh, size: Vector3, pos: Vector3, mat: PBRMaterial) => {
      const m = MeshBuilder.CreateBox(
        name,
        { width: size.x, height: size.y, depth: size.z },
        scene,
      );
      m.parent = parent;
      m.position.copyFrom(pos);
      m.material = mat;
      this.meshes.push(m);
      return m;
    };
    detail('chest protector', torso, v(0.28, 0.29, 0.055), v(0, 0.03, 0.18), armour);
    detail('back protector', torso, v(0.27, 0.34, 0.055), v(0, 0, -0.18), armour);
    for (let i = 0; i < 4; i++)
      detail('back armour rib', torso, v(0.23, 0.024, 0.025), v(0, 0.12 - i * 0.07, -0.22), jersey);
    detail('MX helmet peak', head, v(0.4, 0.035, 0.36), v(0, 0.12, 0.18), yellow).rotation.x =
      -0.12;
    detail('goggle frame', head, v(0.35, 0.13, 0.09), v(0, 0.025, 0.17), armour);
    detail('goggle lens', head, v(0.29, 0.085, 0.018), v(0, 0.025, 0.22), lens);
    detail('chin guard', head, v(0.22, 0.1, 0.18), v(0, -0.15, 0.19), yellow);
    const strap = MeshBuilder.CreateTorus(
      'elastic goggle strap',
      { diameter: 0.375, thickness: 0.025, tessellation: 32 },
      scene,
    );
    strap.parent = head;
    strap.position.y = 0.025;
    strap.material = armour;
    this.meshes.push(strap);
    for (let i = 0; i < 5; i++) {
      detail(
        'helmet crown vent',
        head,
        v(0.026, 0.01, 0.09),
        v((i - 2) * 0.045, 0.192, 0.035),
        armour,
      );
      detail('chin grille', head, v(0.016, 0.055, 0.012), v((i - 2) * 0.035, -0.15, 0.286), armour);
    }
    detail('jersey waist band', pelvis, v(0.36, 0.065, 0.22), v(0, 0.07, 0), yellow);
    detail('chest protector spine', torso, v(0.025, 0.24, 0.016), v(0, 0.03, 0.216), jersey);
    for (const side of [-1, 1]) {
      detail('helmet intake', head, v(0.016, 0.045, 0.13), v(side * 0.19, 0.07, -0.02), armour);
      detail(
        'helmet jaw brace',
        head,
        v(0.045, 0.09, 0.22),
        v(side * 0.145, -0.1, 0.12),
        yellow,
      ).rotation.x = 0.28;
      const upperArm = capsule(`upperArm${side}`, 0.07, anatomy.upperArm, 3, jersey);
      detail('shoulder armour', upperArm, v(0.14, 0.1, 0.14), v(side * 0.025, 0.12, 0), armour);
      detail('sleeve stripe', upperArm, v(0.018, 0.21, 0.13), v(side * 0.083, 0.025, 0), yellow);
      const forearm = capsule(`forearm${side}`, 0.06, anatomy.forearm, 2, suit);
      detail('glove', forearm, v(0.14, 0.1, 0.11), v(0, -0.19, 0), armour);
      detail('elbow armour', forearm, v(0.12, 0.13, 0.045), v(0, 0.12, -0.066), armour);
      capsule(`thigh${side}`, 0.09, anatomy.thigh, 8, suit);
      const shin = capsule(`shin${side}`, 0.075, anatomy.shin, 3.5, jersey);
      detail('knee protection', shin, v(0.15, 0.14, 0.045), v(0, 0.14, 0.075), armour);
      detail('boot toe', shin, v(0.16, 0.11, 0.25), v(0, -0.22, 0.075), armour);
      for (let i = 0; i < 3; i++)
        detail('boot buckle', shin, v(0.17, 0.025, 0.025), v(0, 0.1 - i * 0.08, 0.085), armour);
    }
    for (const accessory of head.getChildMeshes()) {
      accessory.position.scaleInPlace(0.78);
      accessory.scaling.scaleInPlace(0.78);
    }
    this.pose(0, 0, 0, 0, 0, 1);
  }
  get position(): Vector3 {
    const pelvis = this.parts.get('pelvis')!.mesh;
    pelvis.computeWorldMatrix(true);
    return pelvis.getAbsolutePosition();
  }
  async loadCharacter(): Promise<void> {
    this.character = await DriverCharacter.load(this.scene, this.root, this.parts);
    if (this.root.isDisposed()) {
      this.character.dispose();
      return;
    }
    for (const part of this.parts.values()) part.mesh.isVisible = false;
    for (const accessory of this.meshes) {
      // The human skin now carries fitted riding clothing, gloves and boots.
      // Keep helmet equipment, replacing the old oversized body accessory boxes.
      if (accessory.parent !== this.parts.get('head')!.mesh) accessory.isVisible = false;
    }
    // Keep the motocross protective equipment attached to its physical proxies.
    const shell = MeshBuilder.CreateSphere(
      'open-face MX helmet shell',
      { diameter: 0.34, slice: 0.61, segments: 24 },
      this.scene,
    );
    shell.parent = this.parts.get('head')!.mesh;
    shell.position.y = 0.025;
    shell.scaling.set(1, 0.94, 1.06);
    shell.material = this.parts.get('head')!.mesh.material;
    this.meshes.push(...this.character.meshes, shell);
  }
  private place(name: string, a: Vector3, b: Vector3): void {
    const part = this.parts.get(name)!;
    part.mesh.position.copyFrom(a.add(b).scale(0.5));
    Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      b.subtract(a).normalize(),
      part.mesh.rotationQuaternion!,
    );
  }
  setVehicle(stance: RidingStance): void {
    this.motion.stance = stance;
    this.motion.reset();
    this.pose(0, 0, 0, 0, 0, 1);
  }
  pose(
    steer: number,
    speed: number,
    throttle: number,
    brake: number,
    compression: number,
    dt: number,
    preload = 0,
    weight = 0,
    grounded = true,
  ): void {
    if (this.active) return;
    const { hip, neck, chest, lean } = this.motion.update(
      steer,
      speed,
      throttle,
      brake,
      compression,
      dt,
      preload,
      weight,
      grounded,
    );
    this.place('pelvis', hip.add(v(0, -0.13, 0)), hip.add(v(0, 0.13, 0)));
    this.place('torso', hip, neck);
    const headBase = neck.add(v(0, 0.1162, 0.0628));
    this.place('head', headBase, headBase.add(v(lean * 0.015, anatomy.head, 0)));
    this.joints = [
      { a: 'pelvis', b: 'torso', anchor: hip.add(v(0, 0.08, 0)), swing: 0.5 },
      { a: 'torso', b: 'head', anchor: neck, swing: 0.65 },
    ];
    for (const side of [-1, 1]) {
      const shoulder = chest.add(v(side * anatomy.shoulderHalfWidth, 0, 0));
      const { hand } = ridingContacts(this.motion.stance, side);
      const elbow = bendLimb(shoulder, hand, anatomy.upperArm, anatomy.forearm, v(side, 0.3, -0.1));
      const { hipJoint, knee, foot } = ridingLeg(this.motion.stance, hip, side);
      this.place(`upperArm${side}`, elbow, shoulder);
      this.place(`forearm${side}`, hand, elbow);
      this.place(`thigh${side}`, knee, hipJoint);
      this.place(`shin${side}`, foot, knee);
      this.joints.push(
        { a: 'torso', b: `upperArm${side}`, anchor: shoulder, swing: 1.3 },
        { a: `upperArm${side}`, b: `forearm${side}`, anchor: elbow, swing: 1.2 },
        { a: 'pelvis', b: `thigh${side}`, anchor: hipJoint, swing: 1.1 },
        { a: `thigh${side}`, b: `shin${side}`, anchor: knee, swing: 1.1 },
      );
    }
    this.character?.update();
  }
  eject(velocity: Vector3, angularVelocity: Vector3): void {
    if (this.active) return;
    this.active = true;
    this.root.computeWorldMatrix(true);
    const rootMatrix = this.root.getWorldMatrix().clone();
    const launch = velocity
      .add(v(0, riderConfig.ejectUpSpeed, 0))
      .add(this.chassis.getDirection(Vector3.Forward()).scale(riderConfig.ejectForwardSpeed));
    for (const part of this.parts.values()) {
      const mesh = part.mesh;
      part.home.position.copyFrom(mesh.position);
      part.home.rotation.copyFrom(mesh.rotationQuaternion!);
      mesh.computeWorldMatrix(true);
      mesh.setParent(null);
      mesh.computeWorldMatrix(true);
      part.aggregate = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.CAPSULE,
        {
          mass: part.mass,
          radius: part.radius,
          pointA: v(0, -Math.max(0.01, part.height / 2 - part.radius), 0),
          pointB: v(0, Math.max(0.01, part.height / 2 - part.radius), 0),
          friction: 0.7,
          restitution: 0.05,
        },
        this.scene,
      );
      // Ragdolls collide with scenery and the bike, but not overlapping limbs.
      part.aggregate.shape.filterMembershipMask = 2;
      part.aggregate.shape.filterCollideMask = 1;
      part.aggregate.body.setLinearVelocity(
        launch.add(Vector3.Cross(angularVelocity, mesh.position.subtract(this.chassis.position))),
      );
      part.aggregate.body.setAngularVelocity(angularVelocity.scale(0.6));
      part.aggregate.body.setLinearDamping(riderConfig.linearDamping);
      part.aggregate.body.setAngularDamping(riderConfig.angularDamping);
    }
    for (const joint of this.joints) {
      const a = this.parts.get(joint.a)!,
        b = this.parts.get(joint.b)!;
      const anchor = Vector3.TransformCoordinates(joint.anchor, rootMatrix);
      const invA = Matrix.Invert(a.mesh.getWorldMatrix()),
        invB = Matrix.Invert(b.mesh.getWorldMatrix());
      const constraint = new Physics6DoFConstraint(
        {
          pivotA: Vector3.TransformCoordinates(anchor, invA),
          pivotB: Vector3.TransformCoordinates(anchor, invB),
          axisA: Vector3.TransformNormal(Vector3.Right(), invA).normalize(),
          axisB: Vector3.TransformNormal(Vector3.Right(), invB).normalize(),
          perpAxisA: Vector3.TransformNormal(Vector3.Up(), invA).normalize(),
          perpAxisB: Vector3.TransformNormal(Vector3.Up(), invB).normalize(),
          collision: false,
        },
        [
          ...[
            PhysicsConstraintAxis.LINEAR_X,
            PhysicsConstraintAxis.LINEAR_Y,
            PhysicsConstraintAxis.LINEAR_Z,
          ].map((axis) => ({ axis, minLimit: 0, maxLimit: 0 })),
          ...[
            PhysicsConstraintAxis.ANGULAR_X,
            PhysicsConstraintAxis.ANGULAR_Y,
            PhysicsConstraintAxis.ANGULAR_Z,
          ].map((axis) => ({ axis, minLimit: -joint.swing, maxLimit: joint.swing })),
        ],
        this.scene,
      );
      a.aggregate!.body.addConstraint(b.aggregate!.body, constraint);
      this.constraints.push(constraint);
    }
  }
  reset(): void {
    this.constraints.forEach((c) => c.dispose());
    this.constraints.length = 0;
    this.recovery = undefined;
    this.recoveryStart.clear();
    this.root.parent = this.chassis;
    this.root.position.setAll(0);
    this.root.rotation.setAll(0);
    this.root.rotationQuaternion = Quaternion.Identity();
    this.root.scaling.setAll(1);
    for (const part of this.parts.values()) {
      part.aggregate?.dispose();
      part.aggregate = undefined;
      part.mesh.parent = this.root;
      part.mesh.position.copyFrom(part.home.position);
      part.mesh.rotationQuaternion!.copyFrom(part.home.rotation);
    }
    this.active = false;
    this.motion.reset();
    this.pose(0, 0, 0, 0, 0, 1);
  }
  get recovering(): boolean {
    return this.recovery !== undefined;
  }
  beginRecovery(): boolean {
    if (!this.active || this.recovery) return false;
    const pelvis = this.parts.get('pelvis')!;
    const position = pelvis.mesh.getAbsolutePosition().clone();
    if (
      (pelvis.aggregate?.body.getLinearVelocity().length() ?? 0) > 4 ||
      position.y - collisionHeight(position.x, position.z) > 2.5
    )
      return false;
    this.constraints.forEach((constraint) => constraint.dispose());
    this.constraints.length = 0;
    const forward = this.chassis.getDirection(Vector3.Forward());
    this.recovery = new RiderRecovery(position, Math.atan2(forward.x, forward.z));
    this.root.parent = null;
    this.root.position.copyFrom(this.recovery.position);
    this.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(this.recovery.yaw, 0, 0);
    this.root.scaling.setAll(1);
    this.root.computeWorldMatrix(true);
    for (const [name, part] of this.parts) {
      part.aggregate?.dispose();
      part.aggregate = undefined;
      part.mesh.setParent(this.root);
      this.recoveryStart.set(name, {
        position: part.mesh.position.clone(),
        rotation: part.mesh.rotationQuaternion!.clone(),
      });
    }
    this.character?.update();
    return true;
  }
  updateRecovery(dt: number, target: Vector3, vehiclePosition?: Vector3): RecoveryState {
    if (!this.recovery) return { phase: 'done', lift: 1 };
    const recovery = this.recovery,
      state = recovery.update(dt, target);
    if (state.phase === 'lifting' && vehiclePosition) {
      const delta = vehiclePosition.subtract(recovery.position),
        desired = Math.atan2(delta.x, delta.z);
      recovery.yaw +=
        Math.atan2(Math.sin(desired - recovery.yaw), Math.cos(desired - recovery.yaw)) *
        (1 - Math.exp(-10 * Math.max(0, dt)));
    }
    this.root.position.copyFrom(recovery.position);
    this.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(recovery.yaw, 0, 0);
    this.root.computeWorldMatrix(true);
    const running = state.phase === 'running';
    const crouch =
      state.phase === 'lifting'
        ? Math.sin(Math.PI * Math.min(1, recovery.elapsed / 1.6)) * 0.27
        : 0;
    const bob = running ? Math.abs(Math.sin(recovery.stride)) * 0.035 : 0;
    const hip = v(0, 0.81 + bob - crouch * 0.55, -crouch * 0.2);
    const neck = hip.add(v(0, anatomy.torso - crouch * 0.4, (running ? 0.13 : 0.04) + crouch));
    this.place('pelvis', hip.add(v(0, -0.13, 0)), hip.add(v(0, 0.13, 0)));
    this.place('torso', hip, neck);
    const headBase = neck.add(v(0, 0.1162, 0.0628));
    this.place('head', headBase, headBase.add(v(0, anatomy.head, 0)));
    for (const side of [-1, 1]) {
      const phase = recovery.stride + (side < 0 ? Math.PI : 0),
        swing = running ? Math.sin(phase) : 0;
      const foot = v(
        side * 0.16,
        anatomy.ankleToSole + (running ? Math.max(0, Math.cos(phase)) * 0.13 : 0),
        swing * 0.32,
      );
      const footWorld = Vector3.TransformCoordinates(foot, this.root.getWorldMatrix());
      foot.y += collisionHeight(footWorld.x, footWorld.z) - recovery.position.y;
      const hipJoint = hip.add(ridingHipOffset(this.motion.stance, side));
      // Keep the reach valid on steep ground while preserving a visible stepping arc.
      const reach = foot.subtract(hipJoint);
      const legReach = anatomy.thigh + anatomy.shin - 0.005;
      if (reach.length() > legReach) foot.copyFrom(hipJoint.add(reach.normalize().scale(legReach)));
      const knee = bendLimb(hipJoint, foot, anatomy.thigh, anatomy.shin, v(side * 0.1, 0, 1));
      this.place(`thigh${side}`, knee, hipJoint);
      this.place(`shin${side}`, foot, knee);
      const shoulder = neck.add(v(side * anatomy.shoulderHalfWidth, -0.0066, -0.0138));
      const hand =
        state.phase === 'lifting'
          ? v(side * 0.25, 0.65 + state.lift * 0.18, 0.48)
          : v(side * 0.25, 0.82 + Math.abs(swing) * 0.08, -swing * 0.28 + 0.06);
      const handReach = hand.subtract(shoulder),
        armLength = anatomy.upperArm + anatomy.forearm - 0.005;
      if (handReach.length() > armLength)
        hand.copyFrom(shoulder.add(handReach.normalize().scale(armLength)));
      const elbow = bendLimb(
        shoulder,
        hand,
        anatomy.upperArm,
        anatomy.forearm,
        v(side * 0.4, -0.2, -1),
      );
      this.place(`upperArm${side}`, elbow, shoulder);
      this.place(`forearm${side}`, hand, elbow);
    }
    if (state.phase === 'standing')
      for (const [name, start] of this.recoveryStart) {
        const mesh = this.parts.get(name)!.mesh;
        Vector3.LerpToRef(start.position, mesh.position, recovery.standBlend, mesh.position);
        Quaternion.SlerpToRef(
          start.rotation,
          mesh.rotationQuaternion!,
          recovery.standBlend,
          mesh.rotationQuaternion!,
        );
      }
    this.character?.update();
    return state;
  }
  enforceFloor(): void {
    for (const part of this.parts.values()) {
      if (!part.aggregate) continue;
      const half = Math.max(0.01, part.height / 2 - part.radius);
      enforceFloor(part.mesh, part.aggregate.body, [
        { point: v(0, -half, 0), radius: part.radius },
        { point: v(0, half, 0), radius: part.radius },
      ]);
    }
  }
  dispose(): void {
    this.character?.dispose();
    this.constraints.forEach((constraint) => constraint.dispose());
    this.constraints.length = 0;
    for (const part of this.parts.values()) {
      part.aggregate?.dispose();
      part.aggregate = undefined;
    }
    const materials = new Set(
      this.meshes.map((mesh) => mesh.material).filter((material) => material !== null),
    );
    this.meshes.forEach((mesh) => mesh.dispose());
    materials.forEach((material) => material.dispose());
    this.root.dispose();
  }
}
