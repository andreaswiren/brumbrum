import { Color4, DynamicTexture, ParticleSystem, Scene, Vector3 } from '@babylonjs/core';
import type { Motorcycle } from '../vehicles/Motorcycle';
import { waterAt } from '@brumbrum/world-format';
import { WaterEffects } from './WaterEffects';

/** Reusable wheel emitters: old particles fade naturally when the surface changes. */
export class SurfaceEffects {
  private systems: ParticleSystem[] = [];
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
    texture.update(false);
    this.water = new WaterEffects(scene, texture);
    for (let i = 0; i < 4; i++) {
      const particles = new ParticleSystem(`wheel ${i} surface spray`, 160, scene);
      particles.particleTexture = texture;
      particles.emitter = Vector3.Zero();
      particles.minEmitBox.set(-0.09, 0, -0.06);
      particles.maxEmitBox.set(0.09, 0.03, 0.06);
      particles.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      particles.minLifeTime = 0.25;
      particles.maxLifeTime = 1.05;
      particles.minSize = 0.08;
      particles.maxSize = 0.45;
      particles.minAngularSpeed = -1.5;
      particles.maxAngularSpeed = 1.5;
      particles.gravity.set(0, -1.5, 0);
      particles.emitRate = 0;
      particles.updateSpeed = 0.016;
      particles.start();
      this.systems.push(particles);
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
    const forward = vehicle.visual.chassis.getDirection(Vector3.Forward());
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
      const wheel = vehicle.visual.wheels[i];
      const point = wheel?.getAbsolutePosition();
      const waterLevel = point ? waterAt(point.x, point.z) : undefined;
      const underwater =
        point && waterLevel !== undefined && point.y - vehicle.tune.wheelRadius < waterLevel - 0.1;
      const active = enabled && !!wheel && vehicle.contacts[i] && (wet || !underwater);
      particles.emitRate = active
        ? Math.min(105, speed * (wet ? 4 : 2.4) * (0.35 + throttle * 0.8))
        : 0;
      if (!active) return;
      (particles.emitter as Vector3).set(
        point!.x,
        wet && waterLevel !== undefined
          ? waterLevel + 0.06
          : point!.y - vehicle.tune.wheelRadius * 0.75,
        point!.z,
      );
      particles.direction1.set(-forward.x * 1.5 - 0.4, 0.3, -forward.z * 1.5 - 0.4);
      particles.direction2.set(-forward.x * 3 + 0.4, wet ? 1.8 : 1, -forward.z * 3 + 0.4);
      particles.minEmitPower = 0.7;
      particles.maxEmitPower = 1.5 + speed * 0.07;
      particles.minSize = wet ? 0.035 : 0.08;
      particles.maxSize = wet ? 0.15 : snow ? 0.4 : 0.65;
      particles.color1 = new Color4(tint[0], tint[1], tint[2], wet ? 0.8 : 0.45);
      particles.color2 = new Color4(tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8, 0.25);
      particles.colorDead = new Color4(tint[0], tint[1], tint[2], 0);
    });
  }
}
