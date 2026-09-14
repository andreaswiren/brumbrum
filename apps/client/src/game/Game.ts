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
  Vector3,
  WebGPUEngine,
  HDRCubeTexture,
  type AbstractEngine,
} from '@babylonjs/core';
import { graphics, physics, type GraphicsPreset } from '@brumbrum/configuration';
import { TerrainWorld } from '../world/TerrainWorld';
import { Motorcycle } from '../vehicles/Motorcycle';
import { InputManager } from '../input/InputManager';
import { ChaseCamera } from '../camera/ChaseCamera';
import { Hud } from '../ui/Hud';
import { EngineAudio } from '../audio/EngineAudio';
import { ForestAssets } from '../world/ForestAssets';
import { Lakes } from '../world/Lakes';
import { TrickScore } from '../scoring/TrickScore';
import { snowSpawn } from '@brumbrum/world-format';
import type { VehicleKind } from '../vehicles/VehicleModels';
import { VehicleInterpolation } from '../vehicles/VehicleInterpolation';
import { SurfaceEffects } from '../world/SurfaceEffects';
import { createGroundShadows, createGroundOcclusion } from '../world/GroundLighting';
import { GraphicsPipeline } from '../graphics/GraphicsPipeline';
import { loadVisualSettings, type VisualSettings } from '../graphics/VisualSettings';
import { GraphicsMenu } from '../ui/GraphicsMenu';
import { RockAssets } from '../world/RockAssets';
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
  scene.fogDensity = 0.001;
  scene.fogColor = new Color3(0.65, 0.76, 0.76);
  scene.imageProcessingConfiguration.exposure = 0.95;
  scene.imageProcessingConfiguration.contrast = 1.25;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  const hemi = new HemisphericLight('sky fill', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.18;
  hemi.groundColor = new Color3(0.27, 0.29, 0.19);
  const sun = new DirectionalLight('afternoon sun', new Vector3(-0.55, -0.8, 0.45), scene);
  sun.intensity = 1.35;
  sun.diffuse = new Color3(1, 0.97, 0.9);
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -65;
  sun.orthoRight = 65;
  sun.orthoTop = 65;
  sun.orthoBottom = -65;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 180;
  let shadows = createGroundShadows(scene, sun, 'high');
  let occlusion: ReturnType<typeof createGroundOcclusion>;
  const input = new InputManager(),
    audio = new EngineAudio();
  let vehicle: Motorcycle, world: TerrainWorld, camera: ChaseCamera;
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    /* Storage is optional. */
  }
  const score = new TrickScore(storage);
  const preferences = loadVisualSettings(storage);
  let finishing: GraphicsPipeline | undefined;
  let appliedQuality = '';
  let graphicsMenu: GraphicsMenu;
  const interpolation = new VehicleInterpolation();
  let remainder = 0,
    frameDt = physics.step as number;
  let wireframe = false;
  const hud = new Hud(renderer, {
    reset: () => vehicle?.reset(),
    newRun: () => {
      score.newRun();
      vehicle?.reset(true);
    },
    vehicle: (kind: VehicleKind) => {
      if (!vehicle || kind === vehicle.kind) return;
      const location = vehicle.position.clone(),
        yaw = vehicle.yaw,
        resetId = vehicle.resetId + 1;
      vehicle.dispose();
      vehicle = new Motorcycle(scene, kind);
      vehicle.travelTo(location.x, location.z, yaw);
      vehicle.resetId = resetId;
      if (kind === 'snowmobile') vehicle.travelTo(snowSpawn.x, snowSpawn.z, snowSpawn.yaw);
      camera.setVehicle(vehicle);
      vehicle.visual.meshes.forEach((m) => shadows.addShadowCaster(m));
      const selected = vehicle;
      void selected.visual.riderRig
        .loadCharacter()
        .then(() => {
          if (vehicle === selected)
            selected.visual.riderRig.meshes.forEach((m) => shadows.addShadowCaster(m));
        })
        .catch((error) => console.error('Character load failed', error));
    },
    camera: () => camera?.cycle(),
    travel: (place) => {
      if (place === 'lake') vehicle.travelTo(-245, -12);
      else if (place === 'wall') vehicle.travelTo(2690, 0, Math.PI / 2);
      else if (place === 'snow') vehicle.travelTo(snowSpawn.x, snowSpawn.z, snowSpawn.yaw);
      else vehicle.reset(true);
    },
    sound: () => {
      void audio
        .toggle()
        .then(() => hud.sound(audio.enabled, audio.muted))
        .catch(() => hud.sound(false, false));
    },
    debug: () => {
      hud.debug = !hud.debug;
      vehicle?.setDebug(hud.debug);
    },
    quality: (v) => {
      graphicsMenu?.setQuality(v as GraphicsPreset);
    },
  });
  const applyGraphics = (settings: VisualSettings) => {
    if (!camera) return;
    if (appliedQuality !== settings.quality) {
      engine.setHardwareScalingLevel(graphics[settings.quality].pixelRatio);
      const casters =
        shadows.getShadowMap()?.renderList?.filter((mesh) => !mesh.isDisposed()) ?? [];
      shadows.dispose();
      shadows = createGroundShadows(scene, sun, settings.quality);
      casters.forEach((mesh) => shadows.addShadowCaster(mesh, false));
      occlusion?.dispose(true);
      occlusion =
        settings.occlusion > 0
          ? createGroundOcclusion(
              scene,
              camera.camera,
              settings.quality === 'low' ? 'medium' : settings.quality,
            )
          : undefined;
      appliedQuality = settings.quality;
    }
    if (settings.occlusion > 0 && !occlusion)
      occlusion = createGroundOcclusion(
        scene,
        camera.camera,
        settings.quality === 'low' ? 'medium' : settings.quality,
      );
    if (occlusion) occlusion.totalStrength = settings.occlusion * 2;
    world?.setVegetationDensity(settings.vegetation);
    lakes.setAppearance(settings.waterBlue, settings.waterMotion);
    finishing?.apply(settings);
  };
  graphicsMenu = new GraphicsMenu(preferences, applyGraphics, storage);
  const unlockAudio = (event: Event) => {
    if ((event.target as HTMLElement)?.closest?.('#sound')) return;
    void audio
      .unlock()
      .then(() => hud.sound(audio.enabled, audio.muted))
      .catch(() => hud.sound(false, false));
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.suspend();
    else void audio.unlock().catch(() => {});
  });
  const havok = await HavokPhysics({ locateFile: () => havokWasm });
  scene.enablePhysics(new Vector3(0, physics.gravity, 0), new HavokPlugin(true, havok));
  scene.getPhysicsEngine()!.setTimeStep(physics.step);
  scene.getPhysicsEngine()!.setSubTimeStep(physics.step * 1000);
  const [forest, rocks] = await Promise.all([ForestAssets.load(scene), RockAssets.load(scene)]);
  const sky = new HDRCubeTexture(
    '/assets/sky/partly-cloudy.hdr',
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentTexture = sky;
  scene.environmentIntensity = 0.45;
  const skybox = scene.createDefaultSkybox(sky, true, 1800, 0, false);
  if (skybox) skybox.applyFog = false;
  const lakes = new Lakes(scene);
  const surfaceEffects = new SurfaceEffects(scene);
  world = new TerrainWorld(
    scene,
    (mesh) => shadows.addShadowCaster(mesh),
    forest,
    preferences.vegetation,
    rocks,
  );
  vehicle = new Motorcycle(scene);
  await vehicle.visual.riderRig.loadCharacter();
  camera = new ChaseCamera(scene, vehicle);
  finishing = new GraphicsPipeline(scene, camera.camera);
  applyGraphics(preferences);
  vehicle.visual.meshes.forEach((m) => shadows.addShadowCaster(m));
  vehicle.visual.riderRig.meshes.forEach((m) => shadows.addShadowCaster(m));
  scene.onBeforePhysicsObservable.add(() => {
    interpolation.capture(vehicle);
    remainder = Math.max(0, remainder - physics.step);
    if (
      world.interactVehicle(
        vehicle.position,
        vehicle.crashed ? Vector3.Zero() : vehicle.velocity,
        vehicle.kind,
        physics.step,
      )
    )
      audio.impact({
        kind: 'obstacle',
        strength: Math.max(5, vehicle.speed * 0.4),
        surface: 'wood',
      });
    vehicle.step(input.actions);
  });
  scene.onAfterPhysicsObservable.add(() => {
    const mesh = vehicle.visual.chassis,
      angular = vehicle.aggregate.body.getAngularVelocity();
    score.update(physics.step, {
      grounded: vehicle.grounded,
      crashed: vehicle.crashed,
      speed: vehicle.speed,
      upright: mesh.getDirection(Vector3.Up()).y,
      pitchRate: Vector3.Dot(angular, mesh.getDirection(Vector3.Right())),
      yawRate: angular.y,
      rollRate: Vector3.Dot(angular, mesh.getDirection(Vector3.Forward())),
      resetId: vehicle.resetId,
      returnId: vehicle.boundaryLaunches,
      x: vehicle.position.x,
      y: vehicle.position.y,
      z: vehicle.position.z,
    });
  });
  scene.onBeforeRenderObservable.add(() => {
    interpolation.render(vehicle, Math.min(1, remainder / physics.step));
    camera.update(frameDt);
    finishing?.focus(Vector3.Distance(camera.camera.position, vehicle.position));
    surfaceEffects.update(vehicle, input.actions.throttle);
  });
  scene.onAfterRenderObservable.add(() => interpolation.restore());
  hud.ready();
  engine.runRenderLoop(() => {
    if (document.hidden) return;
    scene.physicsEnabled = !graphicsMenu.dialog.open;
    const dt = Math.min(engine.getDeltaTime() / 1000, physics.step * physics.maxFrameSteps);
    frameDt = dt;
    if (!graphicsMenu.dialog.open) remainder += dt;
    input.update();
    if (graphicsMenu.dialog.open) {
      input.actions.throttle =
        input.actions.brake =
        input.actions.steer =
        input.actions.pitch =
        input.actions.roll =
          0;
      input.actions.preload = input.actions.rearBrake = false;
      input.actions.cameraX = input.actions.cameraY = 0;
    }
    camera.orbit(input.actions.cameraX ?? 0, input.actions.cameraY ?? 0, dt);
    if (input.consume('KeyR')) vehicle.reset();
    if (input.consume('Home')) vehicle.reset(true);
    if (input.consume('KeyB')) vehicle.crashed = true;
    if (input.consume('KeyC')) camera.cycle();
    if (input.consume('Escape')) hud.toggleHelp();
    if (input.consume('F3')) {
      hud.debug = !hud.debug;
      vehicle.setDebug(hud.debug);
    }
    if (input.consume('F4')) {
      wireframe = !wireframe;
      world.setWireframe(wireframe);
    }
    world.update(vehicle.position);
    sun.position.copyFrom(vehicle.position.add(new Vector3(35, 65, -35)));
    lakes.update(dt, vehicle.position);
    audio.update(
      vehicle.speed,
      input.actions.throttle,
      vehicle.grounded,
      vehicle.crashed,
      dt,
      vehicle.kind,
    );
    for (const impact of vehicle.audioImpacts.splice(0)) audio.impact(impact);
    hud.inputStatus(input);
    hud.sound(audio.enabled, audio.muted);
    scene.render();
    hud.update(dt, vehicle, world, engine);
    hud.scoring(score);
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
