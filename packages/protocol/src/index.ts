import type { WorldPosition } from '@brumbrum/world-format';
export type VehicleKind = 'motorcycle' | 'atv' | 'monster-truck' | 'snowmobile';
export interface InputCommand {
  sequence: number;
  tick: number;
  throttle: number;
  brake: number;
  steer: number;
  pitch: number;
  preload: boolean;
}
export interface VehicleState {
  playerId: string;
  kind: VehicleKind;
  tick: number;
  position: WorldPosition;
  rotation: [number, number, number, number];
  velocity: WorldPosition;
  angularVelocity: WorldPosition;
  grounded: boolean;
}
export interface CrashEvent {
  type: 'crash';
  playerId: string;
  tick: number;
  position: WorldPosition;
  velocity: WorldPosition;
  angularVelocity: WorldPosition;
  impactImpulse: number;
  ragdollSeed: number;
}
export interface RespawnEvent {
  type: 'respawn';
  playerId: string;
  tick: number;
  position: WorldPosition;
}
export interface RaceEvent {
  type: 'checkpoint';
  playerId: string;
  raceId: string;
  checkpoint: number;
  tick: number;
}
export interface TrickEvent {
  type: 'trick';
  playerId: string;
  tick: number;
  rotations: WorldPosition;
  airtime: number;
  landingQuality: number;
}
export interface SessionState {
  version: 1;
  tick: number;
  players: VehicleState[];
}
/** Server-derived arena results. Never accept a client's claimed distance as authoritative. */
export interface ArenaRunResult {
  playerId: string;
  vehicle: VehicleKind;
  score: number;
  longestJumpMetres: number;
  elapsedSeconds: number;
}
export interface ArenaLeaderboardEvent {
  type: 'arena-leaderboard';
  tick: number;
  runs: ArenaRunResult[];
}
// Future Colyseus room validates inputs and derives scores; no client score packet exists.
export type ServerEvent =
  CrashEvent | RespawnEvent | RaceEvent | TrickEvent | ArenaLeaderboardEvent;
