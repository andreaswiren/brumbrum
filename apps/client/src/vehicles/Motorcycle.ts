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
} from '@babylonjs/core';
import { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import { bike, physics, surfaces, type Surface } from '@brumbrum/configuration';
import { surfaceAt, terrainHeight } from '@brumbrum/world-format';
import type { InputActions } from '../input/InputManager';
import { createBikeVisual, type BikeVisual } from './BikeVisual';
export class Motorcycle {
  readonly visual: BikeVisual;
  readonly aggregate: PhysicsAggregate;
  readonly velocity = Vector3.Zero();
  readonly angularVelocity = Vector3.Zero();
  readonly contacts = [false, false];
  readonly compression = [0, 0];
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
  private results = [new PhysicsRaycastResult(), new PhysicsRaycastResult()];
  private debugLines: LinesMesh[] = [];
  private debug = false;
  constructor(private scene: Scene) {
    this.visual = createBikeVisual(scene);
    this.visual.chassis.position.set(0, terrainHeight(0, 12) + bike.resetClearance, 12);
    this.aggregate = new PhysicsAggregate(
      this.visual.chassis,
      PhysicsShapeType.BOX,
      { mass: bike.mass, friction: 0.5, restitution: 0.05 },
      scene,
    );
    this.aggregate.body.setMassProperties({ mass: bike.mass, inertia: new Vector3(65, 95, 42) });
    this.aggregate.body.setAngularDamping(0.6);
    this.aggregate.body.setLinearDamping(0.025);
    this.aggregate.body.setCollisionCallbackEnabled(true);
    this.aggregate.body.getCollisionObservable().add((event) => {
      if (Math.abs(event.impulse ?? 0) > bike.mass * bike.crashImpactSpeed) this.crashed = true;
    });
  }
  get position(): Vector3 {
    return this.visual.chassis.position;
  }
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
  get yaw(): number {
    const f = this.visual.chassis.getDirection(Vector3.Forward());
    return Math.atan2(f.x, f.z);
  }
  setDebug(enabled: boolean): void {
    this.debug = enabled;
    if (!enabled) {
      this.debugLines.forEach((l) => l.dispose());
      this.debugLines = [];
    }
  }
  reset(atSpawn = false): void {
    if (atSpawn) {
      this.safe.set(0, 0, 12);
      this.safeYaw = 0;
    }
    const mesh = this.visual.chassis;
    mesh.position.set(
      this.safe.x,
      terrainHeight(this.safe.x, this.safe.z) + bike.resetClearance,
      this.safe.z,
    );
    mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(this.safeYaw, 0, 0);
    // Teleport once via Havok's prestep, then return transform ownership to physics.
    this.aggregate.body.disablePreStep = false;
    this.aggregate.body.setLinearVelocity(Vector3.Zero());
    this.aggregate.body.setAngularVelocity(Vector3.Zero());
    this.velocity.setAll(0);
    this.crashed = false;
    this.airtime = 0;
    this.impactVelocity = 0;
    this.grounded = false;
    this.scene.onAfterPhysicsObservable.addOnce(() => {
      this.aggregate.body.disablePreStep = true;
    });
  }
  step(input: InputActions): void {
    const dt = physics.step,
      body = this.aggregate.body,
      mesh = this.visual.chassis;
    body.getLinearVelocityToRef(this.velocity);
    body.getAngularVelocityToRef(this.angularVelocity);
    mesh.computeWorldMatrix(true);
    const up = mesh.getDirection(Vector3.Up()),
      forward = mesh.getDirection(Vector3.Forward()),
      right = mesh.getDirection(Vector3.Right());
    const wasGrounded = this.grounded;
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine;
    this.surface = surfaceAt(this.position.x, this.position.z);
    let contactCount = 0;
    for (let i = 0; i < 2; i++) {
      const origin = Vector3.TransformCoordinates(
        new Vector3(0, 0, ((i === 0 ? -1 : 1) * bike.wheelbase) / 2),
        mesh.getWorldMatrix(),
      );
      const end = origin.subtract(up.scale(bike.suspensionLength + bike.wheelRadius));
      const hit = this.results[i];
      engine.raycastToRef(origin, end, hit, { ignoreBody: body });
      this.contacts[i] = hit.hasHit && Vector3.Dot(hit.hitNormalWorld, up) > 0.25;
      this.compression[i] = this.contacts[i]
        ? Math.max(0, bike.suspensionLength + bike.wheelRadius - hit.hitDistance)
        : 0;
      if (this.contacts[i] && !this.crashed) {
        contactCount++;
        const pointVelocity = this.velocity.add(
          Vector3.Cross(this.angularVelocity, origin.subtract(this.position)),
        );
        const springForce = Math.min(
          bike.maxSuspensionForce,
          Math.max(
            0,
            this.compression[i] * bike.spring - Vector3.Dot(pointVelocity, up) * bike.damper,
          ),
        );
        body.applyForce(up.scale(springForce), origin);
      }
      this.visual.wheels[i].position.y = -bike.suspensionLength + this.compression[i];
      this.visual.wheels[i].rotation.x += (this.speed * dt) / bike.wheelRadius;
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
    if (up.y < 0.2 && this.position.y - terrainHeight(this.position.x, this.position.z) < 1.35)
      this.crashed = true;
    // Havok applies forces as impulses immediately. Preserve the spring torque
    // before applying assists, otherwise balance control erases suspension pitch.
    body.getAngularVelocityToRef(this.angularVelocity);
    if (this.grounded && !wasGrounded) {
      this.lastAir = this.airtime;
      this.bestAir = Math.max(this.bestAir, this.airtime);
      if (this.impactVelocity < -bike.crashImpactSpeed || up.y < 0.3) this.crashed = true;
      this.airtime = 0;
    }
    if (!this.grounded && !this.crashed) this.airtime += dt;
    this.impactVelocity = this.velocity.y;
    if (this.position.y < terrainHeight(this.position.x, this.position.z) - 20) this.reset();
    if (this.crashed) return;
    const speedForward = Vector3.Dot(this.velocity, forward),
      surface = surfaces[this.surface];
    this.distance += this.speed * dt;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (this.grounded) {
      const throttleForce =
        input.throttle *
        bike.driveForce *
        Math.max(0, 1 - Math.max(0, speedForward) / bike.maxSpeed);
      const hillHold = input.throttle === 0 && this.speed < 1.5 ? 0.16 : 0;
      const brake =
        (Math.max(input.brake, hillHold) + (input.rearBrake ? 0.65 : 0)) * bike.brakeForce;
      const resistance = surface.resistance * bike.mass * speedForward;
      const braking =
        Math.sign(speedForward) *
        Math.min(brake, ((Math.abs(speedForward) * bike.mass) / dt) * 0.4);
      body.applyForce(
        forward.scale(throttleForce * surface.grip - resistance - braking),
        this.position,
      );
      const lateral = Vector3.Dot(this.velocity, right);
      body.applyForce(
        right.scale(
          -lateral * bike.mass * bike.lateralGrip * surface.grip * (input.rearBrake ? 0.35 : 1),
        ),
        this.position,
      );
      const targetYaw =
        input.steer *
        bike.steerRate *
        Math.min(1, this.speed / 4) *
        (0.55 + 0.45 / (1 + this.speed / 15));
      const lean = -input.steer * Math.min(0.36, this.speed * 0.015);
      const targetUp = new Vector3(
        -Math.cos(this.yaw) * Math.sin(lean),
        Math.cos(lean),
        Math.sin(this.yaw) * Math.sin(lean),
      );
      // Roll balance is assisted; suspension torques remain responsible for terrain pitch.
      const rollError = Vector3.Dot(Vector3.Cross(up, targetUp), forward);
      const rollRate = Vector3.Dot(this.angularVelocity, forward);
      const pitchRate = Vector3.Dot(this.angularVelocity, right);
      const omega = right
        .scale(pitchRate * 0.97)
        .add(
          forward.scale(
            rollRate + (rollError * bike.balanceStrength - rollRate * bike.balanceDamping) * dt,
          ),
        )
        .add(Vector3.Up().scale(targetYaw));
      body.setAngularVelocity(omega);
      if (up.y < bike.crashTilt) this.crashed = true;
      if (input.preload && !this.jumpHeld && this.jumpCooldown === 0) {
        body.applyImpulse(up.scale(bike.jumpImpulse), this.position);
        this.jumpCooldown = 1;
      }
      if (++this.stepCount % 120 === 0 && up.y > 0.9 && this.speed < 25) {
        this.safe.copyFrom(this.position);
        this.safeYaw = this.yaw;
      }
    } else {
      const pitchRate = Vector3.Dot(this.angularVelocity, right);
      body.setAngularVelocity(
        this.angularVelocity
          .add(right.scale((input.pitch * bike.airPitch - pitchRate * 0.65) * dt))
          .add(Vector3.Up().scale(input.steer * 0.4 * dt)),
      );
    }
    this.jumpHeld = input.preload;
    this.visual.rider.rotation.z = -input.steer * Math.min(0.16, this.speed * 0.008);
  }
}
