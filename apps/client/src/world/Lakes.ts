import {
  Color3,
  DynamicTexture,
  Mesh,
  PBRMaterial,
  Scene,
  VertexBuffer,
  VertexData,
  Vector3,
} from '@babylonjs/core';
import { lakes } from '@brumbrum/world-format';

export class Lakes {
  private ripples: DynamicTexture;
  private meshes: Mesh[] = [];
  private positions: number[][] = [];
  private normals: number[][] = [];
  private material: PBRMaterial;
  private time = 0;
  private motion = 1;
  constructor(scene: Scene) {
    this.ripples = new DynamicTexture('wind-driven water ripples', 128, scene, true);
    const ctx = this.ripples.getContext();
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const u = (x / 128) * Math.PI * 2,
          v = (y / 128) * Math.PI * 2;
        const dx = 0.3 * Math.cos(u * 3 + v * 2) + 0.15 * Math.cos(u * 7 - v * 4);
        const dy =
          0.2 * Math.cos(u * 3 + v * 2) - 0.12 * Math.cos(u * 7 - v * 4) + 0.2 * Math.cos(v * 5);
        const length = Math.hypot(dx, dy, 1);
        ctx.fillStyle = `rgb(${Math.round(128 - (dx / length) * 127)},${Math.round(128 - (dy / length) * 127)},${Math.round(128 + 127 / length)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    this.ripples.update(false);
    this.ripples.gammaSpace = false;
    this.ripples.uScale = this.ripples.vScale = 34;
    this.ripples.level = 0.55;
    const water = (this.material = new PBRMaterial('blue lake water', scene));
    water.metallic = 0.05;
    water.roughness = 0.17;
    water.alpha = 0.94;
    water.bumpTexture = this.ripples;
    water.environmentIntensity = 0.85;
    water.backFaceCulling = false;
    this.setAppearance(1, 1);
    for (const lake of lakes) {
      const mesh = new Mesh(lake.name, scene),
        data = new VertexData(),
        positions: number[] = [],
        normals: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
      const rings = 24,
        segments = 96;
      for (let ring = 0; ring <= rings; ring++)
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2,
            r = ring / rings;
          positions.push(
            lake.x + Math.cos(angle) * lake.rx * r,
            lake.level,
            lake.z + Math.sin(angle) * lake.rz * r,
          );
          normals.push(0, 1, 0);
          uvs.push(0.5 + (Math.cos(angle) * r) / 2, 0.5 + (Math.sin(angle) * r) / 2);
          if (ring < rings && i < segments) {
            const a = ring * (segments + 1) + i,
              b = a + segments + 1;
            indices.push(a, b + 1, b, a, a + 1, b + 1);
          }
        }
      data.positions = positions;
      data.normals = normals;
      data.indices = indices;
      data.uvs = uvs;
      data.applyToMesh(mesh, true);
      mesh.material = water;
      mesh.receiveShadows = true;
      this.meshes.push(mesh);
      this.positions.push(positions);
      this.normals.push(normals);
    }
  }
  setAppearance(blue: number, motion: number): void {
    this.motion = motion;
    this.material.albedoColor = Color3.Lerp(
      Color3.FromHexString('#246d78'),
      Color3.FromHexString('#075fa9'),
      Math.min(1, blue / 1.5),
    );
    this.material.emissiveColor = this.material.albedoColor.scale(0.055);
    this.ripples.level = 0.25 + motion * 0.3;
  }
  update(dt: number, position: Vector3): void {
    this.time += dt * this.motion;
    this.ripples.uOffset = this.time * 0.014;
    this.ripples.vOffset = this.time * -0.008;
    this.ripples.wAng = Math.sin(this.time * 0.05) * 0.035;
    this.meshes.forEach((mesh, index) => {
      const lake = lakes[index];
      const visible =
        Math.abs(lake.x - position.x) + lake.rx < 490 &&
        Math.abs(lake.z - position.z) + lake.rz < 490;
      mesh.setEnabled(visible);
      if (!visible) return;
      const points = this.positions[index],
        normals = this.normals[index];
      for (let i = 0; i < points.length; i += 3) {
        const x = points[i] - lake.x,
          z = points[i + 2] - lake.z;
        const edge = Math.min(1, Math.max(0, (1 - Math.hypot(x / lake.rx, z / lake.rz)) * 8));
        const a = x * 0.2 + z * 0.13 + this.time * 1.6,
          b = x * -0.11 + z * 0.28 - this.time * 1.15;
        points[i + 1] =
          lake.level + edge * this.motion * (Math.sin(a) * 0.055 + Math.sin(b) * 0.025);
        const nx = -edge * this.motion * (Math.cos(a) * 0.011 - Math.cos(b) * 0.00275),
          nz = -edge * this.motion * (Math.cos(a) * 0.00715 + Math.cos(b) * 0.007),
          length = Math.hypot(nx, 1, nz);
        normals[i] = nx / length;
        normals[i + 1] = 1 / length;
        normals[i + 2] = nz / length;
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, points);
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    });
  }
}
