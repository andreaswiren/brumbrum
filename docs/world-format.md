# World format

The JSON-compatible world definition contains a seed, sector size, spawns, jumps, lakes and boundary settings. Pure world queries supply terrain, exact triangle interpolation, surface type, water level and snow coverage. Coordinates are metres, +Y up, +Z forward.

The playground is 6 km square. A 210 m high curved boundary ramp occupies the outer 220 m. Three lake basins meet their surrounding banks at water level. Frost Ridge, centered on (1350,1300), has a snowy circuit and spawn at (1350,920).

Terrain sectors are 256 m. Both near and far geometry use 48 subdivisions so borders, prop bases and terrain queries agree. Tree geometry still has separate near/far LODs. A 5×5 visible neighborhood surrounds a 3×3 collision neighborhood. Near collision builds synchronously; distant sectors build one per frame. Thin-instance vegetation is partitioned by sector, and props/colliders dispose on unload.

Trees and grass anchor to interpolated mesh height. Water is hidden when its complete basin is beyond streamed terrain. Snow shares terrain geometry and collision rather than using a floating overlay. Future work includes background generation, residency caching, authored tiles, floating-origin rebasing and a world editor.
