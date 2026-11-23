import { neutralInput, type DriverInput } from '../vehicles/types';
export type DriveKey = 'KeyW' | 'KeyS' | 'KeyA' | 'KeyD' | 'Space';
interface InputEvent { time: number; key: DriveKey; down: boolean }
/** Timestamped transitions are sampled at simulation tick boundaries, not once per rendered frame. */
export class InputTimeline {
  private events: InputEvent[] = [];
  private held = new Set<DriveKey>();
  readonly state = neutralInput();
  enqueue(time: number, key: DriveKey, down: boolean) {
    this.events.push({ time, key, down });
    this.events.sort((a, b) => a.time - b.time);
  }
  sample(time: number): DriverInput {
    let consumed = 0;
    for (const event of this.events) {
      if (event.time > time + 1e-10) break;
      if (event.down) this.held.add(event.key); else this.held.delete(event.key);
      consumed++;
    }
    if (consumed) this.events.splice(0, consumed);
    this.state.throttle = Number(this.held.has('KeyW'));
    this.state.reverse = Number(this.held.has('KeyS'));
    this.state.steering = Number(this.held.has('KeyD')) - Number(this.held.has('KeyA'));
    this.state.handbrake = this.held.has('Space');
    return this.state;
  }
  clear() { this.events.length = 0; this.held.clear(); Object.assign(this.state, neutralInput()); }
}
