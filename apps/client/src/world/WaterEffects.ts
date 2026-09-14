import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { collisionHeight, waterAt } from '@brumbrum/world-format';
import type { Motorcycle } from '../vehicles/Motorcycle';

interface FoamPatch {
  mesh: Mesh;
  material: StandardMaterial;
  age: number;
  duration: number;
  width: number;
  length: number;
  ripple: boolean;
}

/** Water marks stay at the lake surface while the vehicle moves away from them. */
export class WaterEffects {
  private patches: FoamPatch[] = [];
  private patchIndex = 0;
  private spray: ParticleSystem;
  private lastPosition = Vector3.Zero();
  private lastVerticalSpeed = 0;
  private touching = false;
  private lastReset = -1;
  private wakeDistance = 0;
  private splashCooldown = 0;
  constructor(
    private scene: Scene,
    sprayTexture: DynamicTexture,
  ) {
    const foam = new DynamicTexture(
      'broken foam V wake',
      { width: 256, height: 256 },
      scene,
      false,
    );
    const c = foam.getContext();
    c.clearRect(0, 0, 256, 256);
    for (const width of [28, 15, 6]) {
      c.strokeStyle =
        width === 28
          ? 'rgba(216,244,250,0.11)'
          : width === 15
            ? 'rgba(225,249,253,0.23)'
            : 'rgba(247,255,255,0.7)';
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(19, 224);
      c.lineTo(128, 22);
      c.lineTo(237, 224);
      c.stroke();
    }
    let seed = 42;
    for (let i = 0; i < 230; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const t = (seed & 1023) / 1023;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const jitter = (seed & 1023) / 1023;
      c.fillStyle = 'rgba(237,252,255,0.33)';
      c.fillRect(
        128 + (i % 2 ? -1 : 1) * (t * 108 + jitter * 17 - 8),
        22 + t * 202,
        2 + jitter * 6,
        2 + jitter * 5,
      );
    }
    foam.hasAlpha = true;
    foam.update(false);
    for (let i = 0; i < 36; i++) {
      const ripple = i >= 28;
      const mesh = ripple
        ? MeshBuilder.CreateTorus(
            'expanding water impact ring',
            { diameter: 1, thickness: 0.025, tessellation: 64 },
            scene,
          )
        : MeshBuilder.CreateGround('fading hydroplane foam wake', { width: 1, height: 1 }, scene);
      const mat = new StandardMaterial('white water foam', scene);
      mat.diffuseColor = new Color3(0.76, 0.93, 0.97);
      mat.emissiveColor = new Color3(0.38, 0.48, 0.5);
      mat.specularColor.setAll(0);
      mat.backFaceCulling = false;
      if (!ripple) {
        mat.diffuseTexture = foam;
        mat.useAlphaFromDiffuseTexture = true;
      }
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.patches.push({ mesh, material: mat, age: 0, duration: 0, width: 1, length: 1, ripple });
    }
    const particles = new ParticleSystem('water landing splash droplets', 650, scene);
    particles.particleTexture = sprayTexture;
    particles.emitter = Vector3.Zero();
    particles.minEmitBox.set(-0.65, 0.02, -0.65);
    particles.maxEmitBox.set(0.65, 0.12, 0.65);
    particles.direction1.set(-1, 0.75, -1);
    particles.direction2.set(1, 2.5, 1);
    particles.gravity.set(0, -10, 0);
    particles.minLifeTime = 0.38;
    particles.maxLifeTime = 1.2;
    particles.minSize = 0.035;
    particles.maxSize = 0.2;
    particles.minScaleX = 0.5;
    particles.maxScaleX = 1;
    particles.minScaleY = 1.1;
    particles.maxScaleY = 2.6;
    particles.color1 = new Color4(0.83, 0.95, 1, 0.9);
    particles.color2 = new Color4(0.55, 0.81, 0.91, 0.6);
    particles.colorDead = new Color4(0.75, 0.9, 1, 0);
    particles.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    particles.emitRate = 0;
    particles.updateSpeed = 0.016;
    particles.start();
    this.spray = particles;
  }
  update(vehicle: Motorcycle): void {
    const dt = Math.max(0.001, Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000));
    for (const patch of this.patches) {
      if (!patch.mesh.isEnabled()) continue;
      patch.age += dt;
      const t = patch.age / patch.duration;
      if (t >= 1) {
        patch.mesh.setEnabled(false);
        continue;
      }
      patch.material.alpha = (1 - t) * (patch.ripple ? 0.48 : 0.62);
      const growth = patch.ripple ? 1 + t * 5 : 1 + t * 0.72;
      patch.mesh.scaling.set(patch.width * growth, 1, patch.length * growth);
    }
    const position = vehicle.position,
      level = waterAt(position.x, position.z);
    const moved = Vector3.Distance(position, this.lastPosition);
    const reset = vehicle.resetId !== this.lastReset || moved > 35;
    if (reset) {
      this.touching = false;
      this.wakeDistance = 0;
      this.lastVerticalSpeed = 0;
    }
    this.splashCooldown = Math.max(0, this.splashCooldown - dt);
    const bottom = Math.min(
      ...vehicle.visual.wheels.map(
        (wheel) => wheel.getAbsolutePosition().y - vehicle.tune.wheelRadius,
      ),
    );
    const touching = level !== undefined && bottom < level + 0.14;
    const descending = Math.max(-vehicle.velocity.y, -this.lastVerticalSpeed);
    if (!reset && touching && !this.touching && descending > 1.3 && this.splashCooldown <= 0) {
      (this.spray.emitter as Vector3).set(position.x, level! + 0.07, position.z);
      this.spray.minEmitPower = 1.5;
      this.spray.maxEmitPower = Math.min(8, 2.6 + descending * 0.24);
      this.spray.manualEmitCount = Math.min(360, Math.round(95 + descending * 8));
      const width = Math.max(
        0.9,
        ...vehicle.visual.wheels.map((wheel) => Math.abs(wheel.position.x) * 1.8),
      );
      for (let ring = 0; ring < 2; ring++)
        this.placePatch(
          true,
          position.x,
          level! + 0.045 + ring * 0.004,
          position.z,
          0,
          width + ring * 0.6,
          width + ring * 0.6,
          2.3 + ring * 0.6,
        );
      this.splashCooldown = 0.65;
    }
    if (vehicle.skimming && !vehicle.crashed && level !== undefined) {
      this.wakeDistance += reset ? 0 : moved;
      if (this.wakeDistance >= 1.0) {
        const forward = vehicle.visual.chassis.getDirection(Vector3.Forward());
        forward.y = 0;
        forward.normalize();
        const x = position.x - forward.x * 1.6,
          z = position.z - forward.z * 1.6;
        if (waterAt(x, z) !== undefined && collisionHeight(x, z) < level - 0.05) {
          const width = Math.max(
            1.0,
            ...vehicle.visual.wheels.map((wheel) => Math.abs(wheel.position.x) * 2),
          );
          this.placePatch(
            false,
            x,
            level + 0.045,
            z,
            Math.atan2(forward.x, forward.z),
            width + 0.8,
            2.4,
            2.8,
          );
        }
        this.wakeDistance = 0;
      }
    } else this.wakeDistance = 0;
    this.touching = touching;
    this.lastReset = vehicle.resetId;
    this.lastPosition.copyFrom(position);
    this.lastVerticalSpeed = vehicle.velocity.y;
  }
  private placePatch(
    ripple: boolean,
    x: number,
    y: number,
    z: number,
    yaw: number,
    width: number,
    length: number,
    duration: number,
  ): void {
    const pool = this.patches.filter((patch) => patch.ripple === ripple);
    const patch =
      pool.find((candidate) => !candidate.mesh.isEnabled()) ??
      pool[this.patchIndex++ % pool.length];
    patch.age = 0;
    patch.duration = duration;
    patch.width = width;
    patch.length = length;
    patch.mesh.position.set(x, y, z);
    patch.mesh.rotation.y = yaw;
    patch.mesh.scaling.set(width, 1, length);
    patch.material.alpha = ripple ? 0.48 : 0.62;
    patch.mesh.setEnabled(true);
  }
}
