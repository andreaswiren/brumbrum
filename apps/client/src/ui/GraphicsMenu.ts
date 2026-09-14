import {
  defaultVisualSettings,
  imageStyles,
  qualityDefaults,
  type ImageStyle,
  type VisualSettings,
} from '../graphics/VisualSettings';
import type { GraphicsPreset } from '@brumbrum/configuration';

export class GraphicsMenu {
  readonly dialog = document.createElement('dialog');
  constructor(
    readonly settings: VisualSettings,
    private apply: (settings: VisualSettings) => void,
    private storage?: Pick<Storage, 'setItem'>,
  ) {
    const dialog = this.dialog;
    dialog.className = 'graphics-menu';
    dialog.setAttribute('aria-labelledby', 'graphics-title');
    dialog.innerHTML =
      '<div class="graphics-heading"><div><small>MAKE IT YOURS</small><h2 id="graphics-title">Graphics & atmosphere</h2></div><button type="button" id="close-graphics" aria-label="Close graphics settings">×</button></div><p>Quality controls detail and performance. Image style controls the look.</p><div class="graphics-presets"><label>Quality<select name="quality"><option value="low">Low · faster</option><option value="medium">Medium · balanced</option><option value="high">High · richer detail</option></select></label><label>Image style<select name="style"><option value="natural">Natural</option><option value="vivid">Vivid</option><option value="saturated">Saturated</option><option value="energetic">Energetic</option><option value="filmic">Filmic</option></select></label></div><div class="graphics-controls"></div><p class="graphics-note">Changes preview immediately and are saved on this device. Vegetation updates when you release its slider. Depth of field focuses on your vehicle.</p><button type="button" id="reset-graphics">Restore defaults</button>';
    const controls = dialog.querySelector('.graphics-controls')!;
    const sections = [
      [
        'Color & light',
        [
          ['exposure', 'Exposure', 0.5, 1.8, 0.01],
          ['contrast', 'Contrast', 0.7, 1.6, 0.01],
          ['saturation', 'Saturation', -70, 80, 1],
          ['bloom', 'Sunlight bloom', 0, 0.7, 0.01],
          ['vignette', 'Vignette', 0, 0.6, 0.01],
        ],
      ],
      [
        'Clarity & depth',
        [
          ['sharpness', 'Sharpness', 0, 0.6, 0.01],
          ['depthOfField', 'Depth of field', 0, 1, 0.01],
          ['atmosphere', 'Distance haze', 0, 2, 0.05],
          ['occlusion', 'Ambient occlusion', 0, 2, 0.05],
        ],
      ],
      [
        'World',
        [
          ['vegetation', 'Vegetation density', 1, 4, 0.1],
          ['waterMotion', 'Water movement', 0, 2, 0.05],
          ['waterBlue', 'Water blue', 0.3, 1.5, 0.05],
        ],
      ],
    ] as const;
    for (const [title, sliders] of sections) {
      const section = document.createElement('fieldset');
      section.innerHTML = `<legend>${title}</legend>`;
      for (const [key, label, min, max, step] of sliders) {
        const row = document.createElement('label');
        row.className = 'graphics-slider';
        row.innerHTML = `<span>${label}<output data-value="${key}"></output></span><input name="${key}" type="range" min="${min}" max="${max}" step="${step}">`;
        const input = row.querySelector('input')!;
        input.setAttribute('aria-label', label);
        input.addEventListener(key === 'vegetation' ? 'change' : 'input', () => {
          settings[key] = Number(input.value);
          this.changed();
        });
        section.append(row);
      }
      controls.append(section);
    }
    const aa = document.createElement('fieldset');
    aa.innerHTML =
      '<legend>Antialiasing</legend><label>MSAA<select name="msaa"><option value="1">Off</option><option value="4">4× MSAA (where supported)</option></select></label><label class="graphics-toggle"><input name="fxaa" type="checkbox"> FXAA edge smoothing</label>';
    controls.append(aa);
    dialog
      .querySelector('[name="quality"]')!
      .addEventListener('change', (event) =>
        this.setQuality((event.target as HTMLSelectElement).value as GraphicsPreset),
      );
    dialog.querySelector('[name="style"]')!.addEventListener('change', (event) => {
      settings.style = (event.target as HTMLSelectElement).value as ImageStyle;
      Object.assign(settings, imageStyles[settings.style]);
      this.changed();
    });
    dialog.querySelector('[name="msaa"]')!.addEventListener('change', (event) => {
      settings.msaa = Number((event.target as HTMLSelectElement).value);
      this.changed();
    });
    dialog.querySelector('[name="fxaa"]')!.addEventListener('change', (event) => {
      settings.fxaa = (event.target as HTMLInputElement).checked;
      this.changed();
    });
    dialog.querySelector('#close-graphics')!.addEventListener('click', () => dialog.close());
    dialog.querySelector('#reset-graphics')!.addEventListener('click', () => {
      Object.assign(settings, defaultVisualSettings);
      this.changed();
    });
    dialog.addEventListener('keydown', (event) => event.stopPropagation());
    document.body.append(dialog);
    const button = document.createElement('button');
    button.textContent = 'GRAPHICS';
    button.setAttribute('aria-label', 'Graphics settings');
    button.onclick = () => dialog.showModal();
    document.querySelector('.utilities')!.prepend(button);
    this.refresh();
  }
  setQuality(quality: GraphicsPreset): void {
    this.settings.quality = quality;
    Object.assign(this.settings, qualityDefaults[quality]);
    this.changed();
  }
  private changed(): void {
    this.refresh();
    this.apply(this.settings);
    try {
      this.storage?.setItem('brumbrum.graphics.v1', JSON.stringify(this.settings));
    } catch {
      /* Optional persistence. */
    }
  }
  private refresh(): void {
    for (const input of this.dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      'input,select',
    )) {
      const value = this.settings[input.name as keyof VisualSettings];
      if (input instanceof HTMLInputElement && input.type === 'checkbox')
        input.checked = Boolean(value);
      else input.value = String(value);
    }
    for (const output of this.dialog.querySelectorAll<HTMLOutputElement>('output')) {
      const value = this.settings[output.dataset.value as keyof VisualSettings];
      output.value =
        typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value);
    }
    const footer = document.querySelector<HTMLSelectElement>('#quality');
    if (footer) footer.value = this.settings.quality;
  }
}
