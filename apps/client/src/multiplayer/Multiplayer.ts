import type { Motorcycle } from '../vehicles/Motorcycle';
import type { TrickScore } from '../scoring/TrickScore';
import { RemotePlayers } from './RemotePlayers';

/** Room transport keeps local physics immediate; remote rendering uses buffered snapshots. */
export class Multiplayer {
  readonly dialog = document.createElement('dialog');
  private socket?: WebSocket;
  private id = '';
  private room = '';
  private sequence = 0;
  private elapsed = 0;
  private vehicle?: Motorcycle;
  private peerPosition?: number[];
  private status: HTMLElement;
  private roster: HTMLElement;
  private invite: HTMLInputElement;
  private name: HTMLInputElement;
  private address: HTMLInputElement;
  private button: HTMLButtonElement;
  private members: { id: string; name: string }[] = [];
  constructor(private remotes: RemotePlayers) {
    const dialog = this.dialog;
    dialog.className = 'graphics-menu multiplayer-menu';
    dialog.setAttribute('aria-labelledby', 'multiplayer-title');
    dialog.innerHTML =
      '<div class="graphics-heading"><div><small>RIDE TOGETHER</small><h2 id="multiplayer-title">Multiplayer arena</h2></div><button aria-label="Close multiplayer">×</button></div><p data-status role="status">Create a room and invite up to five friends.</p><label>Your name<input name="player" maxlength="24" value="Rider"></label><div class="room-actions"><button data-create>Create room</button><button data-leave disabled>Leave room</button></div><label>Invitation address<input name="address" type="url"></label><p class="graphics-note">Use an address your friends can reach. A local network address works on the same Wi-Fi; internet play needs the game server hosted publicly.</p><label>Invitation link<input name="invite" readonly></label><button data-copy disabled>Copy invitation</button><div data-roster aria-live="polite"></div><p class="graphics-note">Freeride scores and longest jumps are shared for this room. Results are reported by each player.</p>';
    this.status = dialog.querySelector('[data-status]')!;
    this.roster = dialog.querySelector('[data-roster]')!;
    this.invite = dialog.querySelector('[name="invite"]')!;
    this.name = dialog.querySelector('[name="player"]')!;
    this.address = dialog.querySelector('[name="address"]')!;
    this.address.value = location.origin;
    try {
      this.name.value = localStorage.getItem('brumbrum.player-name') || 'Rider';
    } catch {}
    dialog
      .querySelector('[aria-label="Close multiplayer"]')!
      .addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-create]')!.addEventListener('click', () => this.connect());
    dialog.querySelector('[data-leave]')!.addEventListener('click', () => this.leave());
    dialog.querySelector('[data-copy]')!.addEventListener('click', () => void this.copyInvite());
    const meet = document.createElement('button');
    meet.textContent = 'Meet riders';
    meet.disabled = true;
    meet.dataset.meet = '';
    meet.onclick = () => {
      if (this.peerPosition && this.vehicle) {
        this.vehicle.travelTo(this.peerPosition[0] + 8, this.peerPosition[2] - 8);
        dialog.close();
      }
    };
    dialog.querySelector('.room-actions')!.append(meet);
    this.address.addEventListener('input', () => this.updateInvite());
    dialog.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.append(dialog);
    this.button = document.createElement('button');
    this.button.textContent = 'MULTIPLAYER';
    this.button.onclick = () => dialog.showModal();
    document.querySelector('.utilities')!.prepend(this.button);
    if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
      void fetch('/api/network')
        .then((r) => r.json())
        .then((data) => {
          if (
            Array.isArray(data.addresses) &&
            typeof data.addresses[0] === 'string' &&
            this.address.value === location.origin
          ) {
            const url = new URL(location.origin);
            url.hostname =
              data.addresses.find((ip: string) =>
                /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip),
              ) ?? data.addresses[0];
            this.address.value = url.origin;
            this.updateInvite();
          }
        })
        .catch(() => {});
    const room = new URL(location.href).searchParams.get('room');
    if (room) {
      dialog.showModal();
      this.connect(room);
    }
    window.addEventListener('pagehide', () => this.socket?.close());
  }
  private connect(room?: string): void {
    this.leave(false);
    this.status.textContent = 'Connecting to arena…';
    const url = new URL('/multiplayer', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    this.socket = socket;
    this.sequence = 0;
    socket.onopen = () => {
      const name = this.name.value.trim() || 'Rider';
      try {
        localStorage.setItem('brumbrum.player-name', name);
      } catch {}
      socket.send(JSON.stringify({ type: 'join', name, ...(room ? { room } : {}) }));
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'welcome') {
        this.id = message.id;
        this.room = message.room;
        this.updateInvite();
        this.status.textContent = 'Connected. Share your invitation to ride together.';
        dialogButton(this.dialog, '[data-leave]').disabled = false;
        this.button.textContent = 'ARENA · ONLINE';
      } else if (message.type === 'room') {
        this.members = message.members;
        this.renderRoster([]);
      } else if (message.type === 'snapshot') {
        this.remotes.receive(message.players, this.id, message.time);
        this.peerPosition = message.players.find((player: { id: string }) => player.id !== this.id)
          ?.pose.position;
        dialogButton(this.dialog, '[data-meet]').disabled = !this.peerPosition;
        this.renderRoster(message.records ?? []);
      } else if (message.type === 'error') this.status.textContent = message.message;
    };
    socket.onerror = () => {
      this.status.textContent = 'Cannot reach the arena server. Start the server and try again.';
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.remotes.clear();
      this.id = '';
      this.room = '';
      this.updateInvite();
      this.button.textContent = 'MULTIPLAYER';
      dialogButton(this.dialog, '[data-leave]').disabled = true;
      if (!this.status.textContent?.startsWith('Cannot'))
        this.status.textContent =
          'Disconnected. Create a room or open your invitation again to reconnect.';
    };
  }
  private leave(notify = true): void {
    const old = this.socket;
    this.socket = undefined;
    old?.close();
    this.remotes.clear();
    this.peerPosition = undefined;
    dialogButton(this.dialog, '[data-meet]').disabled = true;
    this.id = '';
    this.room = '';
    this.members = [];
    this.updateInvite();
    this.roster.replaceChildren();
    this.button.textContent = 'MULTIPLAYER';
    dialogButton(this.dialog, '[data-leave]').disabled = true;
    if (notify) {
      this.status.textContent = 'You left the arena.';
      const url = new URL(location.href);
      url.searchParams.delete('room');
      history.replaceState(null, '', url);
    }
  }
  private updateInvite(): void {
    this.invite.value = '';
    if (this.room)
      try {
        const url = new URL(this.address.value);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        url.pathname = '/';
        url.search = '';
        url.hash = '';
        url.searchParams.set('room', this.room);
        this.invite.value = url.href;
      } catch {}
    dialogButton(this.dialog, '[data-copy]').disabled = !this.invite.value;
  }
  private async copyInvite() {
    try {
      await navigator.clipboard.writeText(this.invite.value);
      this.status.textContent = 'Invitation copied. Send it to your friends.';
    } catch {
      this.invite.focus();
      this.invite.select();
      this.status.textContent = 'Select and copy the invitation link above.';
    }
  }
  private renderRoster(
    records: { id: string; name: string; score: number; longestJump: number }[],
  ) {
    const title = document.createElement('h3');
    title.textContent = `Arena · ${this.members.length}/6 riders`;
    const list = document.createElement('ul');
    for (const member of this.members) {
      const record = records.find((r) => r.id === member.id),
        line = document.createElement('li');
      line.textContent = `${member.name}${member.id === this.id ? ' (you)' : ''} · ${Math.round(record?.score ?? 0)} pts · ${(record?.longestJump ?? 0).toFixed(1)} m best jump`;
      list.append(line);
    }
    this.roster.replaceChildren(title, list);
  }
  update(dt: number, vehicle: Motorcycle, score: TrickScore, steer: number): void {
    this.vehicle = vehicle;
    this.remotes.update();
    this.elapsed += dt;
    if (!this.id || this.socket?.readyState !== WebSocket.OPEN || this.elapsed < 0.05) return;
    this.elapsed = 0;
    if (this.socket.bufferedAmount > 16384) return;
    this.socket.send(
      JSON.stringify({
        type: 'state',
        sequence: ++this.sequence,
        pose: {
          position: vehicle.position.asArray(),
          rotation: vehicle.visual.chassis.rotationQuaternion!.asArray(),
          velocity: vehicle.velocity.asArray(),
          kind: vehicle.kind,
          steer,
          speed: vehicle.speed,
          crashed: vehicle.crashed,
          score: score.total,
          longestJump: score.longestJump,
          resetId: vehicle.resetId,
        },
      }),
    );
  }
}
function dialogButton(dialog: HTMLDialogElement, selector: string): HTMLButtonElement {
  return dialog.querySelector(selector)!;
}
