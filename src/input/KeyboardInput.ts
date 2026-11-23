import { InputTimeline, type DriveKey } from './InputTimeline';
const driveKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space']);
const actionKeys = new Set(['KeyR', 'KeyC', 'KeyP', 'F3']);
export class KeyboardInput {
  readonly timeline = new InputTimeline();
  private readonly abort = new AbortController();
  constructor(time: (timestamp: number) => number, action: (key: string) => void, blur: () => void) {
    const key = (e: KeyboardEvent, down: boolean) => {
      if (!driveKeys.has(e.code) && !actionKeys.has(e.code)) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (e.repeat) return;
      if (driveKeys.has(e.code)) this.timeline.enqueue(time(e.timeStamp), e.code as DriveKey, down);
      else if (down) action(e.code);
    };
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', e => key(e, true), options);
    window.addEventListener('keyup', e => key(e, false), options);
    window.addEventListener('blur', () => { this.timeline.clear(); blur(); }, options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.timeline.clear(); blur(); }
    }, options);
  }
  dispose() { this.abort.abort(); this.timeline.clear(); }
}
