/** Development relay protocol. Poses and records are client-reported, not authoritative competition results. */
export type RealtimeVehicleKind = 'bike' | 'atv' | 'monster' | 'snowmobile';
export type RealtimeVector3 = [number, number, number];
export interface RealtimePose {
  position: RealtimeVector3;
  rotation: [number, number, number, number];
  velocity: RealtimeVector3;
  kind: RealtimeVehicleKind;
  steer: number;
  speed: number;
  crashed: boolean;
  score: number;
  longestJump: number;
  resetId: number;
}
export interface RealtimeMember {
  id: string;
  name: string;
}
export interface RealtimePlayer extends RealtimeMember {
  pose: RealtimePose;
}
export interface RealtimeRecord extends RealtimeMember {
  score: number;
  longestJump: number;
}
export type RealtimeClientMessage =
  | { type: 'join'; name: string; room?: string }
  | { type: 'state'; sequence: number; pose: RealtimePose }
  | { type: 'record'; kind: 'score' | 'jump'; value: number };
export type RealtimeErrorCode =
  | 'invalid-message'
  | 'join-required'
  | 'already-joined'
  | 'room-not-found'
  | 'room-full'
  | 'rate-limit'
  | 'server-full';
export type RealtimeServerMessage =
  | { type: 'welcome'; id: string; room: string }
  | { type: 'room'; members: RealtimeMember[] }
  | { type: 'snapshot'; time: number; players: RealtimePlayer[]; records: RealtimeRecord[] }
  | { type: 'error'; code: RealtimeErrorCode; message: string };

export const REALTIME_LIMITS = {
  playersPerRoom: 6,
  snapshotHz: 20,
  messageBytes: 4096,
  messagesPerSecond: 60,
  nameLength: 32,
  maxScore: 1_000_000_000,
  maxJump: 50_000,
} as const;
export const ROOM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const vector = (value: unknown, size: number, max: number): value is number[] =>
  Array.isArray(value) &&
  value.length === size &&
  value.every((component) => number(component, -max, max));

/** Validate and copy only known fields so relayed packets cannot carry arbitrary client data. */
export function parseRealtimeMessage(value: unknown): RealtimeClientMessage | null {
  if (!object(value)) return null;
  if (value.type === 'join') {
    if (typeof value.name !== 'string') return null;
    const name = value.name.trim();
    if (!name || name.length > REALTIME_LIMITS.nameLength || /[\u0000-\u001f\u007f]/.test(name))
      return null;
    if (
      value.room !== undefined &&
      (typeof value.room !== 'string' || !ROOM_TOKEN_PATTERN.test(value.room))
    )
      return null;
    return { type: 'join', name, ...(typeof value.room === 'string' ? { room: value.room } : {}) };
  }
  if (value.type === 'record') {
    if (value.kind !== 'score' && value.kind !== 'jump') return null;
    if (
      !number(
        value.value,
        0,
        value.kind === 'score' ? REALTIME_LIMITS.maxScore : REALTIME_LIMITS.maxJump,
      )
    )
      return null;
    return { type: 'record', kind: value.kind, value: value.value };
  }
  if (
    value.type !== 'state' ||
    !Number.isSafeInteger(value.sequence) ||
    !number(value.sequence, 0, Number.MAX_SAFE_INTEGER) ||
    !object(value.pose)
  )
    return null;
  const p = value.pose;
  if (
    !vector(p.position, 3, 100_000) ||
    !vector(p.rotation, 4, 1.5) ||
    !vector(p.velocity, 3, 1000)
  )
    return null;
  if (p.position[1] < -2000 || p.position[1] > 30_000) return null;
  const rotationLength = Math.hypot(...p.rotation);
  if (rotationLength < 0.5 || rotationLength > 1.5) return null;
  if (!['bike', 'atv', 'monster', 'snowmobile'].includes(String(p.kind))) return null;
  if (!number(p.steer, -1, 1) || !number(p.speed, 0, 500) || typeof p.crashed !== 'boolean')
    return null;
  if (
    !number(p.score, 0, REALTIME_LIMITS.maxScore) ||
    !number(p.longestJump, 0, REALTIME_LIMITS.maxJump) ||
    !number(p.resetId, 0, 2_147_483_647) ||
    !Number.isInteger(p.resetId)
  )
    return null;
  return {
    type: 'state',
    sequence: value.sequence,
    pose: {
      position: [...p.position] as RealtimeVector3,
      rotation: p.rotation.map(
        (component) => component / rotationLength,
      ) as RealtimePose['rotation'],
      velocity: [...p.velocity] as RealtimeVector3,
      kind: p.kind as RealtimeVehicleKind,
      steer: p.steer,
      speed: p.speed,
      crashed: p.crashed,
      score: p.score,
      longestJump: p.longestJump,
      resetId: p.resetId,
    },
  };
}
