import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Motorcycle } from './Motorcycle';

/** Render between fixed-step poses, restoring Havok's transform after each frame. */
export class VehicleInterpolation {
  private previous = Vector3.Zero();
  private previousRotation = Quaternion.Identity();
  private current = Vector3.Zero();
  private currentRotation = Quaternion.Identity();
  private source?: Motorcycle;
  private resetId = -1;
  private applied = false;
  capture(vehicle: Motorcycle): void {
    this.source = vehicle;
    this.resetId = vehicle.resetId;
    this.previous.copyFrom(vehicle.position);
    this.previousRotation.copyFrom(vehicle.visual.chassis.rotationQuaternion!);
  }
  render(vehicle: Motorcycle, alpha: number): void {
    if (vehicle !== this.source || vehicle.resetId !== this.resetId || vehicle.crashed) return;
    this.current.copyFrom(vehicle.position);
    this.currentRotation.copyFrom(vehicle.visual.chassis.rotationQuaternion!);
    if (Vector3.DistanceSquared(this.previous, this.current) > 100) return;
    Vector3.LerpToRef(this.previous, this.current, alpha, vehicle.position);
    // A shallow visual rut gives loose-ground slides weight; Havok contact stays unchanged.
    vehicle.position.y -= vehicle.rutDepth || 0;
    Quaternion.SlerpToRef(
      this.previousRotation,
      this.currentRotation,
      alpha,
      vehicle.visual.chassis.rotationQuaternion!,
    );
    vehicle.visual.chassis.computeWorldMatrix(true);
    this.applied = true;
  }
  restore(): void {
    if (!this.applied || !this.source) return;
    this.source.position.copyFrom(this.current);
    this.source.visual.chassis.rotationQuaternion!.copyFrom(this.currentRotation);
    this.source.visual.chassis.computeWorldMatrix(true);
    this.applied = false;
  }
}
