import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { riderAnatomy as anatomy } from './RiderAnatomy';
import { RiderMotion, bendLimb, ridingContacts, ridingLeg, type RidingStance } from './RiderMotion';

describe('rider movement contract', () => {
  it('keeps both arms and legs at their authored lengths through every riding stance', () => {
    for (const stance of ['bike', 'atv', 'monster', 'snowmobile'] as RidingStance[]) {
      for (const steer of [-1, 0, 1])
        for (const weight of [-1, 0, 1])
          for (const preload of [0, 1]) {
            const motion = new RiderMotion();
            motion.stance = stance;
            const { chest, hip, neck } = motion.update(steer, 30, 1, 0, 0.18, 2, preload, weight);
            expect(Vector3.Distance(hip, neck)).toBeCloseTo(anatomy.torso, 3);
            for (const side of [-1, 1]) {
              const { hand } = ridingContacts(stance, side);
              const shoulder = chest.add(new Vector3(side * anatomy.shoulderHalfWidth, 0, 0));
              const elbow = bendLimb(
                shoulder,
                hand,
                anatomy.upperArm,
                anatomy.forearm,
                new Vector3(side, 0.3, -0.1),
              );
              expect(Vector3.Distance(shoulder, elbow)).toBeCloseTo(anatomy.upperArm, 5);
              expect(Vector3.Distance(elbow, hand)).toBeCloseTo(anatomy.forearm, 5);
              const { hipJoint, knee, foot } = ridingLeg(stance, hip, side);
              expect(Vector3.Distance(hipJoint, knee)).toBeCloseTo(anatomy.thigh, 5);
              expect(Vector3.Distance(knee, foot)).toBeCloseTo(anatomy.shin, 5);
            }
          }
    }
  });

  it('keeps the motocross thighs and boots outside the saddle, shrouds and side panels', () => {
    for (const steer of [-1, 0, 1])
      for (const weight of [-1, 0, 1])
        for (const preload of [0, 1]) {
          const motion = new RiderMotion();
          const { hip } = motion.update(steer, 30, 1, 0, 0.3, 2, preload, weight);
          // Human pelvis remains supported above the narrow saddle while the torso compresses.
          expect(hip.y).toBeGreaterThanOrEqual(0.6 - 0.00001);
          for (const side of [-1, 1]) {
            const { hipJoint, knee, foot } = ridingLeg('bike', hip, side);
            expect(side * knee.x).toBeGreaterThan(0.32);
            expect(side * foot.x).toBe(0.33);
            for (const [a, b, radius] of [
              [hipJoint, knee, 0.085],
              [knee, foot, 0.07],
            ] as const) {
              for (let i = 0; i <= 20; i++) {
                const point = Vector3.Lerp(a, b, i / 20),
                  innerEdge = side * point.x - radius;
                if (point.y < 0.5 && point.y > 0.35) expect(innerEdge).toBeGreaterThan(0.128);
                if (point.y < 0.37 && point.z > -0.05)
                  expect(innerEdge).toBeGreaterThan(point.z > 0.12 ? 0.256 : 0.232);
                if (point.y < 0.35 && point.z < -0.21) expect(innerEdge).toBeGreaterThan(0.2272);
                if (point.y < 0.26) expect(innerEdge).toBeGreaterThan(0.22);
              }
            }
          }
        }
  });

  it('blends weight transfer consistently at 30 and 120 updates per second', () => {
    const simulate = (rate: number) => {
      const motion = new RiderMotion();
      let pose = motion.update(0, 0, 0, 0, 0, 0);
      for (let i = 0; i < rate; i++) pose = motion.update(0.8, 20, 1, 0, 0.1, 1 / rate, 0.7, 1);
      return pose;
    };
    const low = simulate(30),
      high = simulate(120);
    expect(Vector3.Distance(low.hip, high.hip)).toBeLessThan(0.0001);
    expect(Vector3.Distance(low.neck, high.neck)).toBeLessThan(0.0001);
  });

  it('absorbs a touchdown then extends again without contact flicker jolting the rider', () => {
    const motion = new RiderMotion();
    const neutral = motion.update(0, 20, 0, 0, 0, 1);
    for (let i = 0; i < 60; i++) motion.update(0, 20, 0, 0, 0, 1 / 60, 0, 0, false);
    let landing = motion.update(0, 20, 0, 0, 0, 1 / 60, 0, 0, true);
    for (let i = 0; i < 8; i++) landing = motion.update(0, 20, 0, 0, 0, 1 / 60);
    expect(landing.neck.y).toBeLessThan(neutral.neck.y - 0.009);
    for (let i = 0; i < 180; i++) landing = motion.update(0, 20, 0, 0, 0, 1 / 60);
    expect(landing.neck.y).toBeCloseTo(neutral.neck.y, 3);
    const beforeFlicker = landing.neck.clone();
    motion.update(0, 20, 0, 0, 0, 1 / 60, 0, 0, false);
    const flicker = motion.update(0, 20, 0, 0, 0, 1 / 60, 0, 0, true);
    expect(Vector3.Distance(beforeFlicker, flicker.neck)).toBeLessThan(0.001);
  });
});
