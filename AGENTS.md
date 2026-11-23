# Block City engineering rules

- This directory is a standalone Vite/TypeScript game inside a different existing project. Work here; do not edit Crossfire files or its deployment workflow for Block City tasks.
- Read `PHYSICS.md` before modifying dynamics. Physics correctness, measurable behavior, and simplicity take priority over graphics.
- Rapier owns every physical transform and velocity. Never steer by changing yaw, accelerate with velocity assignment, constrain roll/pitch to hide tuning errors, or auto-upright a car. Explicit reset and test initial conditions are exceptions.
- `Simulation.step` is the sole world-step coordinator. Controller update precedes `world.step`, once per fixed 1/120-second tick. Keep bounded catch-up, pause/focus clearing, timestamped input, and render interpolation intact.
- Simulation modules must not import Three.js, DOM APIs, or wall-clock time. Renderers consume `VehicleVisualState`; they do not mutate it. Keep new vehicle state per instance.
- Verify signatures in installed `node_modules/@dimforge/rapier3d-compat/dist/**/*.d.ts`. The forward-axis setter is `controller.setIndexForwardAxis = 2`; brakes take impulse, so convert N to N s with `dt`. Do not use old tutorials as API authority.
- All vehicle numbers belong in `src/config/vehicle.ts` with verified units. Suspension stiffness/damping are normalized by TOTAL chassis mass. Chassis colliders have zero density because body mass/inertia are explicit. Do not double-count mass or resistance.
- World geometry and colliders come from the same `BoxSpec`. Cosmetic road paint has no collider. Solid surfaces must have one.
- Document stock raycast limitations, especially lateral roll reduction, missing physical wheel volume, and incomplete reactions on dynamic ground. Do not label engine friction tuning as measured tire coefficients.
- Reset recreates its controller and clears interpolation/input state. Dispose controllers before bodies/world; release GPU objects and listeners. Debug rendering must not accumulate GPU buffers.
- Run `npm test` and `npm run build` for dynamics changes. Run `npm run validate:physics` for updated measured values, and `npm run test:browser` for input/rendering/deployment changes. Investigate failures before changing tolerances. Keep test fixtures physically interpretable.
- Exact dependency versions and lockfile are intentional. Re-run the full physics suite after upgrading Rapier. Standard compat is not an enhanced-determinism multiplayer guarantee.
- Deploy automatically on pushes to main. Do not push, publish, or manually run the Pages deployment without explicit user authorization. The included workflow is for this project at the root of its own repository.
