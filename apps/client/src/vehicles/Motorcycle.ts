import {
  MeshBuilder,
  PhysicsAggregate,
  PhysicsRaycastResult,
  PhysicsShapeType,
  Quaternion,
  Scene,
  Vector3,
  Color3,
  LinesMesh,
  PhysicsShapeContainer,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  HavokPlugin,
  type Observer,
} from '@babylonjs/core';
import { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import { bike, physics, surfaces, type Surface } from '@brumbrum/configuration';
import {
  boundary,
  collisionHeight,
  surfaceAt,
  terrainHeight,
  waterAt,
  lakes,
} from '@brumbrum/world-format';
import { enforceFloor } from '../physics/FloorGuard';
import type { InputActions } from '../input/InputManager';
import { type BikeVisual } from './BikeVisual';
import { vehicleSetup, type VehicleTuning } from './VehicleSetup';
import type { VehicleKind } from './VehicleModels';
import { animateSnowmobile } from './SnowmobileVisual';
import type { RideImpact } from '../audio/EngineAudio';
export class Motorcycle {
  readonly visual: BikeVisual;
  readonly aggregate: PhysicsAggregate;
  readonly tune: VehicleTuning;
  private mounts: Vector3[] = [];
  private floorObserver: Observer<Scene>;
  readonly velocity = Vector3.Zero();
  readonly angularVelocity = Vector3.Zero();
  readonly contacts: boolean[] = [];
  readonly compression: number[] = [];
  grounded = false;
  crashed = false;
  surface: Surface = 'dirt';
  airtime = 0;
  lastAir = 0;
  bestAir = 0;
  distance = 0;
  private safe = new Vector3(0, 0, 12);
  private safeYaw = 0;
  private stepCount = 0;
  private jumpHeld = false;
  private jumpCooldown = 0;
  private impactVelocity = 0;
  private results: PhysicsRaycastResult[] = [];
  private debugLines: LinesMesh[] = [];
  private debug = false;
  private crashGrace = 1.5;
  private tiltedTime = 0;
  private overleanTime = 0;
  private submergedTime = 0;
  private waterContact = false;
  private crashElapsed = 0;
  recoveryPhase = '';
  private pickupRotation = Quaternion.Identity();
  private pickupPosition = Vector3.Zero();
  private pickupYaw = 0;
  private lastContactNormal = Vector3.Up();
  private previousPosition = Vector3.Zero();
  private airborneVelocity = Vector3.Zero();
  private boundaryCooldown = 0;
  boundaryLaunches = 0;
  resetId = 0;
  skimming = false;
  submerged = false;
  floorRecoveries = 0;
  preloadCharge = 0;
  readonly audioImpacts: RideImpact[] = [];
  private floorSamples: { point: Vector3; radius: number }[] = [];
  constructor(
    private scene: Scene,
    readonly kind: VehicleKind = 'bike',
  ) {
    const { visual, dimensions, tuning } = vehicleSetup(scene, kind);
    this.visual = visual;
    this.tune = tuning;
    this.visual.riderRig.setVehicle(kind);
    this.mounts = visual.wheels.map((w) => new Vector3(w.position.x, 0, w.position.z));
    this.contacts.push(...this.mounts.map(() => false));
    this.compression.push(...this.mounts.map(() => 0));
    this.results = this.mounts.map(() => new PhysicsRaycastResult());
    this.visual.chassis.position.set(0, terrainHeight(0, 12) + this.tune.resetClearance, 12);
    this.visual.chassis.computeWorldMatrix(true);
    const hull = new PhysicsShapeContainer(scene);
    hull.addChild(
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(dimensions.chassisWidth, dimensions.chassisHeight, dimensions.chassisLength),
        scene,
      ),
    );
    this.floorSamples.push({ point: Vector3.Zero(), radius: dimensions.chassisHeight / 2 + 0.03 });
    for (const mount of this.mounts) {
      const point = mount.add(new Vector3(0, -this.tune.suspensionLength * 0.59, 0)),
        radius = this.tune.wheelRadius * 0.94;
      hull.addChild(
        new PhysicsShapeSphere(point, this.kind === 'bike' ? radius * 0.5 : radius, scene),
      );
      this.floorSamples.push({ point, radius });
    }
    this.aggregate = new PhysicsAggregate(
      this.visual.chassis,
      hull,
      { mass: this.tune.mass, friction: 0.08, restitution: 0 },
      scene,
    );
    this.aggregate.body.setMassProperties({
      mass: this.tune.mass,
      inertia: Vector3.FromArray(dimensions.inertia),
    });
    this.aggregate.body.setAngularDamping(0.6);
    this.aggregate.body.setLinearDamping(0.025);
    this.previousPosition.copyFrom(this.position);
    this.aggregate.shape.filterMembershipMask = 1;
    this.aggregate.body.setCollisionCallbackEnabled(true);
    this.aggregate.body.getCollisionObservable().add((event) => {
      const strength = Math.abs(event.impulse ?? 0) / this.tune.mass;
      if (this.crashGrace <= 0 && strength > 2.5 && this.audioImpacts.length < 8)
        this.audioImpacts.push({ kind: 'obstacle', strength, surface: this.surface });
      if (
        this.crashGrace <= 0 &&
        Math.abs(event.impulse ?? 0) > this.tune.mass * this.tune.crashImpulseSpeed
      )
        this.crashed = true;
    });
    this.floorObserver = scene.onAfterPhysicsObservable.add(() => {
      this.syncWheelFloor();
      if (
        enforceFloor(
          this.visual.chassis,
          this.aggregate.body,
          this.floorSamples,
          undefined,
          !this.crashed,
        )
      )
        this.floorRecoveries++;
      if (this.visual.riderRig.active) this.visual.riderRig.enforceFloor();
    });
  }
  get position(): Vector3 {
    return this.visual.chassis.position;
  }
  private syncWheelFloor(): void {
    if (this.kind !== 'bike') return;
    this.visual.chassis.computeWorldMatrix(true);
    const tilt = Math.abs(this.visual.chassis.getDirection(Vector3.Right()).y);
    const radius = this.tune.wheelRadius * Math.sqrt(Math.max(0, 1 - tilt * tilt)) + 0.065 * tilt;
    for (let i = 0; i < this.mounts.length; i++) {
      this.floorSamples[i + 1].radius = radius;
      this.floorSamples[i + 1].point.y = this.visual.wheels[i].position.y;
    }
  }
  dispose(): void {
    this.scene.onAfterPhysicsObservable.remove(this.floorObserver);
    this.visual.riderRig.dispose();
    this.aggregate.dispose();
    this.debugLines.forEach((line) => line.dispose());
    this.visual.chassis.dispose(false, true);
  }
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
  get yaw(): number {
    const f = this.visual.chassis.getDirection(Vector3.Forward());
    return Math.atan2(f.x, f.z);
  }
  travelTo(x: number, z: number, yaw = 0): void {
    this.safe.set(x, 0, z);
    this.safeYaw = yaw;
    this.reset();
    this.boundaryCooldown = 0;
  }
  setDebug(enabled: boolean): void {
    this.debug = enabled;
    if (!enabled) {
      this.debugLines.forEach((l) => l.dispose());
      this.debugLines = [];
    }
  }
  reset(atSpawn = false): void {
    this.resetId++;
    if (atSpawn) {
      this.safe.set(0, 0, 12);
      this.safeYaw = 0;
    }
    const mesh = this.visual.chassis;
    mesh.position.set(
      this.safe.x,
      collisionHeight(this.safe.x, this.safe.z) + this.tune.resetClearance,
      this.safe.z,
    );
    mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(this.safeYaw, 0, 0);
    // Teleport once via Havok's prestep, then return transform ownership to physics.
    this.aggregate.body.disablePreStep = false;
    this.aggregate.body.setLinearVelocity(Vector3.Zero());
    this.aggregate.body.setAngularVelocity(Vector3.Zero());
    this.velocity.setAll(0);
    this.visual.riderRig.reset();
    this.crashGrace = this.tune.resetGrace;
    this.tiltedTime = 0;
    this.overleanTime = 0;
    this.crashElapsed = 0;
    this.recoveryPhase = '';
    this.crashed = false;
    this.airtime = 0;
    this.impactVelocity = 0;
    this.audioImpacts.length = 0;
    this.submergedTime = 0;
    this.submerged = false;
    this.skimming = false;
    this.waterContact = false;
    this.jumpHeld = false;
    this.jumpCooldown = 0;
    this.preloadCharge = 0;
    this.airborneVelocity.setAll(0);
    this.lastContactNormal.copyFrom(Vector3.Up());
    this.grounded = false;
    this.previousPosition.copyFrom(this.position);
    this.scene.onAfterPhysicsObservable.addOnce(() => {
      this.aggregate.body.disablePreStep = true;
    });
  }
  step(input: InputActions): void {
    const preload = input.preload && this.kind !== 'monster';
    const dt = physics.step,
      body = this.aggregate.body,
      mesh = this.visual.chassis;
    // Teleports must reach Havok before forces are applied at suspension mounts.
    // Waiting until the engine step turns the old-to-new displacement into torque.
    if (!body.disablePreStep) {
      mesh.computeWorldMatrix(true);
      (
        this.scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin
      ).setPhysicsBodyTransformation(body, mesh);
      body.disablePreStep = true;
    }
    this.crashGrace = Math.max(0, this.crashGrace - dt);
    this.boundaryCooldown = Math.max(0, this.boundaryCooldown - dt);
    if (
      this.boundaryCooldown === 0 &&
      Math.max(Math.abs(this.position.x), Math.abs(this.position.z)) >
        boundary.extent + boundary.triggerMargin
    ) {
      const towardCenter = new Vector3(-this.position.x, 0, -this.position.z)
        .normalize()
        .scale(boundary.launchInward);
      towardCenter.y = boundary.launchUp;
      body.setLinearVelocity(towardCenter);
      body.setAngularVelocity(Vector3.Zero());
      for (const part of this.visual.riderRig.parts.values())
        part.aggregate?.body.setLinearVelocity(towardCenter);
      this.boundaryCooldown = boundary.cooldown;
      this.boundaryLaunches++;
      this.crashGrace = 3;
    }
    this.syncWheelFloor();
    if (enforceFloor(mesh, body, this.floorSamples, this.previousPosition, !this.crashed))
      this.floorRecoveries++;
    this.previousPosition.copyFrom(this.position);
    body.getLinearVelocityToRef(this.velocity);
    body.getAngularVelocityToRef(this.angularVelocity);
    mesh.computeWorldMatrix(true);
    const up = mesh.getDirection(Vector3.Up()),
      forward = mesh.getDirection(Vector3.Forward()),
      right = mesh.getDirection(Vector3.Right());
    const wasGrounded = this.grounded;
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine;
    this.surface = surfaceAt(this.position.x, this.position.z);
    const water = waterAt(this.position.x, this.position.z);
    const touchesWater =
      water !== undefined &&
      this.position.y - this.tune.suspensionLength - this.tune.wheelRadius < water;
    if (
      touchesWater &&
      !this.waterContact &&
      this.velocity.y < -1.5 &&
      this.audioImpacts.length < 8
    )
      this.audioImpacts.push({
        kind: 'landing',
        strength: Math.max(4, -this.velocity.y),
        surface: 'water',
      });
    this.waterContact = touchesWater;
    this.skimming = false;
    this.submerged = water !== undefined && this.position.y < water - 0.3;
    this.submergedTime = this.submerged ? this.submergedTime + dt : 0;
    if (this.submerged) {
      // A flooded engine cannot propel along the lake bed. Recover to the nearest bank.
      body.setLinearVelocity(this.velocity.scale(Math.exp(-5 * dt)));
      body.setAngularVelocity(this.angularVelocity.scale(Math.exp(-5 * dt)));
      this.grounded = false;
      this.contacts.fill(false);
      this.preloadCharge = 0;
      if (this.submergedTime > 1) {
        const lake = lakes.find(
          (l) => ((this.position.x - l.x) / l.rx) ** 2 + ((this.position.z - l.z) / l.rz) ** 2 < 1,
        );
        if (lake) {
          const angle = Math.atan2(
            (this.position.z - lake.z) / lake.rz,
            (this.position.x - lake.x) / lake.rx,
          );
          this.travelTo(
            lake.x + Math.cos(angle) * (lake.rx + 24),
            lake.z + Math.sin(angle) * (lake.rz + 24),
            this.yaw,
          );
        } else this.reset();
      }
      return;
    }
    const rayUp =
      this.kind === 'bike' && up.y > 0.2
        ? Vector3.Cross(
            forward,
            new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)),
          ).normalize()
        : up;
    const rollFactor = Math.max(0.25, Vector3.Dot(up, rayUp));
    const tireSupport =
      this.kind === 'bike'
        ? this.floorSamples[1].radius / Math.max(0.25, rayUp.y)
        : this.tune.wheelRadius;
    let contactCount = 0;
    const wheelieLoading =
      this.kind !== 'monster' && input.pitch > 0.1 && input.throttle > 0.1 && this.speed > 2;
    for (let i = 0; i < this.mounts.length; i++) {
      const origin = Vector3.TransformCoordinates(this.mounts[i], mesh.getWorldMatrix());
      const rayLength = this.tune.suspensionLength * rollFactor + tireSupport;
      const end = origin.subtract(rayUp.scale(rayLength + 0.025));
      const hit = this.results[i];
      engine.raycastToRef(origin, end, hit, { ignoreBody: body });
      if (
        water !== undefined &&
        this.speed > 14 &&
        up.y > 0.5 &&
        origin.y > water - 0.25 &&
        end.y < water
      ) {
        const distance = Math.max(0, (origin.y - water) / rayUp.y);
        if (!hit.hasHit || distance < hit.hitDistance) {
          hit.setHitData(Vector3.Up(), origin.subtract(rayUp.scale(distance)));
          hit.setHitDistance(distance);
          this.skimming = true;
        }
      }
      this.contacts[i] = hit.hasHit && Vector3.Dot(hit.hitNormalWorld, up) > 0.25;
      this.compression[i] = this.contacts[i]
        ? Math.max(
            0,
            Math.min(this.tune.suspensionLength, (rayLength - hit.hitDistance) / rollFactor),
          )
        : 0;
      if (this.contacts[i] && !this.crashed) {
        this.lastContactNormal.copyFrom(hit.hitNormalWorld);
        contactCount++;
        const pointVelocity = this.velocity.add(
          Vector3.Cross(this.angularVelocity, origin.subtract(this.position)),
        );
        const wheelieLimit = wheelieLoading
          ? (this.tune.mass * -physics.gravity * (this.mounts[i].z < 0 ? 1.35 : 0.15) * 2) /
            this.mounts.length
          : this.tune.maxSuspensionForce;
        const springForce = Math.min(
          wheelieLimit,
          Math.max(
            0,
            this.compression[i] * this.tune.spring -
              Vector3.Dot(pointVelocity, hit.hitNormalWorld) * this.tune.damper,
          ),
        );
        body.applyForce(hit.hitNormalWorld.scale(springForce), origin);
      }
      this.visual.wheels[i].position.y = this.crashed
        ? -this.tune.suspensionLength * 0.85
        : -this.tune.suspensionLength + this.compression[i];
      this.visual.wheels[i].rotation.x += (this.speed * dt) / this.tune.wheelRadius;
      if (this.debug) {
        const points = [origin, end];
        this.debugLines[i] = MeshBuilder.CreateLines(
          'suspension ray',
          { points, instance: this.debugLines[i], updatable: true },
          this.scene,
        );
        (this.debugLines[i] as import('@babylonjs/core').LinesMesh).color = this.contacts[i]
          ? Color3.Green()
          : Color3.Red();
      }
    }
    this.grounded = contactCount > 0;
    // An inverted bike's suspension rays point away from the ground. Detect
    // that landing independently of wheel contacts so it cannot stay assisted.
    const groundClearance = this.position.y - collisionHeight(this.position.x, this.position.z);
    this.tiltedTime =
      up.y < this.tune.crashTilt && groundClearance < 1.15 ? this.tiltedTime + dt : 0;
    if (this.crashGrace <= 0 && this.tiltedTime > this.tune.crashTiltGrace) this.crashed = true;
    if (this.crashGrace <= 0 && up.y < -0.3 && groundClearance < 0.5) this.crashed = true;
    const lateralUp = Math.abs(
      Vector3.Dot(up, new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))),
    );
    this.overleanTime =
      lateralUp > 0.88 && groundClearance < this.tune.resetClearance + 0.6
        ? this.overleanTime + dt
        : 0;
    if (this.crashGrace <= 0 && this.overleanTime > 0.35) this.crashed = true;
    // Havok applies forces as impulses immediately. Preserve the spring torque
    // before applying assists, otherwise balance control erases suspension pitch.
    body.getAngularVelocityToRef(this.angularVelocity);
    if (this.grounded && !wasGrounded) {
      this.lastAir = this.airtime;
      this.bestAir = Math.max(this.bestAir, this.airtime);
      const normalImpact = Vector3.Dot(this.velocity, this.lastContactNormal);
      if (
        this.airtime > 0.15 &&
        normalImpact < -2 &&
        this.crashGrace <= 0 &&
        this.audioImpacts.length < 8
      )
        this.audioImpacts.push({
          kind: 'landing',
          strength: -normalImpact,
          surface: this.skimming ? 'water' : this.surface,
        });
      if (this.crashGrace <= 0 && normalImpact < -this.tune.crashImpactSpeed && up.y < 0.55)
        this.crashed = true;
      // Landing assistance redirects travel along the ground. Restore modestly
      // reduced horizontal momentum once per real jump, before traction acts.
      if (!this.crashed && this.airtime > 0.25 && up.y > 0.35 && input.brake < 0.1) {
        const entrySpeed = Math.hypot(this.airborneVelocity.x, this.airborneVelocity.z);
        const retained = Math.min(this.tune.maxSpeed, entrySpeed * 0.94);
        if (retained > this.speed && entrySpeed > 2) {
          const travel = new Vector3(
            this.airborneVelocity.x,
            0,
            this.airborneVelocity.z,
          ).normalize();
          const n = this.lastContactNormal;
          travel.y = -(travel.x * n.x + travel.z * n.z) / Math.max(0.3, n.y);
          travel.scaleInPlace(retained / Math.hypot(travel.x, travel.z));
          body.setLinearVelocity(travel);
          this.velocity.copyFrom(travel);
        }
      }
      this.airtime = 0;
    }
    if (!this.grounded && !this.crashed) {
      this.airtime += dt;
      this.airborneVelocity.copyFrom(this.velocity);
    }
    this.impactVelocity = this.velocity.y;
    if (this.position.y < terrainHeight(this.position.x, this.position.z) - 20) this.reset();
    if (this.crashed) {
      const rider = this.visual.riderRig;
      this.crashElapsed += dt;
      if (!rider.recovering) {
        rider.eject(this.velocity, this.angularVelocity);
        rider.enforceFloor();
        this.recoveryPhase = 'ragdoll';
        if (this.crashElapsed > 2) {
          body.setLinearVelocity(this.velocity.scale(Math.exp(-2 * dt)));
          body.setAngularVelocity(this.angularVelocity.scale(Math.exp(-2 * dt)));
        }
        if (this.crashElapsed > 4 && rider.beginRecovery()) {
          this.pickupPosition.copyFrom(this.position);
          this.pickupRotation.copyFrom(mesh.rotationQuaternion!);
          this.pickupYaw = this.yaw;
          this.recoveryPhase = 'standing';
        }
      }
      if (rider.recovering) {
        body.setLinearVelocity(Vector3.Zero());
        body.setAngularVelocity(Vector3.Zero());
        const approach = this.pickupPosition.add(
          new Vector3(
            Math.cos(this.pickupYaw) * (this.kind === 'monster' ? 2.3 : 1.25),
            0,
            -Math.sin(this.pickupYaw) * (this.kind === 'monster' ? 2.3 : 1.25),
          ),
        );
        approach.y = collisionHeight(approach.x, approach.z);
        const recovery = rider.updateRecovery(dt, approach, this.pickupPosition);
        this.recoveryPhase = recovery.phase;
        if (recovery.phase === 'lifting') {
          Quaternion.SlerpToRef(
            this.pickupRotation,
            Quaternion.RotationYawPitchRoll(this.pickupYaw, 0, 0),
            recovery.lift,
            mesh.rotationQuaternion!,
          );
          mesh.position.copyFrom(this.pickupPosition);
          const targetHeight =
            collisionHeight(this.position.x, this.position.z) + this.tune.resetClearance;
          mesh.position.y += (targetHeight - this.pickupPosition.y) * recovery.lift;
          body.disablePreStep = false;
        }
        if (recovery.phase === 'done') {
          this.safe.copyFrom(this.pickupPosition);
          this.safeYaw = this.pickupYaw;
          this.reset();
        }
      }
      return;
    }
    const speedForward = Vector3.Dot(this.velocity, forward),
      surface =
        this.kind === 'snowmobile' && this.surface === 'snow'
          ? { ...surfaces.snow, grip: 0.95, resistance: 0.18 }
          : surfaces[this.surface];
    this.distance += this.speed * dt;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (this.grounded) {
      const groundForward = forward
        .subtract(this.lastContactNormal.scale(Vector3.Dot(forward, this.lastContactNormal)))
        .normalize();
      const groundRight = Vector3.Cross(this.lastContactNormal, groundForward).normalize();
      const groundSpeed = Vector3.Dot(this.velocity, groundForward);
      const throttleForce =
        input.throttle *
        this.tune.driveForce *
        Math.max(0, 1 - Math.max(0, groundSpeed) / this.tune.maxSpeed);
      const hillHold = input.throttle === 0 && this.speed < 1.5 ? 0.16 : 0;
      const brake =
        (Math.max(input.brake, hillHold) + (input.rearBrake ? 0.65 : 0)) * this.tune.brakeForce;
      const resistance = surface.resistance * this.tune.mass * groundSpeed;
      const netDrive = throttleForce * surface.grip - resistance;
      const braking =
        Math.sign(speedForward) *
        Math.min(brake, ((Math.abs(speedForward) * this.tune.mass) / dt) * 0.4);
      body.applyForce(
        groundForward.scale(
          (wheelieLoading && netDrive > 0 ? netDrive * 0.75 : netDrive) -
            braking +
            Math.max(0, groundForward.y) *
              this.tune.mass *
              -physics.gravity *
              input.throttle *
              0.95,
        ),
        this.position,
      );
      const lateral = Vector3.Dot(this.velocity, groundRight);
      // Progressively let the rear step out during a committed dirt corner.
      const cornerSlide =
        this.kind === 'bike'
          ? Math.max(0, (Math.abs(input.steer) - 0.45) / 0.55) * Math.min(1, this.speed / 16)
          : 0;
      body.applyForce(
        groundRight.scale(
          -lateral *
            this.tune.mass *
            this.tune.lateralGrip *
            surface.grip *
            (1 - cornerSlide * (this.surface === 'asphalt' ? 0.28 : 0.56)) *
            (input.rearBrake ? 0.35 : 1),
        ),
        this.position,
      );
      const targetYaw =
        input.steer *
        this.tune.steerRate *
        Math.min(1, this.speed / 4) *
        (0.55 + 0.45 / (1 + this.speed / 15));
      const maxLean =
        this.kind === 'monster'
          ? 0.06
          : this.kind === 'atv'
            ? 0.14
            : this.kind === 'snowmobile'
              ? 0.23
              : 0.95;
      const lean =
        -input.steer * Math.min(maxLean, this.speed * (this.kind === 'bike' ? 0.055 : 0.025)) -
        (this.kind === 'monster' ? 0 : input.roll * 1.2);
      const targetUp = new Vector3(
        -Math.cos(this.yaw) * Math.sin(lean),
        Math.cos(lean),
        Math.sin(this.yaw) * Math.sin(lean),
      );
      // Roll balance is assisted; suspension torques remain responsible for terrain pitch.
      const rollError = Vector3.Dot(Vector3.Cross(up, targetUp), forward);
      const rollRate = Vector3.Dot(this.angularVelocity, forward);
      let pitchRate = Vector3.Dot(this.angularVelocity, right);
      const heading = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const normal = this.lastContactNormal;
      const slope = Math.atan2(-Vector3.Dot(heading, normal), Math.max(0.15, normal.y));
      const noseUp = Math.asin(Math.max(-1, Math.min(1, forward.y)));
      const wheelie = wheelieLoading ? input.pitch * 0.65 : 0;
      const targetPitch = Math.max(
        -1.2,
        Math.min(
          1.25,
          slope + wheelie + (this.kind === 'monster' ? 0 : Math.min(0, input.pitch) * 0.15),
        ),
      );
      // Direct, bounded pitch guidance avoids a spring/controller tug-of-war as
      // the front contact lifts and returns during a wheelie.
      pitchRate = Math.max(-2.5, Math.min(2.5, -(targetPitch - noseUp) * 5));
      const omega = right
        .scale(pitchRate * 0.97)
        .add(forward.scale(Math.max(-3, Math.min(3, rollError * 8 - rollRate * 0.15))))
        .add(Vector3.Up().scale(targetYaw));
      body.setAngularVelocity(omega);
      if (wheelieLoading && this.contacts[0] && !preload) {
        // Permit the geometric rise around the rear wheel, but not an additional
        // spring launch. Uphill velocity remains intact as the rear contact climbs.
        const actual = body.getLinearVelocity();
        const climb = -(actual.x * normal.x + actual.z * normal.z) / Math.max(0.3, normal.y);
        const pivotRise =
          -pitchRate *
          (this.tune.wheelbase * 0.5 * Math.cos(noseUp) -
            (this.tune.suspensionLength + this.tune.wheelRadius) * Math.sin(noseUp));
        actual.y = Math.min(actual.y, climb + Math.max(0, pivotRise) + 0.08);
        body.setLinearVelocity(actual);
      }
      if (preload) this.preloadCharge = Math.min(1, this.preloadCharge + dt * 1.5);
      if (!preload && this.jumpHeld && this.jumpCooldown === 0 && this.preloadCharge > 0.1) {
        body.applyImpulse(
          up.scale(this.tune.jumpImpulse * (0.4 + this.preloadCharge)),
          this.position,
        );
        this.jumpCooldown = 0.7;
        this.preloadCharge = 0;
      }
      if (++this.stepCount % 120 === 0 && up.y > 0.9 && this.speed < 25) {
        this.safe.copyFrom(this.position);
        this.safeYaw = this.yaw;
      }
    } else {
      const pitchRate = Vector3.Dot(this.angularVelocity, right);
      const rear = Vector3.TransformCoordinates(this.floorSamples[1].point, mesh.getWorldMatrix());
      const rearGap = rear.y - collisionHeight(rear.x, rear.z) - this.floorSamples[1].radius;
      const holdingWheelie =
        input.pitch > 0.1 && input.throttle > 0.1 && rearGap < 0.5 && groundClearance < 2.5;
      const nearLanding = groundClearance < this.tune.landingAssistHeight && this.velocity.y < 0;
      const level = Vector3.Cross(up, nearLanding ? this.lastContactNormal : Vector3.Up());
      // Neutral sticks recover attitude; deliberate pitch input keeps control of flips.
      const stuckOnNose = groundClearance < 1.8 && this.speed < 3 && this.airtime > 0.35;
      const assist =
        Math.abs(input.pitch) < 0.1
          ? this.tune.airLevelStrength * (stuckOnNose ? 5 : nearLanding ? 1.8 : 0.55)
          : 0;
      if (stuckOnNose) {
        this.airtime = 0.4;
        body.applyForce(Vector3.Up().scale(this.tune.mass * 3), this.position);
      }
      body.setAngularVelocity(
        this.angularVelocity
          .add(
            right.scale(
              holdingWheelie
                ? Math.max(
                    -2.5,
                    Math.min(
                      2.5,
                      -(input.pitch * 0.65 - Math.asin(Math.max(-1, Math.min(1, forward.y)))) * 5,
                    ),
                  ) - pitchRate
                : (-input.pitch * this.tune.airPitch - pitchRate * 1.2) * dt,
            ),
          )
          .add(forward.scale(-(input.roll || input.steer) * 4.5 * dt))
          .add(level.scale(assist * dt))
          .add(Vector3.Up().scale(-this.angularVelocity.y * Math.min(1, 3 * dt))),
      );
    }
    this.jumpHeld = preload;
    if (!preload) this.preloadCharge = 0;
    this.visual.riderRig.pose(
      input.steer,
      this.speed,
      input.throttle,
      input.brake,
      Math.max(...this.compression),
      dt,
      this.preloadCharge,
      input.pitch,
      this.grounded,
    );
    if (this.kind === 'snowmobile') animateSnowmobile(this.visual, dt, this.speed, input.steer);
  }
}
