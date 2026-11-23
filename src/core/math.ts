// Simulation math has no dependency on the renderer.
export interface Vec3 { x: number; y: number; z: number }
export interface Quat extends Vec3 { w: number }
export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const identity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const approach = (v: number, target: number, amount: number) => v + clamp(target - v, -amount, amount);
export const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export function rotate(q: Quat, v: Vec3, out: Vec3 = vec()): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  out.x = v.x + q.w * tx + q.y * tz - q.z * ty;
  out.y = v.y + q.w * ty + q.z * tx - q.x * tz;
  out.z = v.z + q.w * tz + q.x * ty - q.y * tx;
  return out;
}
