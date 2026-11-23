/** Wall time only schedules whole simulation ticks. Excess time is discarded, never integrated. */
export class FixedStepClock {
  private accumulator = 0;
  tick = 0;
  droppedSeconds = 0;
  paused = false;
  constructor(readonly dt: number, readonly maxSteps = 12, readonly maxFrame = 0.1) {
    if (!(dt > 0) || !Number.isFinite(dt) || maxSteps < 1) throw new Error('Invalid simulation clock');
  }
  advance(elapsed: number, step: (dt: number, tick: number) => void): number {
    if (this.paused || !Number.isFinite(elapsed) || elapsed <= 0) return this.alpha;
    const accepted = Math.min(elapsed, this.maxFrame);
    this.droppedSeconds += elapsed - accepted;
    this.accumulator += accepted;
    let steps = 0;
    while (this.accumulator + 1e-10 >= this.dt && steps < this.maxSteps) {
      step(this.dt, this.tick);
      this.tick++;
      this.accumulator = Math.max(0, this.accumulator - this.dt);
      steps++;
    }
    if (this.accumulator >= this.dt) {
      const discarded = Math.floor((this.accumulator + 1e-10) / this.dt) * this.dt;
      this.droppedSeconds += discarded;
      this.accumulator = Math.max(0, this.accumulator - discarded);
    }
    return this.alpha;
  }
  get alpha() { return Math.min(1, this.accumulator / this.dt); }
  setPaused(value: boolean) { this.paused = value; this.clearDebt(); }
  clearDebt() { this.accumulator = 0; }
  reset() { this.clearDebt(); this.tick = 0; this.droppedSeconds = 0; }
}
