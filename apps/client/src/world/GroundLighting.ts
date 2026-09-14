import {
  CascadedShadowGenerator,
  SSAO2RenderingPipeline,
  ShadowGenerator,
  type Camera,
  type DirectionalLight,
  type Scene,
} from '@babylonjs/core';
import type { GraphicsPreset } from '@brumbrum/configuration';

/** Dense near shadows and wider terrain shadows share a stable cascade layout. */
export function createGroundShadows(
  scene: Scene,
  sun: DirectionalLight,
  quality: GraphicsPreset,
): ShadowGenerator {
  const shadows = new CascadedShadowGenerator(quality === 'high' ? 2048 : 1024, sun);
  shadows.numCascades = quality === 'high' ? 3 : 2;
  shadows.shadowMaxZ = quality === 'high' ? 240 : 140;
  shadows.lambda = 0.7;
  shadows.stabilizeCascades = true;
  shadows.cascadeBlendPercentage = 0.12;
  shadows.depthClamp = true;
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality =
    quality === 'high' ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.001;
  shadows.normalBias = 0.045;
  shadows.setDarkness(0);
  scene.shadowsEnabled = quality !== 'low';
  return shadows;
}

/** Geometry-buffer normals include terrain, tyres and rocks, independent of their material. */
export function createGroundOcclusion(
  scene: Scene,
  camera: Camera,
  quality: GraphicsPreset,
): SSAO2RenderingPipeline | undefined {
  if (quality === 'low' || !SSAO2RenderingPipeline.IsSupported) return;
  const ao = new SSAO2RenderingPipeline(
    'ground contact occlusion',
    scene,
    { ssaoRatio: quality === 'high' ? 1 : 0.5, blurRatio: 1 },
    [camera],
    true,
  );
  ao.samples = quality === 'high' ? 16 : 8;
  ao.radius = 2.5;
  ao.totalStrength = 1.25;
  ao.base = 0;
  ao.maxZ = 110;
  ao.minZAspect = 0.3;
  ao.epsilon = 0.005;
  ao.expensiveBlur = true;
  ao.bilateralSamples = 12;
  ao.bilateralSoften = 0.2;
  ao.bilateralTolerance = 0.1;
  return ao;
}
