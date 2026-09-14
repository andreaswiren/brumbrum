export const physics = { step: 1 / 60, gravity: -9.81, maxFrameSteps: 5 } as const;
export const bike = {
  mass: 145,
  wheelRadius: 0.36,
  wheelbase: 1.65,
  suspensionLength: 0.26,
  spring: 16000,
  damper: 2100,
  maxSuspensionForce: 9000,
  driveForce: 4000,
  brakeForce: 4600,
  maxSpeed: 100,
  steerRate: 1.05,
  lateralGrip: 7,
  airPitch: 6.5,
  balanceStrength: 24,
  balanceDamping: 8,
  crashTilt: -0.45,
  crashImpactSpeed: 25,
  crashImpulseSpeed: 34,
  crashTiltGrace: 0.28,
  resetGrace: 1.5,
  airLevelStrength: 5,
  landingAssistHeight: 4,
  jumpImpulse: 620,
  resetClearance: 1.2,
} as const;
export const riderConfig = {
  mass: 78,
  linearDamping: 0.14,
  angularDamping: 1.1,
  ejectUpSpeed: 2.3,
  ejectForwardSpeed: 2.5,
} as const;
export const gamepadConfig = {
  deadzone: 0.16,
  triggerDeadzone: 0.04,
  axes: { steer: 0, weight: 1, cameraX: 2, cameraY: 3 },
  buttons: { throttle: 7, brake: 6, rearBrake: 4, preload: 0, camera: 3, reset: 11, help: 9 },
} as const;
export const surfaces = {
  dirt: { grip: 0.92, resistance: 0.2, color: '#b89b70' },
  grass: { grip: 0.78, resistance: 0.18, color: '#78875a' },
  mud: { grip: 0.55, resistance: 1.4, color: '#62503d' },
  sand: { grip: 0.63, resistance: 1.8, color: '#c9b78b' },
  snow: { grip: 0.47, resistance: 0.7, color: '#e7eceb' },
  ice: { grip: 0.12, resistance: 0.08, color: '#aac7d1' },
  asphalt: { grip: 1, resistance: 0.15, color: '#4a4e4c' },
} as const;
export type Surface = keyof typeof surfaces;
export const world = {
  sectorSize: 256,
  nearResolution: 48,
  farResolution: 48,
  radius: 2,
  seed: 731,
  extent: 3000,
} as const;
export const camera = {
  distance: 7.8,
  height: 3.8,
  speedDistance: 0.11,
  smoothing: 5,
  baseFov: 0.95,
} as const;
export const network = { maxPlayers: 6, simulationHz: 30, snapshotHz: 20, version: 1 } as const;
export const graphics = {
  low: { shadows: 0, pixelRatio: 1.5, treeDensity: 0.5 },
  medium: { shadows: 1024, pixelRatio: 1.2, treeDensity: 0.75 },
  high: { shadows: 2048, pixelRatio: 1, treeDensity: 1 },
} as const;
export type GraphicsPreset = keyof typeof graphics;
