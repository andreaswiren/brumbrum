import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene } from '@babylonjs/core';
import type { RealtimePlayer } from '../../../../packages/protocol/src/realtime';
import { RemotePlayers } from './RemotePlayers';

const player = (id: string, kind: RealtimePlayer['pose']['kind'] = 'bike'): RealtimePlayer => ({
  id,
  name: id,
  pose: {
    position: [0, 2, 12],
    rotation: [0, 0, 0, 1],
    velocity: [0, 0, 10],
    kind,
    steer: 0.5,
    speed: 10,
    crashed: false,
    score: 0,
    longestJump: 0,
    resetId: 0,
  },
});
describe('remote rendering lifecycle', () => {
  let engine: NullEngine, scene: Scene, remotes: RemotePlayers;
  afterEach(() => {
    remotes?.dispose();
    scene?.dispose();
    engine?.dispose();
    vi.restoreAllMocks();
  });
  function create() {
    engine = new NullEngine();
    scene = new Scene(engine);
    remotes = new RemotePlayers(
      scene,
      () => {},
      async () => {},
    );
  }
  it('renders all vehicle kinds without creating physics bodies or the local rider', () => {
    create();
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    remotes.receive(
      [
        player('self'),
        player('bike'),
        player('quad', 'atv'),
        player('truck', 'monster'),
        player('snow', 'snowmobile'),
      ],
      'self',
      5000,
    );
    remotes.update(1000);
    remotes.update(1050);
    expect(remotes.count).toBe(4);
    expect(scene.getPhysicsEngine()).toBeNull();
    expect(scene.meshes.every((mesh) => !mesh.physicsBody)).toBe(true);
    expect(scene.getTransformNodeByName('wheel axle rotation')!.rotation.x).not.toBe(0);
    remotes.clear();
    expect(remotes.count).toBe(0);
    expect(scene.meshes.length).toBe(0);
  });
  it('replaces switched vehicles, removes departed players and ignores old snapshots', () => {
    create();
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    remotes.receive([player('friend')], 'self', 1000);
    remotes.receive([player('friend', 'atv')], 'self', 1100);
    expect(remotes.count).toBe(1);
    remotes.receive([player('friend', 'monster')], 'self', 1050);
    expect(scene.getMeshByName('monster rigid body')).toBeNull();
    remotes.receive([], 'self', 1200);
    expect(remotes.count).toBe(0);
    expect(scene.meshes.length).toBe(0);
  });
  it('shows a cosmetic remote bail without simulating collision bodies, then resets cleanly', () => {
    create();
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const friend = player('friend');
    friend.pose.crashed = true;
    remotes.receive([friend], 'self', 1000);
    remotes.update(1100);
    remotes.update(1150);
    const rider = scene.getTransformNodeByName('articulated motocross rider')!;
    expect(rider.parent).toBeNull();
    expect(scene.getPhysicsEngine()).toBeNull();
    friend.pose.crashed = false;
    friend.pose.resetId++;
    remotes.receive([friend], 'self', 1200);
    remotes.update(1250);
    expect(rider.parent).not.toBeNull();
    remotes.clear();
    expect(scene.meshes.length).toBe(0);
  });
});
