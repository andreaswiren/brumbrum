import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket, type ClientOptions } from 'ws';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRoomServer } from './server';
import {
  parseRealtimeMessage,
  type RealtimePose,
  type RealtimeServerMessage,
} from '../../../packages/protocol/src/realtime';

class Inbox {
  readonly messages: RealtimeServerMessage[] = [];
  private waiters: (() => void)[] = [];
  constructor(readonly socket: WebSocket) {
    socket.on('message', (bytes) => {
      this.messages.push(JSON.parse(bytes.toString()));
      [...this.waiters].forEach((check) => check());
    });
    socket.on('error', () => {});
  }
  send(value: unknown) {
    this.socket.send(JSON.stringify(value));
  }
  wait<T extends RealtimeServerMessage['type']>(
    type: T,
    predicate: (message: Extract<RealtimeServerMessage, { type: T }>) => boolean = () => true,
  ): Promise<Extract<RealtimeServerMessage, { type: T }>> {
    return new Promise((resolveMessage, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${type}`));
      }, 1800);
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((waiter) => waiter !== check);
      };
      const check = () => {
        const index = this.messages.findIndex(
          (message) =>
            message.type === type &&
            predicate(message as Extract<RealtimeServerMessage, { type: T }>),
        );
        if (index >= 0) {
          const message = this.messages.splice(index, 1)[0];
          cleanup();
          resolveMessage(message as Extract<RealtimeServerMessage, { type: T }>);
        }
      };
      this.waiters.push(check);
      check();
    });
  }
}
const pose: RealtimePose = {
  position: [0, 1, 12],
  rotation: [0, 0, 0, 1],
  velocity: [0, 0, 20],
  kind: 'bike',
  steer: 0.2,
  speed: 20,
  crashed: false,
  score: 1400,
  longestJump: 45.5,
  resetId: 0,
};
const closed = (socket: WebSocket) =>
  socket.readyState === WebSocket.CLOSED
    ? Promise.resolve(1000)
    : new Promise<number>((resolveCode) => socket.once('close', (code) => resolveCode(code)));

describe('WebSocket invitation room relay', () => {
  let server: ReturnType<typeof createRoomServer>, address: string, temp: string;
  beforeEach(async () => {
    temp = await mkdtemp(join(tmpdir(), 'brumbrum-room-'));
    await writeFile(join(temp, 'index.html'), '<!doctype html><title>Brumbrum test</title>');
    await writeFile(join(temp, 'asset.js'), 'export const game = true;');
    server = createRoomServer({ clientDirectory: temp, heartbeatMs: 80, joinTimeoutMs: 350 });
    const port = await server.listen(0, '127.0.0.1');
    address = `ws://127.0.0.1:${port}/multiplayer`;
  });
  afterEach(async () => {
    await server.close();
    if (basename(temp).startsWith('brumbrum-room-') && dirname(resolve(temp)) === resolve(tmpdir()))
      await rm(temp, { recursive: true, force: true });
  });
  async function connect(options?: ClientOptions) {
    const socket = options ? new WebSocket(address, options) : new WebSocket(address),
      inbox = new Inbox(socket);
    await new Promise<void>((resolveOpen, reject) => {
      socket.once('open', resolveOpen);
      socket.once('error', reject);
    });
    return inbox;
  }
  async function joinRoom(name: string, room?: string) {
    const client = await connect();
    client.send({ type: 'join', name, ...(room ? { room } : {}) });
    const welcome = await client.wait('welcome');
    return { client, welcome };
  }

  it('creates an invitation room, joins a second client and relays poses and records at 20 Hz', async () => {
    const a = await joinRoom('Alice'),
      b = await joinRoom('Bob', a.welcome.room);
    expect(a.welcome.room).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(b.welcome.room).toBe(a.welcome.room);
    expect(a.welcome.id).not.toBe(b.welcome.id);
    const room = await a.client.wait('room', (message) => message.members.length === 2);
    expect(room.members.map((member) => member.name)).toEqual(['Alice', 'Bob']);
    a.client.send({ type: 'state', sequence: 1, pose });
    const snapshot = await b.client.wait('snapshot', (message) =>
      message.players.some((player) => player.id === a.welcome.id),
    );
    expect(snapshot.players[0].pose).toEqual(pose);
    expect(snapshot.records.find((record) => record.id === a.welcome.id)).toMatchObject({
      score: 1400,
      longestJump: 45.5,
    });
    a.client.send({ type: 'state', sequence: 2, pose: { ...pose, score: 10, longestJump: 5 } });
    a.client.send({ type: 'record', kind: 'jump', value: 90 });
    const maxima = await b.client.wait('snapshot', (message) =>
      message.records.some((record) => record.longestJump === 90),
    );
    expect(maxima.records.find((record) => record.id === a.welcome.id)).toMatchObject({
      score: 1400,
      longestJump: 90,
    });
    const next = await b.client.wait('snapshot', (message) => message.time > maxima.time);
    expect(next.time - maxima.time).toBeGreaterThanOrEqual(35);
    expect(next.time - maxima.time).toBeLessThan(150);
  });
  it('keeps rooms isolated, ignores stale sequences and removes disconnected riders', async () => {
    const a = await joinRoom('Alice'),
      b = await joinRoom('Bob', a.welcome.room),
      outside = await joinRoom('Separate room');
    a.client.send({ type: 'state', sequence: 2, pose: { ...pose, position: [42, 1, 12] } });
    a.client.send({ type: 'state', sequence: 1, pose: { ...pose, position: [999, 1, 12] } });
    const snapshot = await b.client.wait('snapshot', (message) => message.players.length === 1);
    expect(snapshot.players[0].pose.position[0]).toBe(42);
    expect((await outside.client.wait('snapshot')).players).toEqual([]);
    const closing = closed(a.client.socket);
    a.client.socket.terminate();
    await closing;
    const remaining = await b.client.wait('room', (message) => message.members.length === 1);
    expect(remaining.members[0].name).toBe('Bob');
    const noGhost = await b.client.wait('snapshot', (message) => message.players.length === 0);
    expect(noGhost.players).toEqual([]);
  });
  it('enforces the six-player limit and rejects unknown invitation tokens', async () => {
    const owner = await joinRoom('Host');
    for (let i = 1; i < 6; i++) await joinRoom(`Rider ${i}`, owner.welcome.room);
    const seventh = await connect();
    seventh.send({ type: 'join', name: 'Seventh', room: owner.welcome.room });
    expect((await seventh.wait('error')).code).toBe('room-full');
    const invalid = await connect();
    invalid.send({ type: 'join', name: 'Lost', room: 'abcdefghijklmnopqrstuvwx' });
    expect((await invalid.wait('error')).code).toBe('room-not-found');
    expect(server.stats().rooms).toBe(1);
  });
  it('rejects invalid poses, oversized packets and state flooding', async () => {
    const bad = await joinRoom('Bad pose');
    bad.client.send({ type: 'state', sequence: 1, pose: { ...pose, position: [Infinity, 0, 0] } });
    expect((await bad.client.wait('error')).code).toBe('invalid-message');
    const large = await joinRoom('Oversized'),
      largeClosed = closed(large.client.socket);
    large.client.socket.send('x'.repeat(5000));
    expect(await largeClosed).toBe(1009);
    const spam = await joinRoom('Too fast');
    for (let i = 0; i < 95; i++) spam.client.send({ type: 'state', sequence: i, pose });
    expect((await spam.client.wait('error')).code).toBe('rate-limit');
  });
  it('cleans up unjoined and unresponsive connections', async () => {
    const unjoined = await connect();
    expect(await closed(unjoined.socket)).toBe(1008);
    const silent = await connect({ autoPong: false });
    silent.send({ type: 'join', name: 'Silent' });
    await silent.wait('welcome');
    const silentClosed = closed(silent.socket);
    await silentClosed;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    expect(server.stats()).toEqual({ rooms: 0, clients: 0 });
  });
  it('serves the built game and exposes only IPv4 network addresses', async () => {
    const origin = address.replace('ws:', 'http:').replace('/multiplayer', '');
    const page = await fetch(origin + '/?room=abcdefghijklmnopqrstuvwx');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Brumbrum test');
    const asset = await fetch(origin + '/asset.js');
    expect(asset.headers.get('content-type')).toContain('javascript');
    expect(await asset.text()).toContain('game = true');
    const network = await (await fetch(origin + '/api/network')).json();
    expect(Object.keys(network)).toEqual(['addresses']);
    expect(network.addresses.every((value: string) => /^\d+\.\d+\.\d+\.\d+$/.test(value))).toBe(
      true,
    );
    expect((await fetch(origin + '/%2e%2e%2fpackage.json')).status).toBe(404);
    expect((await fetch(origin + '/.env')).status).toBe(404);
  });
});

describe('realtime packet validation', () => {
  it('normalizes valid rotations and strips fields outside the pose contract', () => {
    const result = parseRealtimeMessage({
      type: 'state',
      sequence: 3,
      pose: { ...pose, rotation: [0, 0, 0, 1.2], extra: 'not relayed' },
    });
    expect(result?.type).toBe('state');
    if (result?.type !== 'state') return;
    expect(result.pose.rotation).toEqual([0, 0, 0, 1]);
    expect(result.pose).not.toHaveProperty('extra');
  });
  it('rejects dangerous or malformed numeric shapes and oversized names', () => {
    for (const invalid of [
      { ...pose, rotation: [0, 0, 0, 0] },
      { ...pose, position: [1, 2] },
      { ...pose, velocity: [NaN, 0, 0] },
      { ...pose, speed: -5 },
      { ...pose, resetId: 0.5 },
      { ...pose, kind: 'plane' },
    ])
      expect(parseRealtimeMessage({ type: 'state', sequence: 1, pose: invalid })).toBeNull();
    expect(parseRealtimeMessage({ type: 'join', name: 'a'.repeat(33) })).toBeNull();
    expect(parseRealtimeMessage({ type: 'join', name: 'bad\nname' })).toBeNull();
  });
});
