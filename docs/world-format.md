# World format

`WorldDefinition` is versioned JSON-compatible data with a seed, sector size, spawn positions and jump entities. See `packages/world-format/src/index.ts` for the current definition and pure coordinate functions. The current runtime uses the bundled deterministic definition; external file loading and editing are future work.

Coordinates are metres. +Y is up and the spawn faces +Z. `floor(worldCoordinate / 256)` assigns sectors, including negative coordinates. Local positions always lie in `[0,256)`. Terrain height is a deterministic function shared by rendering, surface detection and reset safety.

Each jump records x/z, height, width, approach length and a name. Its long curved approach and shorter backside create a launch lip. The rendering mesh samples the same function; the Havok mesh collider uses the same vertices, so terrain contact is authoritative within mesh resolution.

Near terrain uses 48 subdivisions per sector; far terrain uses 16. A 5×5 visible neighborhood includes a 3×3 collidable neighborhood. Trunks, rocks and terrain aggregates dispose when a sector leaves residency; thin instances are partitioned per sector. Neighbor changes rebuild only sectors whose residency or LOD changed.

Future extensions: explicit biome/surface layers, authored height tiles, collision LOD, skirts between resolutions, asynchronous generation, cached geometry, scene-wide floating-origin rebasing, persistence and browser editor tools.
