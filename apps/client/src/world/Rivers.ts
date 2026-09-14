import {
  Color3,
  DynamicTexture,
  Mesh,
  PBRMaterial,
  Scene,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import {
  rivers,
  riverCenterZ,
  riverHalfWidthAt,
  riverLevelAt,
  type RiverDefinition,
} from '@brumbrum/world-format';

interface RiverSection {
  mesh: Mesh;
  river: RiverDefinition;
  positions: number[];
  widths: number[];
  centerX: number;
}

/** Short sections follow streaming terrain; bank vertices remain at the exact water level. */
export class Rivers {
  private sections: RiverSection[] = [];
  private material: PBRMaterial;
  private ripples: DynamicTexture;
  private time = 0;
  private motion = 1;
  constructor(scene: Scene) {
    this.ripples = new DynamicTexture('flowing river ripples', 64, scene, true);
    const context = this.ripples.getContext();
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const u = (x / 64) * Math.PI * 2,
          v = (y / 64) * Math.PI * 2;
        const dx = 0.25 * Math.cos(u * 4 + Math.sin(v * 2));
        const dz = 0.15 * Math.sin(v * 5 - u * 2);
        const length = Math.hypot(dx, dz, 1);
        context.fillStyle = `rgb(${Math.round(128 - (dx / length) * 127)},${Math.round(128 - (dz / length) * 127)},${Math.round(128 + 127 / length)})`;
        context.fillRect(x, y, 1, 1);
      }
    this.ripples.update(false);
    this.ripples.gammaSpace = false;
    this.ripples.uScale = 18;
    this.ripples.vScale = 3;
    this.material = new PBRMaterial('flowing blue river water', scene);
    this.material.metallic = 0.05;
    this.material.roughness = 0.19;
    this.material.alpha = 0.94;
    this.material.bumpTexture = this.ripples;
    this.material.environmentIntensity = 0.85;
    this.material.backFaceCulling = false;
    this.setAppearance(1, 1);
    for (const river of rivers) {
      const count = Math.ceil((river.endX - river.startX) / 100);
      for (let section = 0; section < count; section++) {
        const start = river.startX + ((river.endX - river.startX) * section) / count;
        const end = river.startX + ((river.endX - river.startX) * (section + 1)) / count;
        const data = new VertexData(),
          positions: number[] = [],
          normals: number[] = [],
          uvs: number[] = [],
          indices: number[] = [],
          widths: number[] = [];
        const rows = 32,
          columns = 8;
        for (let row = 0; row <= rows; row++)
          for (let column = 0; column <= columns; column++) {
            const x = start + ((end - start) * row) / rows,
              across = (column / columns) * 2 - 1;
            positions.push(
              x,
              riverLevelAt(river, x),
              riverCenterZ(river, x) + across * riverHalfWidthAt(river, x),
            );
            normals.push(0, 1, 0);
            uvs.push(x / 100, column / columns);
            widths.push(across);
            if (row < rows && column < columns) {
              const a = row * (columns + 1) + column,
                b = a + columns + 1;
              indices.push(a, a + 1, b, b, a + 1, b + 1);
            }
          }
        const mesh = new Mesh(`${river.name} section ${section}`, scene);
        data.positions = positions;
        data.normals = normals;
        data.uvs = uvs;
        data.indices = indices;
        data.applyToMesh(mesh, true);
        mesh.material = this.material;
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        this.sections.push({ mesh, river, positions, widths, centerX: (start + end) / 2 });
      }
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
    this.ripples.uOffset = -this.time * 0.025;
    this.ripples.vOffset = Math.sin(this.time * 0.12) * 0.025;
    for (const section of this.sections) {
      const { mesh, river, positions, widths, centerX } = section;
      const visible =
        Math.abs(position.x - centerX) < 480 &&
        Math.abs(position.z - riverCenterZ(river, centerX)) < 440;
      mesh.setEnabled(visible);
      if (!visible) continue;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i],
          z = positions[i + 2],
          edge = 1 - widths[i / 3] ** 2;
        positions[i + 1] =
          riverLevelAt(river, x) +
          edge * this.motion * 0.055 * Math.sin(x * 0.32 - z * 0.18 - this.time * 2.4);
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    }
  }
}
