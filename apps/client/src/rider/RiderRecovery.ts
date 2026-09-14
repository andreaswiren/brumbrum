import { Vector3 } from '@babylonjs/core';
import { collisionHeight } from '@brumbrum/world-format';

export interface RecoveryState {
  phase: 'standing' | 'running' | 'lifting' | 'done';
  lift: number;
}
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** During stance, backward foot travel exactly cancels forward root travel. */
export function recoveryFootstep(stride: number, side: number) {
  const phase = (((stride / (Math.PI * 2) + (side < 0 ? 0.5 : 0)) % 1) + 1) % 1;
  const planted = phase < 0.56;
  const swing = Math.max(0, (phase - 0.56) / 0.44);
  const t2 = swing * swing,
    t3 = t2 * swing;
  // Match the stance velocity at both swing boundaries; an eased position
  // alone stops the foot abruptly at toe-off and heel strike.
  const swingZ =
    (2 * t3 - 3 * t2 + 1) * -0.35 +
    (t3 - 2 * t2 + swing) * -0.55 +
    (-2 * t3 + 3 * t2) * 0.35 +
    (t3 - t2) * -0.55;
  const stance = phase / 0.56;
  const pitch = planted
    ? -0.18 * (1 - smooth(stance / 0.18)) + 0.35 * smooth((stance - 0.62) / 0.38)
    : 0.35 * (1 - smooth(swing / 0.55)) - 0.18 * smooth((swing - 0.55) / 0.45);
  return {
    z: planted ? 0.35 - (phase / 0.56) * 0.7 : swingZ,
    lift: planted ? 0 : Math.sin(Math.PI * swing) ** 2 * 0.18,
    pitch,
    planted,
  };
}

/** Local recovery clock and ground-following route, independent of the crashed vehicle transform. */
export class RiderRecovery {
  readonly position: Vector3;
  phase: RecoveryState['phase'] = 'standing';
  elapsed = 0;
  stride = 0;
  speed = 0;
  yaw: number;
  constructor(start: Vector3, yaw: number) {
    this.position = start.clone();
    this.position.y = collisionHeight(start.x, start.z);
    this.yaw = yaw;
  }
  get standBlend(): number {
    return smooth((this.elapsed - 0.32) / 1.15);
  }
  update(dt: number, target: Vector3): RecoveryState {
    const step = Math.max(0, Math.min(dt, 0.1));
    this.elapsed += step;
    if (this.phase === 'standing' && this.elapsed >= 1.55) {
      this.phase = 'running';
      this.elapsed = 0;
    }
    if (this.phase === 'running') {
      const delta = target.subtract(this.position);
      delta.y = 0;
      const distance = delta.length();
      if (distance <= 0.06) {
        this.phase = 'lifting';
        this.elapsed = 0;
      } else {
        const targetSpeed = Math.min(1.65, Math.sqrt(distance * 4.0));
        this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-5 * step));
        const direction = delta.scale(1 / distance),
          travel = Math.min(distance, step * this.speed);
        this.position.addInPlace(direction.scale(travel));
        this.position.y = collisionHeight(this.position.x, this.position.z);
        this.stride += (travel * Math.PI * 2) / 1.25;
        const goal = Math.atan2(direction.x, direction.z);
        const angle = Math.atan2(Math.sin(goal - this.yaw), Math.cos(goal - this.yaw));
        this.yaw += angle * (1 - Math.exp(-12 * step));
      }
    }
    if (this.phase !== 'running') this.speed *= Math.exp(-9 * step);
    if (this.phase === 'lifting' && this.elapsed >= 1.6) this.phase = 'done';
    return {
      phase: this.phase,
      lift:
        this.phase === 'done'
          ? 1
          : this.phase === 'lifting'
            ? smooth((this.elapsed - 0.35) / 1.1)
            : 0,
    };
  }
}
