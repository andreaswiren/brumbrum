# Architecture

`Game.ts` composes the renderer, physics, world, vehicle, camera, audio, scoring and HUD. Startup awaits Havok, forest assets and the initial skinned character. Vehicle switching replaces physical and visual resources while keeping the scene and run.

| Module                                                 | Responsibility                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| InputManager / GamepadInput                            | Keyboard and standard Xbox mapping, analog deadzones and button edges                       |
| TerrainWorld / TerrainMaterials / ForestAssets / Lakes | Sector streaming, collision, material layers, model LODs and water                          |
| Motorcycle / VehicleSetup                              | Shared assisted two/four-contact physics, surface response, crash/reset and vehicle tuning  |
| BikeVisual / VehicleModels / SnowmobileVisual          | Vehicle meshes and wheel/track articulation                                                 |
| RiderRig / RiderMotion / DriverCharacter               | Physical ragdoll proxies, smoothed contact poses, skinned character                         |
| FloorGuard / VehicleInterpolation                      | Terrain penetration defense and display interpolation                                       |
| TrickScore                                             | Unlimited run clock, pending tricks, clean landings and persistent local jump best          |
| ChaseCamera / EngineAudio / Hud                        | Camera, recorded/synthesized engine and impact audio, controls, telemetry and score display |
| packages/world-format                                  | Shared deterministic world definition and spatial queries                                   |
| packages/protocol                                      | Future server input/state/event types, including arena run results                          |

Input is sampled each render frame; physics and scoring update at 60 Hz. Render interpolation temporarily blends the chassis pose and restores simulation state after rendering. Browser visibility pauses rendering and suspends audio; window blur clears keyboard state.

World generation is deterministic and independent of Babylon. Near terrain creation remains synchronous. Graphics presets adjust resolution and shadows; tree-density config fields are reserved. The current client has no multiplayer transport or authoritative scoring server.

GroundLighting owns stable cascaded sun shadows and SSAO2 geometry-buffer contact occlusion. High uses three 2048px cascades and 16 AO samples; medium uses two 1024px cascades and eight AO samples. Low disables shadows/AO. Quality changes retain all existing terrain, rider and prop casters. Terrain normal maps are sampled as linear data.
