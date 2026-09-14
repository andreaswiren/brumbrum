import HavokPhysics from '@babylonjs/havok';
import havokWasm from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  HavokPlugin,
  Scene,
  ShadowGenerator,
  Vector3,
  WebGPUEngine,
  type AbstractEngine,
} from '@babylonjs/core';
import { graphics, physics, type GraphicsPreset } from '@brumbrum/configuration';
import { TerrainWorld } from '../world/TerrainWorld';
import { Motorcycle } from '../vehicles/Motorcycle';
import { InputManager } from '../input/InputManager';
import { ChaseCamera } from '../camera/ChaseCamera';
import { Hud } from '../ui/Hud';
import { EngineAudio } from '../audio/EngineAudio';
export async function startGame(canvas: HTMLCanvasElement): Promise<void> {
  let engine: AbstractEngine;
  let renderer = 'WEBGL2';
  try {
    if (new URLSearchParams(location.search).get('renderer') === 'webgl2')
      throw new Error('WebGL2 requested');
    if (!(await WebGPUEngine.IsSupportedAsync)) throw new Error('WebGPU unavailable');
    const gpu = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: false });
    try {
      await gpu.initAsync();
    } catch (error) {
      gpu.dispose();
      throw error;
    }
    engine = gpu;
    renderer = 'WEBGPU';
  } catch {
    engine = new Engine(canvas, true, { stencil: true, adaptToDeviceRatio: false });
  }
  // Bound catch-up after stalls; normal frames still use fixed 60 Hz substeps.
  Scene.MaxDeltaTime = physics.step * physics.maxFrameSteps * 1000;
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.65, 0.76, 0.78, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0021;
  scene.fogColor = new Color3(0.65, 0.76, 0.76);
  scene.imageProcessingConfiguration.exposure = 1.12;
  scene.imageProcessingConfiguration.contrast = 1.15;
  const hemi = new HemisphericLight('sky fill', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.85;
  hemi.groundColor = new Color3(0.27, 0.29, 0.19);
  const sun = new DirectionalLight('afternoon sun', new Vector3(-0.55, -0.8, 0.45), scene);
  sun.intensity = 2.0;
  sun.diffuse = new Color3(1, 0.9, 0.71);
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -65;
  sun.orthoRight = 65;
  sun.orthoTop = 65;
  sun.orthoBottom = -65;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 180;
  let shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.001;
  shadows.normalBias = 0.03;
  const input = new InputManager(),
    audio = new EngineAudio();
  let vehicle: Motorcycle, world: TerrainWorld, camera: ChaseCamera;
  let wireframe = false;
  const hud = new Hud(renderer, {
    reset: () => vehicle?.reset(),
    camera: () => camera?.cycle(),
    sound: () => {
      void audio.toggle().then(() => hud.sound(audio.enabled));
    },
    debug: () => {
      hud.debug = !hud.debug;
      vehicle?.setDebug(hud.debug);
    },
    quality: (v) => {
      const preset = graphics[v as GraphicsPreset];
      if (!preset) return;
      engine.setHardwareScalingLevel(preset.pixelRatio);
      shadows.dispose();
      shadows = new ShadowGenerator(Math.max(256, preset.shadows), sun);
      shadows.usePercentageCloserFiltering = true;
      if (preset.shadows) {
        vehicle?.visual.meshes.forEach((m) => shadows.addShadowCaster(m));
        scene.meshes
          .filter(
            (m) =>
              m.name.startsWith('pine batch') ||
              m.name === 'trunk batch' ||
              m.name === 'granite outcrop',
          )
          .forEach((m) => shadows.addShadowCaster(m));
      }
    },
  });
  const havok = await HavokPhysics({ locateFile: () => havokWasm });
  scene.enablePhysics(new Vector3(0, physics.gravity, 0), new HavokPlugin(true, havok));
  scene.getPhysicsEngine()!.setTimeStep(physics.step);
  scene.getPhysicsEngine()!.setSubTimeStep(physics.step * 1000);
  world = new TerrainWorld(scene, (mesh) => shadows.addShadowCaster(mesh));
  vehicle = new Motorcycle(scene);
  camera = new ChaseCamera(scene, vehicle);
  vehicle.visual.meshes.forEach((m) => shadows.addShadowCaster(m));
  scene.onBeforePhysicsObservable.add(() => {
    vehicle.step(input.actions);
  });
  hud.ready();
  engine.runRenderLoop(() => {
    if (document.hidden) return;
    const dt = Math.min(engine.getDeltaTime() / 1000, physics.step * physics.maxFrameSteps);
    input.update();
    if (input.consume('KeyR')) vehicle.reset();
    if (input.consume('Home')) vehicle.reset(true);
    if (input.consume('KeyC')) camera.cycle();
    if (input.consume('F3')) {
      hud.debug = !hud.debug;
      vehicle.setDebug(hud.debug);
    }
    if (input.consume('F4')) {
      wireframe = !wireframe;
      world.setWireframe(wireframe);
    }
    world.update(vehicle.position);
    camera.update(dt);
    sun.position.copyFrom(vehicle.position.add(new Vector3(35, 65, -35)));
    audio.update(vehicle.speed, input.actions.throttle);
    scene.render();
    hud.update(dt, vehicle, world, engine);
  });
  window.addEventListener('resize', () => engine.resize());
  // Observable, read-only diagnostics for browser smoke tests and profiling.
  Object.defineProperty(window, '__brumbrum', {
    configurable: true,
    get: () => ({
      renderer,
      position: vehicle.position.asArray(),
      speed: vehicle.speed,
      crashed: vehicle.crashed,
      grounded: vehicle.grounded,
      airtime: vehicle.airtime,
      bestAir: vehicle.bestAir,
      sectors: world.loadedCount,
      fps: engine.getFps(),
    }),
  });
}
