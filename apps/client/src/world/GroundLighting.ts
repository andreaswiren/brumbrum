import {
  CascadedShadowGenerator,
  SSAO2RenderingPipeline,
  ShadowGenerator,
  type Camera,
  type DirectionalLight,
  type Scene,
} from '@babylonjs/core';
import type { GraphicsPreset } from '@brumbrum/configuration';
import { StableShadowCamera } from './StableShadowCamera';

class StableCascades extends CascadedShadowGenerator {
  private stable?: StableShadowCamera;
  updateCamera(source: Camera): void {
    this.stable ??= new StableShadowCamera(source);
    this.stable.sync(source);
  }
  protected override _getCamera(): Camera | null {
    return this.stable ?? super._getCamera();
  }
  override dispose(): void {
    this.stable?.dispose();
    super.dispose();
  }
}

/** Call after updating the visible camera, before scene shadow rendering. */
export function updateGroundShadows(shadows: ShadowGenerator, camera: Camera): void {
  if (shadows instanceof StableCascades) shadows.updateCamera(camera);
}

/** Dense near shadows and wider terrain shadows share a stable cascade layout. */
export function createGroundShadows(
  scene: Scene,
  sun: DirectionalLight,
  quality: GraphicsPreset,
): ShadowGenerator {
  // Keep registration on the light's default camera. Assigning .camera would
  // recreate the map and make it unavailable to the visible camera's materials.
  const shadows = new StableCascades(quality === 'high' ? 2048 : 1024, sun);
  shadows.numCascades = quality === 'high' ? 4 : 3;
  shadows.shadowMaxZ = quality === 'high' ? 200 : 130;
  shadows.lambda = 0.8;
  shadows.stabilizeCascades = true;
  shadows.cascadeBlendPercentage = 0.2;
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
