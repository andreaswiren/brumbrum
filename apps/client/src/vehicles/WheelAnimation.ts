import { TransformNode } from '@babylonjs/core';
import type { BikeVisual } from './BikeVisual';
import type { VehicleKind } from './VehicleModels';

/** Suspension, steering and axle rotation each have a separate transform. */
export class WheelAnimation {
  private spins: TransformNode[] = [];
  private steer = 0;
  constructor(
    private visual: BikeVisual,
    private kind: VehicleKind,
    private wheelbase: number,
  ) {
    if (kind === 'snowmobile') return;
    for (const wheel of visual.wheels) {
      const children = wheel.getChildren();
      const spin = new TransformNode('wheel axle rotation', wheel.getScene());
      spin.parent = wheel;
      for (const child of children) child.parent = spin;
      this.spins.push(spin);
    }
  }
  reset(): void {
    this.steer = 0;
    for (const wheel of this.visual.wheels) wheel.rotation.y = 0;
  }
  update(dt: number, input: number, speed: number, radius: number): void {
    if (this.kind === 'snowmobile') return;
    const lock = this.kind === 'bike' ? 0.52 : this.kind === 'monster' ? 0.6 : 0.65;
    // Preserve visible steering at speed while reducing excessive steering lock.
    const target = (input * lock) / (1 + Math.abs(speed) * 0.012);
    this.steer += (target - this.steer) * (1 - Math.exp(-14 * dt));
    this.visual.wheels.forEach((wheel, i) => {
      let angle = this.steer;
      if (this.kind !== 'bike' && Math.abs(angle) > 0.001) {
        const turnRadius = this.wheelbase / Math.tan(Math.abs(angle));
        const localRadius = Math.max(0.3, turnRadius - Math.sign(angle) * wheel.position.x);
        angle = Math.sign(angle) * Math.atan(this.wheelbase / localRadius);
      }
      wheel.rotation.y = wheel.position.z > 0 ? angle : 0;
      this.spins[i].rotation.x = (this.spins[i].rotation.x + (speed * dt) / radius) % (Math.PI * 2);
    });
  }
}
