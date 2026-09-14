import { Quaternion } from '@babylonjs/core';
import type { RealtimePose } from '../../../../packages/protocol/src/realtime';

interface Frame {
  arrival: number;
  serverTime: number;
  pose: RealtimePose;
}
const copy = (pose: RealtimePose): RealtimePose => ({
  ...pose,
  position: [...pose.position],
  rotation: [...pose.rotation],
  velocity: [...pose.velocity],
});

/** Arrival-clock interpolation avoids assuming the browsers share a wall clock. */
export class SnapshotInterpolation {
  private frames: Frame[] = [];
  constructor(
    readonly delay = 100,
    readonly maxExtrapolation = 150,
  ) {}
  get latest(): RealtimePose | undefined {
    return this.frames.at(-1)?.pose;
  }

  push(pose: RealtimePose, arrival: number, serverTime: number): boolean {
    if (
      ![
        ...pose.position,
        ...pose.rotation,
        ...pose.velocity,
        arrival,
        serverTime,
        pose.speed,
        pose.steer,
      ].every(Number.isFinite)
    )
      return false;
    const last = this.frames.at(-1);
    if (last && serverTime <= last.serverTime) return false;
    const distance = last
      ? Math.hypot(...pose.position.map((value, index) => value - last.pose.position[index]))
      : 0;
    if (
      last &&
      (pose.resetId !== last.pose.resetId ||
        pose.kind !== last.pose.kind ||
        distance > 100 ||
        arrival - last.arrival > 1000)
    )
      this.frames = [];
    this.frames.push({ pose: copy(pose), arrival, serverTime });
    if (this.frames.length > 24) this.frames.shift();
    return true;
  }

  sample(now: number): RealtimePose | undefined {
    if (!this.frames.length) return undefined;
    const target = now - this.delay;
    if (target <= this.frames[0].arrival) return copy(this.frames[0].pose);
    for (let index = 1; index < this.frames.length; index++) {
      const before = this.frames[index - 1],
        after = this.frames[index];
      if (target > after.arrival) continue;
      const t = Math.max(
        0,
        Math.min(1, (target - before.arrival) / Math.max(1, after.arrival - before.arrival)),
      );
      const result = copy(t < 0.5 ? before.pose : after.pose);
      for (let axis = 0; axis < 3; axis++) {
        result.position[axis] =
          before.pose.position[axis] + (after.pose.position[axis] - before.pose.position[axis]) * t;
        result.velocity[axis] =
          before.pose.velocity[axis] + (after.pose.velocity[axis] - before.pose.velocity[axis]) * t;
      }
      const rotation = Quaternion.Slerp(
        Quaternion.FromArray(before.pose.rotation),
        Quaternion.FromArray(after.pose.rotation),
        t,
      ).normalize();
      result.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
      result.steer = before.pose.steer + (after.pose.steer - before.pose.steer) * t;
      result.speed = before.pose.speed + (after.pose.speed - before.pose.speed) * t;
      return result;
    }
    const last = this.frames.at(-1)!,
      result = copy(last.pose);
    const seconds = Math.min(this.maxExtrapolation, Math.max(0, target - last.arrival)) / 1000;
    for (let axis = 0; axis < 3; axis++) result.position[axis] += result.velocity[axis] * seconds;
    return result;
  }
}
