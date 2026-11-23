import { identity, vec, type Quat, type Vec3 } from '../core/math';
import type { Pose } from '../vehicles/types';

export interface BoxSpec {
  id: string; size: Vec3; position: Vec3; rotation?: Quat;
  color: number; collider: boolean; mass?: number; friction?: number;
}
export interface MapSpec { boxes: BoxSpec[]; spawn: Pose }
export function box(id: string, size: Vec3, position: Vec3, color = 0x7c858a, collider = true): BoxSpec {
  return { id, size, position, color, collider };
}
export function flatMap(size = 2000): MapSpec {
  return { spawn: { position: vec(0, 0.95, 0), rotation: identity() },
    boxes: [box('ground', vec(size, 1, size), vec(0, -0.5, 0), 0x68756b)] };
}
export function cityMap(): MapSpec {
  const map = flatMap(340);
  map.spawn.position = vec(3.3, 0.95, -65);
  const b = map.boxes;
  // Streets are paint on the shared ground collider. Raised surfaces have their own colliders.
  for (const road of [-72, -24, 24, 72]) {
    b.push(box(`road-x-${road}`, vec(14, 0.015, 180), vec(road, 0.008, 0), 0x383f45, false));
    b.push(box(`road-z-${road}`, vec(180, 0.015, 14), vec(0, 0.01, road), 0x383f45, false));
  }
  // Main avenue and the east test apron.
  b.push(box('avenue', vec(14, 0.015, 220), vec(0, 0.009, 0), 0x383f45, false));
  b.push(box('test-apron', vec(62, 0.015, 150), vec(115, 0.009, 0), 0x444c52, false));
  b.push(box('test-access', vec(40, 0.015, 14), vec(91, 0.012, -24), 0x383f45, false));
  let index = 0;
  for (const x of [-48, 0, 48]) for (const z of [-48, 0, 48]) {
    // The center blocks split around the extra through avenue.
    for (const cx of x === 0 ? [-11.5, 11.5] : [x]) {
      const width = x === 0 ? 7 : 31;
      b.push(box(`sidewalk-${index}`, vec(width, 0.12, 32), vec(cx, 0.06, z), 0x969d9f));
      const height = 6 + (index * 7 % 13);
      b.push(box(`building-${index}`, vec(width - 3, height, 24), vec(cx, 0.12 + height / 2, z),
        [0x77838a, 0x899398, 0x6b777e][index % 3]));
      index++;
    }
  }
  // Dashed markings: render-only, no stacked coplanar collision surfaces.
  for (const x of [-72, -24, 0, 24, 72]) for (let z = -84; z <= 84; z += 8) {
    if ([-72, -24, 24, 72].some(c => Math.abs(z - c) < 9)) continue;
    b.push(box(`stripe-${x}-${z}`, vec(0.13, 0.006, 3), vec(x, 0.024, z), 0xb7bbb6, false));
  }
  // 8-degree ramp, top starts at grade and rises ~1.4 m over 10 m.
  const angle = -8 * Math.PI / 180;
  b.push({ ...box('ramp', vec(6, 0.25, 10), vec(107, 0.57, 18), 0x9ba6a8),
    rotation: { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) } });
  b.push(box('low-curb', vec(7, 0.08, 1), vec(124, 0.04, 0), 0xb5b8b1));
  b.push(box('test-wall', vec(20, 2.5, 0.5), vec(117, 1.25, 65), 0x808b90));
  for (let i = 0; i < 3; i++) b.push({ ...box(`movable-${i}`, vec(1, 1, 1), vec(121 + i * 2, 0.55, 38), 0xb78a57), mass: 65 });
  for (const x of [-162, 162]) b.push(box(`edge-x-${x}`, vec(1, 1.4, 325), vec(x, 0.7, 0), 0x737e82));
  for (const z of [-162, 162]) b.push(box(`edge-z-${z}`, vec(325, 1.4, 1), vec(0, 0.7, z), 0x737e82));
  return map;
}
