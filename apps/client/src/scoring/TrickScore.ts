export interface RideSample {
  grounded: boolean;
  crashed: boolean;
  speed: number;
  upright: number;
  pitchRate: number;
  yawRate: number;
  rollRate: number;
  resetId: number;
  returnId: number;
  x: number;
  y: number;
  z: number;
}
/** Local development score. Rotations integrate physical motion, never key presses. */
export class TrickScore {
  total = 0;
  elapsed = 0;
  pending = 0;
  lastAward = 0;
  message = 'FIND YOUR FIRST JUMP';
  tricks: string[] = [];
  currentJump = 0;
  lastJump = 0;
  longestJump = 0;
  personalBest = 0;
  private takeoff = { x: 0, y: 0, z: 0 };
  private lastGround = { x: 0, y: 0, z: 0 };
  private verticalTravel = 0;
  private get qualifies(): boolean {
    return this.air >= 0.7 && this.currentJump >= 10 && this.verticalTravel >= 1;
  }
  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const value = Number(storage?.getItem('brumbrum.longest-jump.v1'));
      if (Number.isFinite(value) && value > 0) this.personalBest = value;
    } catch {
      /* Storage can be disabled. */
    }
  }
  private active = false;
  private air = 0;
  private contactTime = 0;
  private entrySpeed = 0;
  private angles = [0, 0, 0];
  private trickPoints = 0;
  private resetId = 0;
  private returnId = 0;
  private blocked = false;
  private riding = false;
  private started = false;
  update(dt: number, sample: RideSample): void {
    if (sample.speed > 1) this.started = true;
    if (this.started) this.elapsed += dt;
    if (sample.resetId !== this.resetId || sample.returnId !== this.returnId) {
      this.cancel('JUMP RESET');
      this.blocked = true;
      this.resetId = sample.resetId;
      this.returnId = sample.returnId;
    }
    if (sample.crashed) {
      this.cancel('WIPEOUT · COMBO LOST');
      this.blocked = true;
      this.riding = false;
      return;
    }
    if (sample.grounded) {
      this.lastGround = { x: sample.x, y: sample.y, z: sample.z };
      this.riding = true;
      this.blocked = false;
      if (!this.active) return;
      this.contactTime += dt;
      // Debounce a wheel brushing the ground: settle the jump only on a stable landing.
      if (this.contactTime < 0.15) return;
      if (this.qualifies && sample.upright > 0.45) {
        const clean = sample.upright > 0.8 && sample.speed >= this.entrySpeed * 0.8;
        this.lastAward = Math.round(this.pending + (clean ? 250 : 0));
        this.total += this.lastAward;
        this.lastJump = this.currentJump;
        this.longestJump = Math.max(this.longestJump, this.lastJump);
        if (this.longestJump > this.personalBest) {
          this.personalBest = this.longestJump;
          try {
            this.storage?.setItem('brumbrum.longest-jump.v1', String(this.personalBest));
          } catch {
            /* Keep the session result if persistence is unavailable. */
          }
        }
        this.message = `${this.tricks.join(' + ') || 'AIRTIME'}${clean ? ' + CLEAN LANDING' : ' · LANDED'} · +${this.lastAward}`;
      }
      this.active = false;
      this.pending = 0;
      this.air = 0;
      this.currentJump = 0;
      return;
    }
    this.contactTime = 0;
    if (this.blocked || !this.riding) return;
    if (!this.active) {
      this.active = true;
      this.air = 0;
      this.entrySpeed = sample.speed;
      this.takeoff = { ...this.lastGround };
      this.tricks = [];
      this.angles = [0, 0, 0];
      this.trickPoints = 0;
      this.verticalTravel = 0;
    }
    this.air += dt;
    this.currentJump = Math.hypot(sample.x - this.takeoff.x, sample.z - this.takeoff.z);
    this.verticalTravel = Math.max(this.verticalTravel, Math.abs(sample.y - this.takeoff.y));
    const rates = [sample.pitchRate, sample.yawRate, sample.rollRate];
    for (let axis = 0; axis < 3; axis++) {
      this.angles[axis] += rates[axis] * dt;
      while (Math.abs(this.angles[axis]) >= Math.PI * 2) {
        const sign = Math.sign(this.angles[axis]);
        this.angles[axis] -= sign * Math.PI * 2;
        this.tricks.push(
          axis === 0 ? (sign > 0 ? 'FRONTFLIP' : 'BACKFLIP') : axis === 1 ? '360' : 'BARREL ROLL',
        );
        this.trickPoints += axis === 0 ? 1000 : axis === 1 ? 750 : 900;
      }
    }
    this.pending = this.qualifies ? Math.round(this.air * 100 + this.trickPoints) : 0;
  }
  private cancel(message: string): void {
    if (this.active) this.message = message;
    this.active = false;
    this.pending = 0;
    this.air = 0;
    this.contactTime = 0;
    this.tricks = [];
    this.riding = false;
    this.currentJump = 0;
  }
  newRun(): void {
    this.cancel('');
    this.total = 0;
    this.elapsed = 0;
    this.lastAward = 0;
    this.message = 'NEW RUN · NO TIME LIMIT';
    this.started = false;
    this.longestJump = 0;
    this.lastJump = 0;
  }
}
