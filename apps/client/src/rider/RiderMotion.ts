import { Vector3 } from '@babylonjs/core';
import { riderAnatomy as anatomy } from './RiderAnatomy';

export type RidingStance = 'bike' | 'atv' | 'monster' | 'snowmobile';
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Contact targets are in vehicle space, so hands and boots stay planted during weight transfer. */
export function ridingContacts(stance: RidingStance, side: number) {
  return stance === 'monster'
    ? {
        hand: v(side * 0.22, 0.78, 0.37 - anatomy.wristToGrip),
        foot: v(side * 0.19, -0.02 + anatomy.ankleToSole, 0.1),
      }
    : {
        hand: v(side * (stance === 'atv' ? 0.44 : 0.4), 0.68, 0.55 - anatomy.wristToGrip),
        foot: v(
          side * (stance === 'snowmobile' ? 0.34 : stance === 'atv' ? 0.4 : 0.33),
          (stance === 'bike' ? -0.03 : -0.1) + anatomy.ankleToSole,
          -0.035,
        ),
      };
}

export function ridingHipOffset(stance: RidingStance, side: number): Vector3 {
  return v(side * anatomy.hipHalfWidth, 0.0154, 0.0515);
}

/** Knees wrap around the tank, keeping the leg chain on its own side of the motorcycle. */
export function ridingLeg(
  stance: RidingStance,
  hip: Vector3,
  side: number,
  footOverride?: Vector3,
) {
  const hipJoint = hip.add(ridingHipOffset(stance, side));
  const foot = footOverride?.clone() ?? ridingContacts(stance, side).foot;
  const knee = bendLimb(
    hipJoint,
    foot,
    anatomy.thigh,
    anatomy.shin,
    stance === 'bike' ? v(side * 1.1, 0, 1.0) : v(side * 0.16, 0, 1),
  );
  return { hipJoint, knee, foot };
}

/** Fixed-length two-bone IK; the upstream pose keeps the destination inside the reachable sphere. */
export function bendLimb(
  a: Vector3,
  b: Vector3,
  upper: number,
  lower: number,
  direction: Vector3,
): Vector3 {
  const delta = b.subtract(a),
    distance = Math.max(0.001, delta.length()),
    axis = delta.scale(1 / distance);
  const reach = clamp(distance, Math.abs(upper - lower) + 0.001, upper + lower - 0.001);
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const offset = Math.sqrt(Math.max(0, upper * upper - along * along));
  let perpendicular = direction.subtract(axis.scale(Vector3.Dot(direction, axis)));
  if (perpendicular.lengthSquared() < 0.0001) perpendicular = Vector3.Cross(axis, Vector3.Right());
  perpendicular.normalize();
  return a.add(axis.scale(along)).add(perpendicular.scale(offset));
}

/** Frame-rate independent weight transfer, with a fast compression and slower extension stroke. */
export class RiderMotion {
  stance: RidingStance = 'bike';
  private lean = 0;
  private brace = 0;
  private preload = 0;
  private weight = 0;
  private touchdown = 0;
  private wasGrounded = true;
  private airDuration = 0;
  private idleTime = 0;
  resting = 0;

  reset(): void {
    this.lean = this.brace = this.preload = this.weight = this.touchdown = this.airDuration = 0;
    this.wasGrounded = true;
    this.resting = this.idleTime = 0;
  }

  update(
    steer: number,
    speed: number,
    throttle: number,
    brake: number,
    compression: number,
    dt: number,
    preload = 0,
    weight = 0,
    grounded = true,
    plantedFootTarget?: Vector3,
    footPushing = 0,
  ) {
    const step = Math.max(0, dt),
      blend = 1 - Math.exp(-8 * step);
    const idle =
      this.stance === 'bike' &&
      grounded &&
      Math.abs(speed) < 0.8 &&
      throttle < 0.03 &&
      preload < 0.03 &&
      Math.abs(weight) < 0.15;
    const support = this.stance === 'bike' && grounded ? Math.max(idle ? 1 : 0, footPushing) : 0;
    this.resting +=
      (support - this.resting) * (1 - Math.exp(-(support > this.resting ? 3.5 : 14) * step));
    this.idleTime += step;
    const plantedFoot = plantedFootTarget
      ? Vector3.Lerp(ridingContacts(this.stance, -1).foot, plantedFootTarget, this.resting)
      : undefined;
    if (!grounded) this.airDuration += step;
    if (grounded && !this.wasGrounded) {
      this.touchdown = Math.min(0.14, this.airDuration * 0.1);
      this.airDuration = 0;
    }
    this.wasGrounded = grounded;
    this.touchdown *= Math.exp(-5 * step);
    const seated = this.stance === 'monster';
    const leanScale = seated ? 0.18 : this.stance === 'atv' ? 0.75 : 1;
    this.lean +=
      (clamp(steer, -1, 1) * Math.min(1, Math.abs(speed) / 12) * leanScale - this.lean) * blend;
    const targetBrace = Math.min(0.16, Math.max(0, compression) * 0.6) + this.touchdown;
    this.brace +=
      (targetBrace - this.brace) * (1 - Math.exp(-(targetBrace > this.brace ? 18 : 6) * step));
    this.preload += (clamp(preload, 0, 1) - this.preload) * blend;
    this.weight += (clamp(weight, -1, 1) - this.weight) * blend;
    const shift =
      (throttle * -0.035 +
        brake * 0.06 -
        this.weight * 0.13 * (1 - this.preload) +
        this.preload * 0.08) *
      (seated ? 0.2 : 1);
    const crouch = (this.brace + this.preload * 0.22) * (seated ? 0.22 : 1);
    const hip = v(
      this.lean * (this.stance === 'bike' ? 0.035 : 0.14) * (1 - this.resting) -
        this.resting * 0.17,
      this.stance === 'bike'
        ? 0.565 - this.resting * 0.025
        : (seated ? 0.61 : 0.68) - crouch * 0.48,
      (seated ? -0.39 : -0.28) + shift,
    );
    for (let pass = 0; pass < 4; pass++)
      for (const side of [-1, 1]) {
        const centre = (
          side === -1 && plantedFoot ? plantedFoot : ridingContacts(this.stance, side).foot
        ).subtract(ridingHipOffset(this.stance, side));
        const offset = hip.subtract(centre);
        const reach = anatomy.thigh + anatomy.shin - 0.005;
        if (offset.length() > reach) hip.copyFrom(centre.add(offset.normalize().scale(reach)));
      }
    const neck = v(
      this.lean * 0.37,
      (seated ? 1.28 : 1.34) - crouch + Math.sin(this.idleTime * 2.1) * this.resting * 0.006,
      0.1 + shift + this.preload * (seated ? 0.05 : 0.24) - Math.min(0, this.weight) * 0.09,
    );
    // Keep the human's spine and arm lengths fixed. Rotate the torso forward
    // until both wrists can reach their grips; do not stretch imported anatomy.
    for (let pass = 0; pass < 24; pass++) {
      neck.copyFrom(hip.add(neck.subtract(hip).normalize().scale(anatomy.torso)));
      for (const side of [-1, 1]) {
        const centre = ridingContacts(this.stance, side).hand.subtract(
          v(side * anatomy.shoulderHalfWidth, -0.0066, -0.0138),
        );
        const offset = neck.subtract(centre),
          reach = anatomy.upperArm + anatomy.forearm - 0.002;
        if (offset.length() > reach) neck.copyFrom(centre.add(offset.normalize().scale(reach)));
      }
    }
    // Absorb impacts by folding at the hips after finding the reachable bar pose.
    // This preserves spine length while letting the elbows bend instead of
    // lifting the entire seated pelvis through the saddle.
    const relative = neck.subtract(hip),
      fold = Math.min(0.32, this.brace * 3);
    neck.copyFrom(
      hip.add(
        v(
          relative.x,
          relative.y * Math.cos(fold) - relative.z * Math.sin(fold),
          relative.y * Math.sin(fold) + relative.z * Math.cos(fold),
        ),
      ),
    );
    const chest = neck.add(v(0, -0.0066, -0.0138));
    return {
      hip,
      neck,
      chest,
      lean: this.lean,
      plantedFoot,
      breath: Math.sin(this.idleTime * 2.1) * this.resting * 0.002,
      headYaw: Math.sin(this.idleTime * 0.43) * this.resting * 0.035,
    };
  }
}
