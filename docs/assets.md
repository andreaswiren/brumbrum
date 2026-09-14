# Assets and dependencies

All current meshes, soil detail and map graphics are procedural original placeholders created for this project. No assets from the supplied OneDrive directory were copied; its collection was inspected, but external art was not needed to unblock Phase 1. No paid asset files or credentials are in this repository.

Runtime dependencies: Babylon.js core (Apache-2.0) and Babylon.js Havok WASM distribution (MIT, see the installed package license). Development tooling: Vite, TypeScript and Vitest; their licenses remain in npm packages. Google Fonts serves Barlow and Barlow Condensed (SIL Open Font License) with system-font fallbacks. All gameplay works without the font service.

Future runtime models should be GLB/GLTF with source files kept separately. Replace `BikeVisual` and sector templates while preserving controller transforms and collision definitions. Add per-asset origin, author, license and optimization notes when importing third-party content. Do not commit entire source libraries to the runtime public folder.
