import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { collisionHeight } from '@brumbrum/world-format';

export interface RockPlacement {
  x: number;
  z: number;
  seed: number;
  /** Approximate half extents in metres; baked into the geometry for convex-hull collision. */
  scale: Vector3;
  yaw?: number;
}
const palettes = new WeakMap<Scene, PBRMaterial[]>();
const noise = (value: number) => {
  const n = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return n - Math.floor(n);
};
function stoneMaterial(scene: Scene, seed: number): PBRMaterial {
  let palette = palettes.get(scene);
  if (!palette) {
    palette = ['#484d50', '#363b3e', '#565b5e', '#414648'].map((color, i) => {
      const material = new PBRMaterial(`rough granite ${i}`, scene);
      material.albedoColor = Color3.FromHexString(color);
      material.metallic = 0;
      material.roughness = 0.94;
      material.environmentIntensity = 0.38;
      return material;
    });
    palettes.set(scene, palette);
  }
  return palette[Math.floor(noise(seed + 33) * palette.length)];
}

/** An irregular faceted hull with a buried, terrain-sampled footprint instead of a floating sphere. */
export function createRockVisual(
  scene: Scene,
  placement: RockPlacement,
  heightAt: (x: number, z: number) => number = collisionHeight,
): Mesh {
  const { x, z, seed, scale } = placement,
    yaw = placement.yaw ?? noise(seed + 17) * Math.PI * 2;
  const rock = MeshBuilder.CreateIcoSphere(
    'fractured granite outcrop',
    { radius: 1, subdivisions: 2, flat: true },
    scene,
  );
  const positions = Array.from(rock.getVerticesData(VertexBuffer.PositionKind)!);
  const indices = rock.getIndices()!,
    normals: number[] = [],
    colors: number[] = [];
  const form = Math.floor(noise(seed + 9) * 3);
  for (let i = 0; i < positions.length; i += 3) {
    const px = positions[i],
      py = positions[i + 1],
      pz = positions[i + 2];
    // Coordinate-based variation keeps duplicated flat-shaded vertices welded geometrically.
    const fracture =
      0.83 +
      noise(
        Math.round(px * 1000) * 0.13 +
          Math.round(py * 1000) * 0.37 +
          Math.round(pz * 1000) * 0.71 +
          seed,
      ) *
        0.26;
    let localY = py * fracture;
    if (form === 0) localY = Math.min(localY, 0.65 + px * 0.18 - pz * 0.11);
    if (form === 1) localY = Math.min(localY, 0.79 - Math.abs(px + pz * 0.35) * 0.26);
    if (form === 2) localY *= 0.76;
    positions[i] = (px * fracture + py * (noise(seed + 22) - 0.5) * 0.27) * scale.x;
    positions[i + 1] = localY * scale.y;
    positions[i + 2] = (pz * fracture + px * (noise(seed + 24) - 0.5) * 0.16) * scale.z;
  }
  VertexData.ComputeNormals(positions, indices, normals);
  // Flat facets get subtle mineral variation while remaining neutral stone gray.
  for (let i = 0; i < positions.length / 3; i++) {
    const facet = Math.floor(i / 3),
      shade = 0.78 + noise(facet * 3.7 + seed + 4) * 0.27;
    colors.push(shade, shade, shade, 1);
  }
  rock.setVerticesData(VertexBuffer.PositionKind, positions);
  rock.setVerticesData(VertexBuffer.NormalKind, normals);
  rock.setVerticesData(VertexBuffer.ColorKind, colors);
  rock.material = stoneMaterial(scene, seed);
  rock.receiveShadows = true;
  rock.rotation.y = yaw;
  const cos = Math.cos(yaw),
    sin = Math.sin(yaw),
    burial = Math.max(0.1, scale.y * 0.1);
  let elevation = heightAt(x, z) - scale.y * 0.23;
  const samples: { x: number; y: number; z: number }[] = [];
  const unique = new Set<string>();
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] > -scale.y * 0.12) continue;
    const px = positions[i] * cos + positions[i + 2] * sin;
    const pz = positions[i + 2] * cos - positions[i] * sin;
    const key = `${px.toFixed(3)},${positions[i + 1].toFixed(3)},${pz.toFixed(3)}`;
    if (unique.has(key)) continue;
    unique.add(key);
    const surface = heightAt(x + px, z + pz);
    elevation = Math.min(elevation, surface - positions[i + 1] - burial);
    samples.push({ x: px, y: positions[i + 1], z: pz });
  }
  rock.position.set(x, elevation, z);
  rock.refreshBoundingInfo();
  rock.metadata = { rockSeed: seed, embeddedFootprint: samples, burial };
  return rock;
}
