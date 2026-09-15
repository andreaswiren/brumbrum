import { FreeCamera, Quaternion, Vector3, type Camera } from '@babylonjs/core';

/** Keep cascade texel scale independent of the chase camera's speed zoom. */
export class StableShadowCamera extends FreeCamera {
  constructor(source: Camera) {
    super('stable shadow projection', Vector3.Zero(), source.getScene());
    this.fov = 1.5;
    this.sync(source);
  }
  sync(source: Camera): void {
    // Inherit the view exactly, including camera orbit, without inheriting FOV.
    const world = source.getViewMatrix().clone().invert();
    this.rotationQuaternion ??= Quaternion.Identity();
    world.decompose(undefined, this.rotationQuaternion, this.position);
    this.upVector.copyFrom(source.upVector);
    this.minZ = source.minZ;
    this.maxZ = source.maxZ;
    this.viewport = source.viewport.clone();
    this.getViewMatrix(true);
    this.getProjectionMatrix(true);
  }
}
