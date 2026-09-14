import { DynamicTexture, Scene, Texture } from '@babylonjs/core';

/** A seamless fine-grained snow texture; terrain splatting supplies the region edge and tracks. */
export function createSnowTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture('wind-packed snow crystals', 256, scene, true);
  const context = texture.getContext();
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const grain = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const noise = grain - Math.floor(grain);
      const ripple = Math.sin((y * Math.PI) / 16 + Math.sin((x * Math.PI) / 32) * 0.8);
      const value = Math.round(219 + noise * 20 + ripple * 5);
      context.fillStyle = `rgb(${value - 5},${value},${Math.min(255, value + 9)})`;
      context.fillRect(x, y, 1, 1);
    }
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = texture.vScale = 256 / 6;
  texture.anisotropicFilteringLevel = 8;
  texture.update(false);
  return texture;
}
