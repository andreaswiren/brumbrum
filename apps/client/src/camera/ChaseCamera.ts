import { FreeCamera, Scene, Vector3 } from '@babylonjs/core';
import { camera as config } from '@brumbrum/configuration';
import { terrainHeight } from '@brumbrum/world-format';
import type { Motorcycle } from '../vehicles/Motorcycle';
export class ChaseCamera {
  readonly camera: FreeCamera;
  mode = 0;
  private target = Vector3.Zero();
  constructor(
    scene: Scene,
    private vehicle: Motorcycle,
  ) {
    this.camera = new FreeCamera(
      'chase camera',
      vehicle.position.add(new Vector3(0, 4, -9)),
      scene,
    );
    this.camera.minZ = 0.1;
    this.camera.maxZ = 1900;
    this.camera.fov = config.baseFov;
    this.target.copyFrom(vehicle.position);
  }
  cycle(): void {
    this.mode = (this.mode + 1) % 3;
  }
  update(dt: number): void {
    const p = this.vehicle.position,
      yaw = this.vehicle.yaw,
      forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const distance =
      (this.mode === 1 ? 13 : config.distance) + this.vehicle.speed * config.speedDistance;
    const desired =
      this.mode === 2
        ? p.add(new Vector3(0, 1.8, 0)).add(forward.scale(0.35))
        : p
            .subtract(forward.scale(distance))
            .add(new Vector3(0, this.mode === 1 ? 6 : config.height, 0));
    desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 1.4);
    const blend = this.mode === 2 ? 1 : 1 - Math.exp(-config.smoothing * dt);
    Vector3.LerpToRef(this.camera.position, desired, blend, this.camera.position);
    Vector3.LerpToRef(
      this.target,
      p.add(new Vector3(0, 1, 0)).add(forward.scale(this.mode === 2 ? 12 : 4)),
      Math.min(1, dt * 8),
      this.target,
    );
    this.camera.setTarget(this.target);
    this.camera.fov = config.baseFov + this.vehicle.speed * 0.004;
  }
}
