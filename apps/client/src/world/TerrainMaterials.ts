import { Color3, DynamicTexture, Scene, Texture } from '@babylonjs/core';
import { TerrainMaterial } from '@babylonjs/materials/terrain';
import { snowAmount, snowTrailDistance, trailDistance } from '@brumbrum/world-format';
import { createSnowTexture } from './SnowMaterials';
import { world } from '@brumbrum/configuration';
export class TerrainMaterials {
  private sand: Texture;
  private ground: Texture;
  private sandNormal: Texture;
  private groundNormal: Texture;
  private snow: Texture;
  private snowNormal: DynamicTexture;
  readonly materials = new Set<TerrainMaterial>();
  wireframe = false;
  constructor(private scene: Scene) {
    const texture = (file: string) => {
      const t = new Texture(`/assets/textures/${file}.jpg`, scene);
      t.uScale = t.vScale = world.sectorSize / 6;
      t.anisotropicFilteringLevel = 8;
      return t;
    };
    this.sand = texture('forrest_sand_01_diff');
    this.ground = texture('forrest_ground_01_diff');
    this.sandNormal = texture('forrest_sand_01_nor_gl');
    this.groundNormal = texture('forrest_ground_01_nor_gl');
    this.sandNormal.gammaSpace = false;
    this.groundNormal.gammaSpace = false;
    this.snow = createSnowTexture(scene);
    this.snowNormal = new DynamicTexture('smooth packed snow normal', 2, scene, false);
    const snowContext = this.snowNormal.getContext();
    snowContext.fillStyle = 'rgb(128,128,255)';
    snowContext.fillRect(0, 0, 2, 2);
    this.snowNormal.update(false);
    this.snowNormal.gammaSpace = false;
  }
  create(sx: number, sz: number): TerrainMaterial {
    const material = new TerrainMaterial(`soil layers ${sx},${sz}`, this.scene);
    material.diffuseTexture1 = this.sand;
    material.diffuseTexture2 = this.ground;
    material.diffuseTexture3 = this.snow;
    material.bumpTexture1 = this.sandNormal;
    material.bumpTexture2 = this.groundNormal;
    material.bumpTexture3 = this.snowNormal;
    material.specularColor = Color3.Black();
    material.wireframe = this.wireframe;
    material.diffuseColor = Color3.White();
    const mix = new DynamicTexture('terrain splat map', 128, this.scene, false),
      ctx = mix.getContext();
    for (let z = 0; z < 128; z++)
      for (let x = 0; x < 128; x++) {
        const wx = sx * 256 + (x / 127) * 256,
          wz = sz * 256 + (z / 127) * 256;
        const dirt = Math.max(0, Math.min(1, (11 - trailDistance(wx, wz)) / 5));
        const snow = snowAmount(wx, wz) * (snowTrailDistance(wx, wz) < 9 ? 0.83 : 1);
        ctx.fillStyle = `rgb(${Math.round(dirt * (1 - snow) * 255)},${Math.round((1 - dirt) * (1 - snow) * 255)},${Math.round(snow * 255)})`;
        ctx.fillRect(x, z, 1, 1);
      }
    mix.update(false);
    material.mixTexture = mix;
    this.materials.add(material);
    material.onDisposeObservable.add(() => {
      mix.dispose();
      this.materials.delete(material);
    });
    return material;
  }
}
