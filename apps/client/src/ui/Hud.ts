import type { AbstractEngine } from '@babylonjs/core';
import type { Motorcycle } from '../vehicles/Motorcycle';
import type { TerrainWorld } from '../world/TerrainWorld';
import { jumps, sectorAt } from '@brumbrum/world-format';
export class Hud {
  private speed: HTMLElement;
  private state: HTMLElement;
  private diagnostics: HTMLElement;
  private map: CanvasRenderingContext2D;
  private elapsed = 0;
  private refresh = 0;
  debug = false;
  constructor(
    renderer: string,
    actions: {
      reset: () => void;
      camera: () => void;
      sound: () => void;
      debug: () => void;
      quality: (v: string) => void;
    },
  ) {
    document.querySelector('#ui')!.innerHTML = `
      <header><div class="brand"><span class="brand-mark">b<span>↗</span></span><div>BRUMBRUM<small>GO FIND YOUR LIMIT.</small></div></div><div class="session"><i></i> FREERIDE <span>/</span> PINE VALLEY <b>01</b></div><button id="help" class="icon-button" aria-label="Show controls">?</button></header>
      <aside class="location"><div class="eyebrow">THE FOREST HIGHLANDS</div><h1>Pine Valley<span>National Playground.</span></h1><p><span class="sun">☀</span> 18° <span class="divider">/</span> CLEAR SKIES <span class="divider">/</span> ENDLESS POSSIBILITIES</p></aside>
      <section class="ride-card"><div class="eyebrow"><span class="line"></span> YOUR NEXT SEND</div><h2>First flight <span>↗</span></h2><p>Follow the dirt. Find the yellow flags.</p><div class="route-meta"><span>NATURAL JUMP</span><b id="jump-distance">78 m</b></div></section>
      <section class="ride-status" id="ride-state">OPEN WORLD. OPEN THROTTLE.</section>
      <aside class="map-panel"><div class="map-heading"><span>PINE VALLEY</span><span>N ↑</span></div><canvas id="minimap" width="230" height="180" aria-label="Local terrain map with rider and jump locations"></canvas><div class="map-bottom"><i></i> FREE TO ROAM <span id="distance">0.00 KM</span></div></aside>
      <div class="telemetry"><div class="gear"><span>GEAR</span><b id="gear">N</b></div><div class="speed"><b id="speed">00</b><span>KM/H</span></div><div class="rpm"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="bike-label"><span>250</span> MX <i>●</i> <span id="surface">HARD DIRT</span></div></div>
      <footer><div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> RIDE</span><span><kbd>SPACE</kbd> PRELOAD</span><button id="reset"><kbd>R</kbd> RESET</button><button id="camera"><kbd>C</kbd> CAMERA</button></div><div class="utilities"><button id="sound">SOUND OFF</button><select id="quality" aria-label="Graphics quality"><option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high" selected>HIGH</option></select><button id="debug">F3 · DEBUG</button><span class="build">${renderer} · ALPHA 0.1</span></div></footer>
      <section id="help-panel" hidden><button id="close-help" aria-label="Close controls">×</button><div class="eyebrow">GET OUT THERE</div><h2>Make your own line.</h2><p>Accelerate toward the yellow flags. The first jump is straight ahead.</p><dl><dt>W / ↑</dt><dd>Throttle</dd><dt>S / ↓</dt><dd>Main brake</dd><dt>A D / ← →</dt><dd>Steer</dd><dt>Space</dt><dd>Suspension preload / hop</dd><dt>I / K</dt><dd>Air pitch forward / back</dd><dt>Shift</dt><dd>Rear brake / slide</dd><dt>R / Home</dt><dd>Safe reset / return to start</dd><dt>C / F3</dt><dd>Cycle camera / diagnostics</dd></dl><p>Gamepad: RT throttle · LT brake · left stick steer · right stick pitch · A preload · LB rear brake · Y camera · R3 reset.</p></section>
      <pre id="diagnostics" hidden></pre><div id="loading"><span class="brand-mark">b↗</span><h2>FIND YOUR FREEDOM.</h2><p>Preparing Pine Valley…</p></div>`;
    this.speed = document.querySelector('#speed')!;
    this.state = document.querySelector('#ride-state')!;
    this.diagnostics = document.querySelector('#diagnostics')!;
    this.map = (document.querySelector('#minimap') as HTMLCanvasElement).getContext('2d')!;
    document.querySelector('#reset')!.addEventListener('click', actions.reset);
    document.querySelector('#camera')!.addEventListener('click', actions.camera);
    document.querySelector('#sound')!.addEventListener('click', actions.sound);
    document.querySelector('#debug')!.addEventListener('click', actions.debug);
    document
      .querySelector('#quality')!
      .addEventListener('change', (e) => actions.quality((e.target as HTMLSelectElement).value));
    const help = document.querySelector('#help-panel') as HTMLElement;
    document.querySelector('#help')!.addEventListener('click', () => {
      help.hidden = !help.hidden;
    });
    document.querySelector('#close-help')!.addEventListener('click', () => {
      help.hidden = true;
    });
  }
  ready(): void {
    document.querySelector('#loading')?.remove();
  }
  sound(enabled: boolean): void {
    document.querySelector('#sound')!.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
  }
  update(dt: number, bike: Motorcycle, world: TerrainWorld, engine: AbstractEngine): void {
    this.elapsed += dt;
    this.refresh += dt;
    if (this.refresh < 0.1) return;
    this.refresh = 0;
    this.speed.textContent = String(Math.round(bike.speed * 3.6)).padStart(2, '0');
    document.querySelector('#gear')!.textContent =
      bike.speed < 0.8 ? 'N' : String(Math.min(5, Math.floor(bike.speed / 8) + 1));
    document.querySelector('#surface')!.textContent = bike.grounded
      ? bike.surface === 'dirt'
        ? 'HARD DIRT'
        : bike.surface.toUpperCase()
      : 'AIRBORNE';
    document.querySelector('#distance')!.textContent = `${(bike.distance / 1000).toFixed(2)} KM`;
    document.querySelector('#jump-distance')!.textContent =
      `${Math.round(Math.hypot(bike.position.x, bike.position.z - 90))} m`;
    this.state.textContent = bike.crashed
      ? 'THAT’S A WIPEOUT.  [R] RIDE AGAIN'
      : bike.airtime > 0.3
        ? `AIR TIME  /  ${bike.airtime.toFixed(2)} s`
        : bike.lastAir > 0.5
          ? `BACK ON EARTH  /  ${bike.lastAir.toFixed(2)} s AIRTIME`
          : 'OPEN WORLD. OPEN THROTTLE.';
    this.state.classList.toggle('crashed', bike.crashed);
    document
      .querySelectorAll('.rpm span')
      .forEach((el, i) => el.classList.toggle('active', i < Math.max(2, bike.speed / 3)));
    this.diagnostics.hidden = !this.debug;
    if (this.debug) {
      const s = sectorAt(bike.position.x, bike.position.z);
      this.diagnostics.textContent = `PHYSICS / HAVOK · 60 Hz\nFPS       ${engine.getFps().toFixed(0)} / ${(1000 / Math.max(1, engine.getFps())).toFixed(1)} ms\nPOSITION  ${bike.position
        .asArray()
        .map((n) => n.toFixed(1))
        .join(', ')}\nVELOCITY  ${bike.velocity
        .asArray()
        .map((n) => n.toFixed(1))
        .join(', ')}\nANGULAR   ${bike.angularVelocity
        .asArray()
        .map((n) => n.toFixed(2))
        .join(
          ', ',
        )}\nSURFACE   ${bike.surface}\nCONTACT   R:${bike.contacts[0]} F:${bike.contacts[1]}\nSPRINGS   ${bike.compression.map((n) => n.toFixed(3)).join(' / ')} m\nSECTOR    ${s.x},${s.z}\nSTREAMED  ${world.loadedCount} / COLLISION ${world.collisionCount}\nBEST AIR  ${bike.bestAir.toFixed(2)} s\nNETWORK   Offline vertical slice\n[F4] terrain wireframe`;
    }
    this.drawMap(bike);
  }
  private drawMap(bike: Motorcycle): void {
    const c = this.map,
      w = 230,
      h = 180,
      scale = 0.32;
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#1c322bcc';
    c.fillRect(0, 0, w, h);
    c.save();
    c.translate(w / 2 - bike.position.x * scale, h / 2 + bike.position.z * scale);
    c.strokeStyle = '#52705e';
    c.lineWidth = 0.5;
    for (let r = 30; r < 600; r += 30) {
      c.beginPath();
      c.ellipse(-65, -80, r * 0.8, r * 0.42, -0.6, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = '#b6b299';
    c.lineWidth = 2;
    c.beginPath();
    for (let z = -500; z < 1000; z += 5) {
      const x = Math.sin(z * 0.012) * 36 * Math.min(1, Math.max(0, (z - 110) / 100));
      c.lineTo(x * scale, -z * scale);
    }
    c.stroke();
    for (const j of jumps) {
      c.fillStyle = '#e3eb7c';
      c.fillRect(j.x * scale - 3, -j.z * scale - 3, 6, 6);
    }
    c.restore();
    c.save();
    c.translate(w / 2, h / 2);
    c.rotate(bike.yaw);
    c.fillStyle = '#eff896';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 6);
    c.lineTo(0, 3);
    c.lineTo(-5, 6);
    c.closePath();
    c.fill();
    c.restore();
  }
}
