import {
  ColorCurves,
  DefaultRenderingPipeline,
  DepthOfFieldEffectBlurLevel,
  ImageProcessingConfiguration,
  type Camera,
  type Scene,
} from '@babylonjs/core';
import type { VisualSettings } from './VisualSettings';

export class GraphicsPipeline {
  private pipeline: DefaultRenderingPipeline;
  private curves = new ColorCurves();
  constructor(
    private scene: Scene,
    camera: Camera,
  ) {
    this.pipeline = new DefaultRenderingPipeline(
      'freeride finishing',
      true,
      scene,
      [camera],
      false,
    );
    scene.imageProcessingConfiguration.colorCurves = this.curves;
    scene.imageProcessingConfiguration.colorCurvesEnabled = true;
    this.pipeline.bloomThreshold = 0.85;
    this.pipeline.bloomKernel = 48;
    this.pipeline.sharpen.colorAmount = 1;
    this.pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Medium;
    // A chase camera focuses several metres away. A 50 mm lens produced an
    // imperceptible circle of confusion at that distance, even at maximum.
    this.pipeline.depthOfField.focalLength = 120;
    this.pipeline.depthOfField.lensSize = 120;
  }
  apply(settings: VisualSettings): void {
    const pipeline = this.pipeline,
      image = this.scene.imageProcessingConfiguration;
    pipeline.samples = Math.min(settings.msaa, this.scene.getEngine().getCaps().maxMSAASamples);
    pipeline.fxaaEnabled = settings.fxaa;
    pipeline.bloomEnabled = settings.bloom > 0.001;
    pipeline.bloomWeight = settings.bloom;
    pipeline.sharpenEnabled = settings.sharpness > 0.001;
    pipeline.sharpen.edgeAmount = settings.sharpness;
    pipeline.depthOfFieldEnabled = settings.depthOfField > 0.001;
    pipeline.depthOfField.fStop = 4 - settings.depthOfField * 3.3;
    image.exposure = settings.exposure;
    image.contrast = settings.contrast;
    image.toneMappingEnabled = true;
    image.toneMappingType =
      settings.style === 'filmic'
        ? ImageProcessingConfiguration.TONEMAPPING_ACES
        : ImageProcessingConfiguration.TONEMAPPING_STANDARD;
    image.vignetteEnabled = settings.vignette > 0.001;
    image.vignetteWeight = settings.vignette * 3;
    this.curves.globalSaturation = settings.saturation;
    this.scene.fogDensity = settings.atmosphere * 0.00085;
    // Build once, after AO has been attached: color finishing and DOF must
    // always follow contact shading, including when quality is changed.
    pipeline.prepare();
  }
  focus(distance: number): void {
    this.pipeline.depthOfField.focusDistance = Math.max(2, distance) * 1000;
  }
}
