import { Color3, Mesh, PBRMaterial, Scene, Texture, VertexData, Vector3 } from '@babylonjs/core';
import { lakes } from '@brumbrum/world-format';
export class Lakes {
  private ripples: Texture;
  private meshes: Mesh[] = [];
  constructor(scene: Scene) {
    this.ripples = new Texture('/assets/textures/forrest_sand_01_nor_gl.jpg', scene);
    this.ripples.uScale = this.ripples.vScale = 45;
    this.ripples.level = 0.12;
    const water = new PBRMaterial('lake water', scene);
    water.albedoColor = Color3.FromHexString('#2b6570');
    water.metallic = 0.15;
    water.roughness = 0.12;
    water.alpha = 0.84;
    water.bumpTexture = this.ripples;
    water.environmentIntensity = 1.2;
    water.backFaceCulling = false;
    for (const lake of lakes) {
      const mesh = new Mesh(lake.name, scene),
        data = new VertexData(),
        positions = [lake.x, lake.level, lake.z],
        normals = [0, 1, 0],
        indices: number[] = [],
        uvs = [0.5, 0.5];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        positions.push(lake.x + Math.cos(a) * lake.rx, lake.level, lake.z + Math.sin(a) * lake.rz);
        normals.push(0, 1, 0);
        uvs.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2);
        if (i < 96) indices.push(0, i + 2, i + 1);
      }
      data.positions = positions;
      data.normals = normals;
      data.indices = indices;
      data.uvs = uvs;
      data.applyToMesh(mesh);
      mesh.material = water;
      mesh.receiveShadows = true;
      this.meshes.push(mesh);
    }
  }
  update(dt: number, position: Vector3): void {
    this.ripples.uOffset += dt * 0.009;
    this.ripples.vOffset += dt * 0.004;
    this.meshes.forEach((mesh, i) => {
      const lake = lakes[i];
      // A distant lake must never be shown beyond the streamed terrain beneath it.
      mesh.setEnabled(
        Math.abs(lake.x - position.x) + lake.rx < 490 &&
          Math.abs(lake.z - position.z) + lake.rz < 490,
      );
    });
  }
}
