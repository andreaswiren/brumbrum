import { Color4, DynamicTexture, ParticleSystem, Scene, Vector3 } from '@babylonjs/core';
import type { Motorcycle } from '../vehicles/Motorcycle';
import { collisionHeight, waterAt } from '@brumbrum/world-format';
import { WaterEffects } from './WaterEffects';
import { isSolidRidingSurface } from './RidingSurfaces';

/** Reusable wheel emitters: old particles fade naturally when the surface changes. */
export class SurfaceEffects {
  private systems: ParticleSystem[] = [];
  private clods: ParticleSystem[] = [];
  private water: WaterEffects;
  constructor(scene: Scene) {
    const texture = new DynamicTexture('soft wheel spray', 64, scene, false);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    texture.hasAlpha = true;
    texture.update(false);
    const clodTexture = new DynamicTexture('irregular loose soil', 32, scene, false);
    const clodContext = clodTexture.getContext();
    clodContext.fillStyle = '#ffffff';
    clodContext.beginPath();
    for (let corner = 0; corner < 7; corner++) {
      const angle = (corner * Math.PI * 2) / 7;
      const radius = corner % 2 ? 10 : 14;
      const x = 16 + Math.cos(angle) * radius,
        y = 16 + Math.sin(angle) * radius;
      if (corner === 0) clodContext.moveTo(x, y);
      else clodContext.lineTo(x, y);
    }
    clodContext.closePath();
    clodContext.fill();
    clodTexture.hasAlpha = true;
    clodTexture.update(false);
    this.water = new WaterEffects(scene, texture);
    for (let i = 0; i < 4; i++) {
      const particles = new ParticleSystem(`wheel ${i} surface spray`, 850, scene);
      particles.particleTexture = texture;
      particles.emitter = Vector3.Zero();
      particles.minEmitBox.set(-0.09, 0, -0.06);
      particles.maxEmitBox.set(0.09, 0.03, 0.06);
      particles.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      particles.minLifeTime = 0.65;
      particles.maxLifeTime = 1.65;
      particles.minSize = 0.08;
      particles.maxSize = 0.45;
      particles.minAngularSpeed = -1.5;
      particles.maxAngularSpeed = 1.5;
      particles.gravity.set(0, 0.12, 0);
      particles.addSizeGradient(0, 0.35);
      particles.addSizeGradient(0.3, 0.85);
      particles.addSizeGradient(1, 1.6);
      particles.addVelocityGradient(0, 1);
      particles.addVelocityGradient(1, 0.18);
      particles.emitRate = 0;
      particles.updateSpeed = 0.016;
      particles.start();
      this.systems.push(particles);
      const clods = new ParticleSystem(`wheel ${i} thrown soil`, 220, scene);
      clods.particleTexture = clodTexture;
      clods.emitter = Vector3.Zero();
      clods.minEmitBox.set(-0.07, 0, -0.06);
      clods.maxEmitBox.set(0.07, 0.05, 0.06);
      clods.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      clods.minLifeTime = 0.22;
      clods.maxLifeTime = 0.7;
      clods.minSize = 0.025;
      clods.maxSize = 0.095;
      clods.minAngularSpeed = -8;
      clods.maxAngularSpeed = 8;
      clods.updateSpeed = 0.016;
      clods.gravity.set(0, -9.81, 0);
      clods.emitRate = 0;
      clods.start();
      this.clods.push(clods);
    }
  }
  update(vehicle: Motorcycle, throttle: number): void {
    this.water.update(vehicle);
    const speed = vehicle.speed,
      wet = vehicle.skimming;
    const snow = vehicle.surface === 'snow',
      grass = vehicle.surface === 'grass';
    const enabled =
      !vehicle.crashed &&
      !vehicle.submerged &&
      speed > 1.5 &&
      vehicle.surface !== 'asphalt' &&
      vehicle.surface !== 'ice';
    const forward = new Vector3(Math.sin(vehicle.yaw), 0, Math.cos(vehicle.yaw));
    if (Vector3.Dot(vehicle.velocity, forward) < -0.2) forward.scaleInPlace(-1);
    const right = new Vector3(Math.cos(vehicle.yaw), 0, -Math.sin(vehicle.yaw));
    const lateral = Vector3.Dot(vehicle.velocity, right);
    const slide = vehicle.slideIntensity;
    const tint = wet
      ? [0.53, 0.77, 0.83]
      : snow
        ? [0.9, 0.96, 1]
        : grass
          ? [0.4, 0.36, 0.2]
          : vehicle.surface === 'mud'
            ? [0.25, 0.18, 0.1]
            : [0.59, 0.43, 0.25];
    this.systems.forEach((particles, i) => {
      const clods = this.clods[i];
      const wheel = vehicle.visual.wheels[i];
      // Render interpolation changes the parent immediately before this update.
      // Refresh the hierarchy before sampling the tyre's contact position.
      wheel?.computeWorldMatrix(true);
      const point = wheel?.getAbsolutePosition();
      const waterLevel = point ? waterAt(point.x, point.z) : undefined;
      const underwater =
        point && waterLevel !== undefined && point.y - vehicle.tune.wheelRadius < waterLevel - 0.1;
      const solid =
        point && isSolidRidingSurface(point.x, point.y - vehicle.tune.wheelRadius, point.z);
      const active = enabled && !!wheel && vehicle.contacts[i] && !solid && (wet || !underwater);
      const driven = vehicle.kind === 'bike' || vehicle.kind === 'snowmobile' ? i === 0 : i < 2;
      const wheelWeight = driven ? 1 : 0.32;
      const sizeScale = Math.min(2.1, Math.max(1, vehicle.tune.wheelRadius / 0.36));
      const spread = vehicle.kind === 'snowmobile' && driven ? 0.3 : 0.09 * sizeScale;
      particles.minEmitBox.set(-spread, 0, -0.08 * sizeScale);
      particles.maxEmitBox.set(spread, 0.08, 0.08 * sizeScale);
      clods.minEmitBox.copyFrom(particles.minEmitBox);
      clods.maxEmitBox.copyFrom(particles.maxEmitBox);
      const drive = Math.max(0, Math.min(1, throttle));
      particles.emitRate = active
        ? wet
          ? Math.min(105, speed * 4 * (0.35 + throttle * 0.8))
          : Math.min(
              480,
              (35 + speed * (3.5 + drive * 4) + slide * 310) * wheelWeight * Math.sqrt(sizeScale),
            )
        : 0;
      clods.emitRate =
        active && !wet
          ? Math.min(230, (12 + speed * (0.7 + drive * 1.8) + slide * 170) * wheelWeight)
          : 0;
      if (!active) return;
      (particles.emitter as Vector3).set(
        point!.x,
        wet && waterLevel !== undefined
          ? waterLevel + 0.06
          : Math.max(
              collisionHeight(point!.x, point!.z) + 0.14,
              point!.y - vehicle.tune.wheelRadius,
            ),
        point!.z,
      );
      const x = point!.x,
        z = point!.z;
      const normal = wet
        ? Vector3.Up()
        : new Vector3(
            collisionHeight(x - 0.5, z) - collisionHeight(x + 0.5, z),
            1,
            collisionHeight(x, z - 0.5) - collisionHeight(x, z + 0.5),
          ).normalize();
      const tangent = forward.subtract(normal.scale(Vector3.Dot(forward, normal))).normalize();
      const surfaceRight = Vector3.Cross(normal, tangent).normalize();
      const throwSide = wet ? 0 : -Math.sign(lateral) * slide * 2.2;
      const throwSpeed = 2.2 + drive * 1.8 + Math.min(3, speed * 0.075);
      const throw1 = tangent
        .scale(-throwSpeed)
        .add(surfaceRight.scale(throwSide - 0.6))
        .add(normal.scale(1.1 + slide));
      const throw2 = tangent
        .scale(-throwSpeed * 1.6)
        .add(surfaceRight.scale(throwSide + 0.6))
        .add(normal.scale(2.3 + drive + slide * 1.5));
      particles.direction1.copyFrom(throw1);
      particles.direction2.copyFrom(throw2);
      particles.minEmitPower = 0.75;
      particles.maxEmitPower = 1.25;
      particles.minSize = wet ? 0.035 : 0.08;
      particles.maxSize = wet ? 0.15 : ((snow ? 0.65 : 0.9) + slide * 0.35) * Math.sqrt(sizeScale);
      clods.minSize = 0.035 * sizeScale;
      clods.maxSize = 0.1 * sizeScale;
      particles.minLifeTime = wet ? 0.25 : 0.65;
      particles.maxLifeTime = wet ? 0.85 : 1.65;
      particles.gravity.y = wet ? -4 : 0.12;
      particles.color1 = new Color4(tint[0], tint[1], tint[2], wet ? 0.8 : 0.72);
      particles.color2 = new Color4(tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8, wet ? 0.4 : 0.5);
      particles.colorDead = new Color4(tint[0], tint[1], tint[2], 0);
      (clods.emitter as Vector3).copyFrom(particles.emitter as Vector3);
      clods.direction1.copyFrom(particles.direction1);
      clods.direction2.copyFrom(particles.direction2);
      clods.minEmitPower = 0.8;
      clods.maxEmitPower = 1.25 + slide * 0.65;
      clods.color1 = new Color4(tint[0] * 0.65, tint[1] * 0.65, tint[2] * 0.65, 1);
      clods.color2 = new Color4(tint[0], tint[1], tint[2], 0.9);
      clods.colorDead = new Color4(tint[0], tint[1], tint[2], 0);
    });
  }
}
