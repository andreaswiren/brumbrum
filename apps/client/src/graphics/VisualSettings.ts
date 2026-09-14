import type { GraphicsPreset } from '@brumbrum/configuration';

export const imageStyles = {
  natural: { exposure: 1.05, contrast: 1.1, saturation: 5, bloom: 0.12, vignette: 0.1 },
  vivid: { exposure: 1.12, contrast: 1.2, saturation: 30, bloom: 0.2, vignette: 0.12 },
  saturated: { exposure: 1.08, contrast: 1.16, saturation: 65, bloom: 0.16, vignette: 0.08 },
  energetic: { exposure: 1.18, contrast: 1.27, saturation: 42, bloom: 0.3, vignette: 0.2 },
  filmic: { exposure: 1.08, contrast: 1.16, saturation: -12, bloom: 0.22, vignette: 0.35 },
} as const;
export type ImageStyle = keyof typeof imageStyles;
export interface VisualSettings {
  quality: GraphicsPreset;
  style: ImageStyle;
  exposure: number;
  contrast: number;
  saturation: number;
  bloom: number;
  vignette: number;
  sharpness: number;
  depthOfField: number;
  atmosphere: number;
  occlusion: number;
  msaa: number;
  fxaa: boolean;
  vegetation: number;
  waterMotion: number;
  waterBlue: number;
}
export const qualityDefaults = {
  low: { msaa: 1, fxaa: true, occlusion: 0, vegetation: 1.4 },
  medium: { msaa: 4, fxaa: true, occlusion: 0.8, vegetation: 2.2 },
  high: { msaa: 4, fxaa: true, occlusion: 1.2, vegetation: 3.2 },
} as const;
export const defaultVisualSettings: VisualSettings = {
  quality: 'high',
  style: 'vivid',
  ...imageStyles.vivid,
  ...qualityDefaults.high,
  sharpness: 0.2,
  depthOfField: 0,
  atmosphere: 1,
  waterMotion: 1,
  waterBlue: 1,
};
const ranges: Record<string, [number, number]> = {
  exposure: [0.5, 1.8],
  contrast: [0.7, 1.6],
  saturation: [-70, 80],
  bloom: [0, 0.7],
  vignette: [0, 0.6],
  sharpness: [0, 0.6],
  depthOfField: [0, 1],
  atmosphere: [0, 2],
  occlusion: [0, 2],
  vegetation: [1, 4],
  waterMotion: [0, 2],
  waterBlue: [0.3, 1.5],
};
export function sanitizeVisualSettings(value: unknown): VisualSettings {
  const result = { ...defaultVisualSettings };
  if (!value || typeof value !== 'object') return result;
  const raw = value as Record<string, unknown>;
  if (raw.quality === 'low' || raw.quality === 'medium' || raw.quality === 'high')
    result.quality = raw.quality;
  if (typeof raw.style === 'string' && Object.hasOwn(imageStyles, raw.style))
    result.style = raw.style as ImageStyle;
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const number = raw[key];
    if (typeof number === 'number' && Number.isFinite(number))
      (result as unknown as Record<string, unknown>)[key] = Math.max(min, Math.min(max, number));
  }
  result.msaa = raw.msaa === 1 ? 1 : 4;
  if (typeof raw.fxaa === 'boolean') result.fxaa = raw.fxaa;
  return result;
}
export function loadVisualSettings(storage?: Pick<Storage, 'getItem'>): VisualSettings {
  try {
    return sanitizeVisualSettings(JSON.parse(storage?.getItem('brumbrum.graphics.v1') ?? 'null'));
  } catch {
    return { ...defaultVisualSettings };
  }
}
