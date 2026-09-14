import { bike } from '@brumbrum/configuration';
import { createBikeVisual } from './BikeVisual';
import { createFourWheelVisual, vehicleVisualDimensions, type VehicleKind } from './VehicleModels';
import { createSnowmobileVisual, snowmobileDimensions } from './SnowmobileVisual';
import type { Scene } from '@babylonjs/core';
export type VehicleTuning = { [K in keyof typeof bike]: number };
export function vehicleSetup(scene: Scene, kind: VehicleKind) {
  const visual =
    kind === 'bike'
      ? createBikeVisual(scene)
      : kind === 'snowmobile'
        ? createSnowmobileVisual(scene)
        : createFourWheelVisual(scene, kind);
  const dimensions =
    kind === 'bike'
      ? {
          wheelbase: bike.wheelbase,
          wheelRadius: bike.wheelRadius,
          suspensionLength: bike.suspensionLength,
          mass: bike.mass,
          chassisWidth: 0.4,
          chassisHeight: 0.38,
          chassisLength: 1.2,
          inertia: [65, 95, 42],
        }
      : kind === 'snowmobile'
        ? snowmobileDimensions
        : vehicleVisualDimensions[kind];
  const ratio = dimensions.mass / bike.mass,
    springRatio = (ratio * 2) / visual.wheels.length;
  const tuning: VehicleTuning = {
    ...bike,
    ...dimensions,
    driveForce: bike.driveForce * ratio * (kind === 'monster' ? 0.9 : 1),
    brakeForce: bike.brakeForce * ratio,
    spring: bike.spring * springRatio,
    damper: bike.damper * springRatio,
    maxSuspensionForce: bike.maxSuspensionForce * springRatio,
    jumpImpulse: bike.jumpImpulse * ratio,
    resetClearance: dimensions.suspensionLength + dimensions.wheelRadius + 0.25,
    steerRate: kind === 'monster' ? 0.7 : bike.steerRate,
    maxSpeed:
      kind === 'monster' ? 70 : kind === 'atv' ? 80 : kind === 'snowmobile' ? 110 : bike.maxSpeed,
  };
  return { visual, dimensions, tuning };
}
