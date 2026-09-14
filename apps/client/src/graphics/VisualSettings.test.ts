import { describe, expect, it } from 'vitest';
import {
  defaultVisualSettings,
  loadVisualSettings,
  sanitizeVisualSettings,
} from './VisualSettings';

describe('saved graphics preferences', () => {
  it('recovers from corrupt or unavailable storage', () => {
    expect(loadVisualSettings({ getItem: () => '{broken' })).toEqual(defaultVisualSettings);
    expect(
      loadVisualSettings({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toEqual(defaultVisualSettings);
  });
  it('keeps valid independent choices while bounding invalid GPU settings', () => {
    const settings = sanitizeVisualSettings({
      quality: 'low',
      style: 'filmic',
      occlusion: 1.4,
      depthOfField: 9,
      vegetation: -20,
      exposure: NaN,
      msaa: 128,
      fxaa: false,
    });
    expect(settings).toMatchObject({
      quality: 'low',
      style: 'filmic',
      occlusion: 1.4,
      depthOfField: 1,
      vegetation: 1,
      exposure: defaultVisualSettings.exposure,
      msaa: 4,
      fxaa: false,
    });
    expect(sanitizeVisualSettings({ style: '__proto__' }).style).toBe('vivid');
  });
});
