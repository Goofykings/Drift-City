import { expect, test } from 'vitest';
import { FixedStepClock } from '../src/core/FixedStepClock';
import { InputTimeline } from '../src/input/InputTimeline';

test('stall debt is bounded, pause discards elapsed time, reset clears the accumulator', () => {
  const clock = new FixedStepClock(1 / 120, 6, 0.1);
  const dts: number[] = [];
  clock.advance(3, dt => dts.push(dt));
  expect(dts).toHaveLength(6); expect(dts.every(dt => dt === 1 / 120)).toBe(true);
  expect(clock.droppedSeconds).toBeCloseTo(2.95, 8); expect(clock.alpha).toBeLessThan(1);
  clock.setPaused(true); clock.advance(60, () => { throw Error('Paused clock stepped'); });
  clock.setPaused(false); clock.advance(1 / 120, dt => dts.push(dt)); expect(dts).toHaveLength(7);
  clock.reset(); expect(clock.tick).toBe(0); expect(clock.alpha).toBe(0); expect(clock.droppedSeconds).toBe(0);
});
test('input changes are timestamped, opposing keys cancel, clearing removes queued/held controls', () => {
  const input = new InputTimeline(); input.enqueue(0.5, 'KeyW', true); input.enqueue(0.6, 'KeyD', true); input.enqueue(0.6, 'KeyA', true);
  expect(input.sample(0.49).throttle).toBe(0); expect(input.sample(0.5).throttle).toBe(1);
  expect(input.sample(0.6).steering).toBe(0); input.clear(); expect(input.sample(10).throttle).toBe(0);
});
