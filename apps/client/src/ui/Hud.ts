import type { AbstractEngine } from '@babylonjs/core';
import type { Motorcycle } from '../vehicles/Motorcycle';
import type { TerrainWorld } from '../world/TerrainWorld';
import {
  jumps,
  lakes,
  boundary,
  sectorAt,
  snowAmount,
  snowRegion,
  rivers,
  riverCenterZ,
  railwayPoint,
  timberStructures,
} from '@brumbrum/world-format';
import type { InputManager } from '../input/InputManager';
import type { TrickScore } from '../scoring/TrickScore';
import type { VehicleKind } from '../vehicles/VehicleModels';
export class Hud {
  private speed: HTMLElement;
  private state: HTMLElement;
  private diagnostics: HTMLElement;
  private map: CanvasRenderingContext2D;
  private elapsed = 0;
  private refresh = 0;
  private inputDetails = '';
  private lastBankedTotal = 0;
  private lastVehicle = '';
  private lastRegion = '';
  private airHold = 0;
  private airResetId = -1;
  debug = false;
  constructor(
    renderer: string,
    actions: {
      reset: () => void;
      newRun: () => void;
      vehicle: (kind: VehicleKind) => void;
      camera: () => void;
      travel: (place: string) => void;
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
      <footer><div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> RIDE</span><span><kbd>SPACE</kbd> PRELOAD</span><button id="reset"><kbd>R</kbd> RESET</button><button id="camera"><kbd>C</kbd> CAMERA</button></div><div class="utilities"><button id="sound">SOUND OFF</button><select id="quality" aria-label="Graphics quality"><option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high" selected>HIGH</option></select><button id="debug">F3 · DEBUG</button><span class="build">${renderer} · ALPHA 0.2</span></div></footer>
      <div id="controller-status" class="controller-status">GAMEPAD READY · PRESS A CONTROLLER BUTTON</div><section id="help-panel" hidden><button id="close-help" aria-label="Close controls">×</button><div class="eyebrow">GET OUT THERE</div><h2>Make your own line.</h2><p>Accelerate toward the yellow flags. The first jump is straight ahead.</p><dl><dt>W</dt><dd>Throttle</dd><dt>S</dt><dd>Main brake</dd><dt>A / D</dt><dd>Steer + lean / air tilt</dd><dt>Space</dt><dd>Hold to preload, release to jump</dd><dt>↑ / ↓</dt><dd>Weight shift / pitch / wheelie</dd><dt>← / →</dt><dd>Extra lean / air roll</dd><dt>Shift</dt><dd>Rear brake / slide</dd><dt>R / Home</dt><dd>Safe reset / return to start</dd><dt>C / F3</dt><dd>Cycle camera / diagnostics</dd></dl><p>Hold ↓ with throttle for a wheelie. Use Space or gamepad A to charge preload; release to jump. Release and reapply A/D or the left stick after takeoff to tilt sideways. Held steering stays stable over bumps. B: bail out.<br>Xbox: RT throttle · LT brake · left stick steer/weight · right stick camera orbit · A hold/release preload (except truck) · D-pad left/right lean · LB rear brake · Y camera · R3 reset · Menu help. Press a gamepad button to connect. Click once for audio if the browser requires it.</p></section>
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
    const panel = document.querySelector('#help-panel')!;
    const destinations = document.createElement('div');
    destinations.className = 'destinations';
    for (const [place, label] of [
      ['start', 'Start'],
      ['lake', 'Mirror Lake'],
      ['wall', 'Boundary wall'],
      ['snow', 'Snow tracks'],
      ['station', 'Train station'],
      ['creek', 'River crossing'],
      ['timber', 'Timber jumps'],
    ]) {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => {
        actions.travel(place);
        (panel as HTMLElement).hidden = true;
        (document.querySelector('#game') as HTMLCanvasElement).focus();
      });
      destinations.append(button);
    }
    panel.append(destinations);
    const garage = document.createElement('label');
    garage.className = 'garage';
    garage.innerHTML =
      'VEHICLE <select aria-label="Vehicle"><option value="bike">Motocross</option><option value="atv">ATV</option><option value="monster">Monster truck</option><option value="snowmobile">Snowmobile · snow tracks</option></select>';
    garage.querySelector('select')!.addEventListener('change', (event) => {
      actions.vehicle((event.target as HTMLSelectElement).value as VehicleKind);
      (document.querySelector('#game') as HTMLCanvasElement).focus();
    });
    document.querySelector('#ui')!.append(garage);
    const run = document.createElement('section');
    run.className = 'score-panel';
    run.innerHTML =
      '<div class="eyebrow">YOUR RUN <span id="run-clock">0:00</span></div><strong id="run-score">0</strong><span class="score-unit">PTS</span><div id="trick-score">FIND YOUR FIRST JUMP</div><div class="jump-record"><span>JUMP <b id="current-jump">0.0 m</b></span><span>RUN BEST <b id="longest-jump">0.0 m</b></span><span>PERSONAL BEST <b id="personal-jump">0.0 m</b></span></div><button id="new-run">NEW RUN</button>';
    document.querySelector('#ui')!.append(run);
    document.querySelector('#new-run')!.addEventListener('click', actions.newRun);
    const toast = document.createElement('section');
    toast.className = 'trick-toast';
    toast.hidden = true;
    toast.innerHTML =
      '<div class="trick-toast-label">LANDED IT!</div><strong id="last-trick-points"></strong><div id="last-trick-name"></div>';
    const trickCluster = document.createElement('div');
    trickCluster.className = 'trick-cluster';
    const air = document.createElement('section');
    air.className = 'airtime-badge';
    air.hidden = true;
    air.setAttribute('aria-label', 'Live jump measurements');
    air.innerHTML =
      '<span>AIRTIME</span><div><strong id="live-airtime">0.00</strong><small>s</small></div><div class="jump-metrics"><span>DISTANCE <b id="live-jump-distance">0.0 m</b></span><span><em id="jump-height-label">HEIGHT</em> <b id="live-jump-height">0.0 m</b></span></div>';
    trickCluster.append(toast, air);
    document.querySelector('#ui')!.append(trickCluster);
  }
  scoring(score: TrickScore): void {
    const toast = document.querySelector('.trick-toast') as HTMLElement;
    if (score.total === 0) {
      toast.hidden = true;
      this.lastBankedTotal = 0;
    } else if (score.total !== this.lastBankedTotal && score.lastAward > 0) {
      this.lastBankedTotal = score.total;
      toast.hidden = false;
      document.getElementById('last-trick-points')!.textContent =
        `+${score.lastAward.toLocaleString()}`;
      document.getElementById('last-trick-name')!.textContent = score.message.replace(
        / · \+\d+$/,
        '',
      );
      toast.animate(
        [
          { opacity: 0, transform: 'scale(0.45) rotate(-9deg)' },
          { opacity: 1, transform: 'scale(1.15) rotate(3deg)', offset: 0.6 },
          { opacity: 1, transform: 'scale(1) rotate(-2deg)' },
        ],
        { duration: 550, easing: 'cubic-bezier(.2,.9,.25,1)' },
      );
    }
    const put = (id: string, value: string) => {
      const el = document.getElementById(id)!;
      if (el.textContent !== value) el.textContent = value;
    };
    put(
      'run-clock',
      `${Math.floor(score.elapsed / 60)}:${String(Math.floor(score.elapsed % 60)).padStart(2, '0')}`,
    );
    put('run-score', score.total.toLocaleString());
    if (score.jumpInProgress) {
      put('live-jump-distance', score.currentJump.toFixed(1) + ' m');
      put('live-jump-height', score.currentHeight.toFixed(1) + ' m');
      put('jump-height-label', 'HEIGHT');
    } else if (this.airHold > 0) {
      put('live-jump-height', score.peakHeight.toFixed(1) + ' m');
      put('jump-height-label', 'PEAK HEIGHT');
    }
    put('current-jump', (score.currentJump || score.lastJump).toFixed(1) + ' m');
    put('longest-jump', score.longestJump.toFixed(1) + ' m');
    put('personal-jump', score.personalBest.toFixed(1) + ' m');
    put(
      'trick-score',
      score.pending > 30
        ? `${score.tricks.join(' + ') || 'AIRTIME'} · ${score.pending.toLocaleString()} PENDING`
        : score.message,
    );
  }
  ready(): void {
    document.querySelector('#loading')?.remove();
  }
  sound(enabled: boolean, muted = false): void {
    const button = document.querySelector('#sound')!;
    const label = enabled ? 'SOUND ON' : muted ? 'SOUND OFF' : 'ENABLE SOUND';
    if (button.textContent !== label) button.textContent = label;
  }
  toggleHelp(): void {
    const panel = document.querySelector('#help-panel') as HTMLElement;
    panel.hidden = !panel.hidden;
  }
  inputStatus(input: InputManager): void {
    const status = document.querySelector('#controller-status');
    if (!status) return;
    const pad = input.gamepad.active;
    const a = input.actions;
    this.inputDetails = `THROTTLE  ${a.throttle.toFixed(2)} / BRAKE ${a.brake.toFixed(2)}\nSTEER     ${a.steer.toFixed(2)} / PITCH ${a.pitch.toFixed(2)}`;
    const label = pad
      ? `GAMEPAD CONNECTED · ${pad.id.split('(')[0].trim()}${pad.mapping === 'standard' ? '' : ' · CHECK MAPPING'}`
      : input.gamepadError || 'GAMEPAD READY · PRESS A CONTROLLER BUTTON';
    if (status.textContent !== label) status.textContent = label;
  }
  update(dt: number, bike: Motorcycle, world: TerrainWorld, engine: AbstractEngine): void {
    const air = document.querySelector('.airtime-badge') as HTMLElement;
    if (this.airResetId !== bike.resetId || bike.crashed || bike.submerged) {
      this.airResetId = bike.resetId;
      this.airHold = 0;
    } else if (!bike.grounded && bike.airtime > 0.05) {
      this.airHold = 1.5;
      const readout = document.getElementById('live-airtime')!;
      const value = bike.airtime.toFixed(2);
      if (readout.textContent !== value) readout.textContent = value;
    } else this.airHold = Math.max(0, this.airHold - dt);
    air.hidden = this.airHold === 0;
    air.classList.toggle('landed', bike.grounded);
    this.elapsed += dt;
    this.refresh += dt;
    if (this.refresh < 0.1) return;
    this.refresh = 0;
    if (this.lastVehicle !== bike.kind) {
      this.lastVehicle = bike.kind;
      document.querySelector('.bike-label')!.innerHTML =
        `<span>${{ bike: '250 MX', atv: 'ATV', monster: 'MONSTER V8', snowmobile: 'SNOWMOBILE' }[bike.kind]}</span><i>●</i><span id="surface"></span>`;
    }
    const region = snowAmount(bike.position.x, bike.position.z) > 0.45 ? 'snow' : 'forest';
    if (region !== this.lastRegion) {
      this.lastRegion = region;
      document.querySelector('.location h1')!.innerHTML =
        region === 'snow'
          ? 'Frost Ridge<span>Find your winter line.</span>'
          : 'Pine Valley<span>National Playground.</span>';
      document.querySelector('.location .eyebrow')!.textContent =
        region === 'snow' ? 'THE SNOW HIGHLANDS' : 'THE FOREST HIGHLANDS';
    }
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
      ? ({ standing: 'GETTING BACK UP', running: 'BACK TO THE VEHICLE', lifting: 'PICKING IT UP' }[
          bike.recoveryPhase
        ] ?? 'WIPEOUT · RECOVERING') + ' · R / R3 TO SKIP'
      : bike.skimming
        ? 'WATER SKIM · KEEP THE THROTTLE OPEN'
        : bike.submerged
          ? 'ENGINE FLOODED · RETURNING TO SHORE'
          : bike.preloadCharge > 0.15
            ? `PRELOAD ${Math.round(bike.preloadCharge * 100)}% · RELEASE TO LIFT`
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
        )}\nSURFACE   ${bike.surface}\nCONTACT   R:${bike.contacts[0]} F:${bike.contacts[1]}\nSPRINGS   ${bike.compression.map((n) => n.toFixed(3)).join(' / ')} m\nSECTOR    ${s.x},${s.z}\nSTREAMED  ${world.loadedCount} / COLLISION ${world.collisionCount}\nBEST AIR  ${bike.bestAir.toFixed(2)} s\n${this.inputDetails}\nFLOOR FIX ${bike.floorRecoveries} / RETURNS ${bike.boundaryLaunches}\nRAGDOLL   ${bike.visual.riderRig.active ? 'ACTIVE' : 'RIDING'}\nNETWORK   See MULTIPLAYER arena status\n[F4] terrain wireframe`;
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
    c.strokeStyle = '#dde9ed';
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2,
        r = 380 + 35 * Math.sin(a * 3) + 24 * Math.sin(a * 5);
      c.lineTo((snowRegion.x + Math.sin(a) * r) * scale, -(snowRegion.z + Math.cos(a) * r) * scale);
    }
    c.stroke();
    c.fillStyle = '#4a899f';
    for (const lake of lakes) {
      c.beginPath();
      c.ellipse(
        lake.x * scale,
        -lake.z * scale,
        lake.rx * scale,
        lake.rz * scale,
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
    c.strokeStyle = '#e5cf9b';
    for (const river of rivers) {
      c.strokeStyle = '#4a899f';
      c.lineWidth = river.halfWidth * 2 * scale;
      c.beginPath();
      for (let x = river.startX; x <= river.endX; x += 15)
        c.lineTo(x * scale, -riverCenterZ(river, x) * scale);
      c.stroke();
    }
    c.strokeStyle = '#d0b49a';
    c.lineWidth = 2;
    c.setLineDash([4, 3]);
    c.beginPath();
    for (let i = 0; i <= 180; i++) {
      const p = railwayPoint((i / 180) * Math.PI * 2);
      c.lineTo(p.x * scale, -p.z * scale);
    }
    c.stroke();
    c.setLineDash([]);
    for (const structure of timberStructures) {
      c.fillStyle = '#e3b876';
      c.fillRect(structure.x * scale - 3, -structure.z * scale - 3, 6, 6);
    }
    c.strokeStyle = '#e5cf9b';
    c.lineWidth = 4;
    c.strokeRect(
      -boundary.extent * scale,
      -boundary.extent * scale,
      boundary.extent * 2 * scale,
      boundary.extent * 2 * scale,
    );
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
