import { describe, expect, it } from 'vitest';
import { Quaternion } from '@babylonjs/core';
import type { RealtimePose } from '../../../../packages/protocol/src/realtime';
import { SnapshotInterpolation } from './SnapshotInterpolation';
const pose = (x = 0, yaw = 0): RealtimePose => {
  const rotation = Quaternion.RotationYawPitchRoll(yaw, 0, 0);
  return {
    position: [x, 2, 0],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    velocity: [10, 0, 0],
    kind: 'bike',
    speed: 10,
    steer: 0,
    crashed: false,
    score: 0,
    longestJump: 0,
    resetId: 0,
  };
};

describe('remote snapshot interpolation', () => {
  it('smooths positions on the arrival clock even when server wall time is unrelated', () => {
    const buffer = new SnapshotInterpolation();
    buffer.push(pose(0), 1000, 8_000_000);
    buffer.push(pose(10), 1100, 8_000_050);
    expect(buffer.sample(1150)!.position[0]).toBeCloseTo(5);
    expect(buffer.sample(1050)!.position[0]).toBe(0);
  });
  it('takes the short rotation path through 180 degrees', () => {
    const buffer = new SnapshotInterpolation();
    buffer.push(pose(0, (170 * Math.PI) / 180), 1000, 1000);
    buffer.push(pose(0, (-170 * Math.PI) / 180), 1100, 1100);
    const rotation = Quaternion.FromArray(buffer.sample(1150)!.rotation);
    expect(Math.abs(rotation.w)).toBeLessThan(0.001);
    expect(rotation.length()).toBeCloseTo(1);
  });
  it('caps extrapolation and rejects stale packets without rewinding', () => {
    const buffer = new SnapshotInterpolation();
    buffer.push(pose(10), 1000, 1000);
    expect(buffer.push(pose(-30), 1020, 990)).toBe(false);
    expect(buffer.sample(10000)!.position[0]).toBeCloseTo(11.5);
  });
  it('snaps respawns and vehicle changes rather than moving across the map', () => {
    const buffer = new SnapshotInterpolation();
    buffer.push(pose(), 1000, 1000);
    buffer.push({ ...pose(70), resetId: 1 }, 1050, 1050);
    expect(buffer.sample(1050)!.position[0]).toBe(70);
    buffer.push({ ...pose(-20), kind: 'atv', resetId: 1 }, 1100, 1100);
    expect(buffer.sample(1100)!.kind).toBe('atv');
    expect(buffer.sample(1100)!.position[0]).toBe(-20);
  });
});
