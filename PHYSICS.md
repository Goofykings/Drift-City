# Physics foundation

Implementation and measurements: November 22, 2026. This document describes the delivered model, including behavior that should be replaced before treating it as a realistic tire simulator.

## Engine selection

Selected: **TypeScript + Three.js + Rapier 3D + Vite**, using `@dimforge/rapier3d-compat@0.21.0`. Three.js owns presentation; Rapier owns dynamics. The compatibility build embeds its WASM and avoids deployment-path fetch problems.

The comparison below is a source/API evaluation, **not** a benchmark of all four engines. Numerical robustness still depends on geometry, mass ratios, timestep, and tuning; only the selected implementation was exercised here.

| Option | Rigid bodies / collision / vehicles | Browser, API, maintenance, and extension tradeoff |
| --- | --- | --- |
| Rapier | Rigid bodies, inertia, CCD, shape queries, and an integrated raycast vehicle controller. Appropriate for a practical game car with the approximations below. | Official WASM and typed JS APIs; current bindings and active core releases. Small adapter boundary makes replacement of wheel forces practical. Selected for integration quality and the user's preferred stack. [Overview](https://rapier.rs/), [vehicle API](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html). |
| Ammo.js / Bullet | Established Bullet rigid-body/collision implementation and `btRaycastVehicle` exposed through its bindings. Similar ray-wheel limitations; not automatically a more accurate tire model. | Emscripten build, C++/IDL-style API and explicit object lifetime management. Viable on static hosting, but more binding/lifetime integration work for this TypeScript project. A maintained Bullet core does not by itself establish the freshness of an arbitrary Ammo binary. [Official project](https://github.com/kripken/ammo.js), [binding surface](https://github.com/kripken/ammo.js/blob/main/ammo.idl). |
| cannon-es | Pure JS rigid bodies and a readable `RaycastVehicle`; useful for straightforward browser games. | TypeScript source and easy modification, no WASM startup. The published release history is much quieter than Rapier's. Its long-term large-scene performance/collision suitability would need separate benchmarking; no claim that it is intrinsically unstable. [Project](https://github.com/pmndrs/cannon-es), [vehicle source](https://github.com/pmndrs/cannon-es/blob/master/src/objects/RaycastVehicle.ts), [releases](https://github.com/pmndrs/cannon-es/releases). |
| JoltPhysics.js | Strong alternative: Jolt rigid-body system and vehicle constraints; core wheel collision testers include ray, sphere, and cylinder approaches. A serious candidate if wheel-volume interactions become central. | WASM, broad C++ interface exposure, multiple build flavors, and manual/reference-counted lifetimes. Rich vehicle facilities, with more binding complexity than this first version needs. Single-threaded builds fit static hosting; threaded builds need appropriate browser isolation. [JS project](https://github.com/jrouwe/JoltPhysics.js), [wheel collision interface](https://github.com/jrouwe/JoltPhysics/blob/master/Jolt/Physics/Vehicle/VehicleCollisionTester.h). |

All four can be used without a persistent backend on GitHub Pages. None supplies multiplayer synchronization merely by choosing it. Authoritative simulation, input sequencing, snapshots, reconciliation, and version control remain application work. No multiplayer subsystem is included.

### Version verification

The installed `.d.ts` files under `node_modules/@dimforge/rapier3d-compat/dist/` are the signature authority. The [current binding changelog](https://github.com/dimforge/rapier/blob/master/bindings/typescript/CHANGELOG.md) identifies JS 0.21.0 with Rust Rapier 0.36.0 and the repository move. Vehicle internals were checked against the [0.36.0 controller source](https://github.com/dimforge/rapier/blob/v0.36.0/src/control/ray_cast_vehicle_controller.rs).

Particularly easy API traps: `setIndexForwardAxis` is a property setter; `setWheelBrake` accepts impulse; `castShape` includes `targetDistance` before `maxToi`; controller removal goes through `world.removeVehicleController`. The code typechecks against the pinned package and executes those paths in tests.

The general [determinism guide](https://rapier.rs/docs/user_guides/javascript/determinism/) must be read with the newer binding changelog: since JS 0.15, enhanced determinism is a separate package flavor. This project uses ordinary compat. Same-build, same-runtime replay is tested; cross-platform bitwise determinism is **not** established. A future authoritative server should pin all versions and serialize vehicle control state in addition to Rapier's world. World snapshots alone do not represent this adapter's pedal smoothing and controller history.

## Units, axes, and ownership

Meters, kilograms, seconds, radians; gravity is `(0, -9.81, 0)` m/s². Local +Y is up, +Z is the nose, +X is right. Front-left/front-right/rear-left/rear-right are wheel indices 0/1/2/3. Suspension points downward. Axles point -X; ground normal crossed with axle gives +Z forward. Positive steering rotates toward +X. Tests check forward movement, reverse movement, yaw signs, and wheel rotation signs.

No velocity or orientation assignments occur during ordinary driving. The only application-generated chassis impulse is aerodynamic drag. Rapier applies the tire/suspension impulses. Explicit reset can move the chassis and clear velocities. There is no auto-upright, yaw shortcut, horizontal velocity override, anti-roll correction, or speed clamp.

## Fixed-step architecture

`FixedStepClock` accumulates wall time and schedules **1/120 s** ticks. A frame accepts at most 0.1 s and performs at most 12 ticks. Excess whole-step debt is discarded and counted. No variable timestep enters Rapier. Pause, focus loss, and visibility loss clear inputs/debt; resume uses a new wall-time anchor. Long stalls clear stale key transitions. Sustained rendering below 10 FPS can slow simulation time rather than accumulate an unbounded backlog.

Per tick:

1. Sample timestamped input at the next tick boundary; preserve previous render snapshots.
2. Smooth controls using simulation `dt`; assign wheel steering, engine force, and brake impulse; apply one drag impulse.
3. Call `controller.updateVehicle(dt)` once, excluding sensors. Its own chassis is excluded by the engine wrapper.
4. Call `world.step()` once at the same fixed `dt`.
5. Capture body and wheel snapshots and dynamic prop poses.

The map's broad phase is populated before the first vehicle query. Body mass properties are recomputed after chassis construction. Rendering linearly interpolates positions and wheel values and uses quaternion slerp between previous/current poses, normally adding one tick of visual latency. Wheel contact lengths/normals are those sampled by the controller before rigid-body integration; this introduces up to one tick of relative contact-display lag during fast suspension motion. Debug wireframes show current authoritative geometry rather than interpolated geometry. Reset/pause synchronize history to prevent interpolation across a teleport.

`InputTimeline` applies event transitions at simulation timestamps. The browser maps DOM timestamps into the simulation clock; replay tests inject the same transitions, including events between render frames. The equivalent 30/60/144 FPS schedules produce exactly the same tested states.

### Why 120 Hz

Both 60 and 120 Hz passed the settling/comparison scenario. At 60 Hz measured static sag was 0.091833 m; at 120 Hz it was 0.095917 m against the 0.100 m static estimate. The selected rate halves this discrepancy and samples fast wheel contacts twice as often. The 20-second acceleration/braking/coast sequence ended at z=85.262 m versus 85.019 m, respectively. These rates need not give identical discretized trajectories.

In the local short Node benchmark, average tick costs were 0.0135 ms at 60 Hz and 0.0158 ms at 120 Hz (single-car flat fixture, JIT and machine dependent). Full browser measurements are below. The higher update rate was affordable here; it is a tested engineering choice, not a universal performance claim.

## Chassis, mass, and inertia

Total sprung mass is 1400 kg. The body envelope is 4.3 × 1.8 × 0.5 m and the cabin is 2.05 × 1.5 × 0.52 m, represented by two cuboids matching the primitive view. The chassis COM is the rigid-body origin; the lower box center is y=0.04 and the cabin center is y=0.55, z=-0.15. All wheel mounts are symmetric around that origin: 2.6 m wheelbase, 1.56 m track, y=0.05 m.

The colliders have zero density. `setAdditionalMassProperties` supplies all 1400 kg and a diagonal COM inertia estimate `(2200, 2500, 650)` kg m² for pitch/yaw/roll. These are envelope-based tuning estimates, not measurements of a particular car. Tests verify the effective world inertia tensor in the initial orientation; Rapier may sort principal eigenvalues and change their eigenframe, so testing the unsorted returned eigenvalue order would be incorrect.

The COM settles ~0.544 m above the road. The lower chassis surface is then ~0.334 m above it; the roof is ~1.354 m above it. At the suspension compression limit, nominal flat-road chassis clearance remains ~0.21 m. Colliders still handle bottoming, collisions, and rollovers. Wheel openings in the visual body are not subtracted from the conservative collider envelope.

All rotational degrees of freedom are enabled. Linear and angular body damping are left at zero; resistance is explicit. CCD is enabled and the world allows four CCD substeps. Eight solver iterations are used. Ray-supported chassis sleeping is disabled because wheel support is external to solver contact islands; props retain normal sleeping behavior.

## Suspension

The four wheels have independent contact rays, spring lengths, loads, and damping. Radius is 0.33 m, rest length 0.36 m, travel parameter 0.22 m, maximum force 14 kN per wheel. Flat static load per corner is `1400 * 9.81 / 4 = 3433.5 N`.

For a target 0.10 m sag, elementary static equilibrium gives `k = load / sag = 34335 N/m` per wheel. With 350 kg effective corner mass, the undamped reference frequency is `sqrt(k / 350) / (2π) ≈ 1.58 Hz`. These are reference calculations, not a complete quarter-car model with unsprung mass.

In this controller, spring and damper terms are multiplied by the **total** chassis mass. Therefore the configured stiffness is `34335 / 1400 = 24.525 s⁻²`. Compression/rebound settings 2.8/3.5 s⁻¹ correspond to 3920/4900 N s/m in the flat-contact approximation. They are deliberately different. The source also applies a contact-angle factor and clips negative spring load; actual force is limited to 14 kN. The ray's reach is rest length plus radius: the travel parameter does not make the stock ray search below that distance. [Controller implementation](https://github.com/dimforge/rapier/blob/v0.36.0/src/control/ray_cast_vehicle_controller.rs).

Measured static load is 3433.500 N per wheel, sag 0.095917 m, and settled height remains constant at the reported floating-point precision. The post-step vertical velocity reads about -0.03577 m/s even while the sampled height is constant: wheel impulses are applied before the gravity/integration phase. This is a discrete controller/solver phase artifact; it was measured and is not hidden by velocity correction. Doubling the timestep doubles the sag discrepancy.

## Tire model and roll limitation

`frictionSlip=1.15` limits stock tire impulses relative to suspension load; `sideFrictionStiffness=1` scales lateral correction. These are engine parameters, **not** a measured rubber-road coefficient or a Pacejka tire. The source uses an anisotropic combined impulse limit (forward term weighted 0.5, lateral term 1). Wheel rotation is derived from contact motion, with per-tick airborne decay; it is not an independently integrated wheel inertia or clutch model.

Two material limitations in the stock implementation matter especially: its private `roll_influence=0.1` reduces the lever arm of lateral tire force, and tire/suspension reactions are not fully returned to dynamic ground bodies. Both remain inherited approximations, not extra project assists. Body roll exists but is understated. Chassis-to-prop contact uses the normal rigid-body solver; driving on movable platforms is not momentum-complete. [Pinned source](https://github.com/dimforge/rapier/blob/v0.36.0/src/control/ray_cast_vehicle_controller.rs).

All road surfaces currently share the tire tune. Collider friction controls **chassis/prop** contact and should not be assumed to define road tire grip. Future material mapping belongs in the vehicle contact adapter. There is no second lateral-friction system competing with the controller.

## Steering, drivetrain, braking, and resistance

Keyboard steering is rate-limited in radians per simulation second: 1.3 rad/s toward input and 1.9 rad/s on return. Center steering limit blends from 0.55 rad at rest toward 0.075 rad using an inverse-quadratic function with 12 m/s transition scale. This is an explicit configurable keyboard assist, not a steering-rack law. Front-wheel Ackermann angles follow wheelbase/track geometry; the inner wheel turns farther. No chassis yaw assignment is used. Reverse retains the same wheel steering sign and naturally reverses yaw response.

The simplified front-wheel drivetrain supplies up to 6500 N total, limited by 90 kW at the wheels (`F=P/v` above the force-limited range). Reverse has a 3600 N limit. Throttle rises at 3/s and releases at 8/s. Drive force tapers over the final 15% below 44 m/s forward and 9 m/s reverse. Speed can exceed these values externally (e.g. downhill); the implementation never clamps velocity. No gearbox, differential, tire spin inertia, ABS, or traction-control system is claimed.

The opposite-direction command requests service braking until longitudinal speed falls below 0.35 m/s; it never instantly reverses the body. Maximum service force is 12.5 kN, 65% front, with a 6/s input response. Rear handbrake capacity is 9 kN total, and drive force is cut while braking. A requested brake setting is converted to N s using fixed `dt`, as required by the installed API. W+S requests the service brake without direction engagement.

Rolling resistance estimates `Crr*m*g/4` per contacting wheel with `Crr=0.012`; it is a nominal flat-load estimate, not load-sensitive rolling loss. On driven wheels it is subtracted from engine force, regularized near zero speed. Otherwise it shares the controller's bounded brake impulse. Coasting adds 110 N total drivetrain resistance. Contactless wheels produce no ground impulses, verified in the ramp test.

Air drag follows `F = -0.5*rho*CdA*|v|*v`, using rho=1.225 kg/m³ and CdA=0.68 m². It is applied once at COM as `F*dt`, including when airborne. This deliberately approximates drag as orientation-independent. No extra linear damping or downforce duplicates it. [Drag relationship](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/).

## Collisions, camera, reset, and lifecycle

Map `BoxSpec` data creates both visible geometry and colliders. Paint is render-only above a shared solid floor; sidewalks, buildings, curb, ramp, wall, and boundary barriers are solid. Dynamic boxes have explicit mass and CCD. Groups distinguish environment, vehicle, and prop membership while allowing all physical categories to collide. Sensor exclusion applies to wheel/camera queries.

The chase camera uses independent time-based heading/position smoothing and a 0.24 m sphere cast toward the **smoothed** desired position. Its chassis is excluded. Retraction is immediate for clearance and extension is smoothed; a sudden obstruction can therefore still cause a visible camera correction. A near plane of 0.08 m stays inside the clearance sphere. A pathological starting target embedded in solid scenery may still need a future depenetration policy. Tests cover a wall, clearing it, and teleport/reset behavior.

Reset clears controls, velocities, persistent forces, and torques, recreates the wheel controller (clearing wheel spin/contact history), and synchronizes render/camera history. It shape-tests an expanded chassis envelope at the spawn, searching upward if a prop occupies it, then allows normal gravity settling. There is no automatic rollover recovery. Default spawn is upright and above the road.

Listeners use abort signals; animation callbacks stop on disposal; controls/controllers/bodies/world and unique GPU resources are released. Debug GPU attributes are reused and superseded buffers are disposed. Repeated reset/controller disposal and prop sleeping have automated checks. No hours-long heap or GPU-memory soak has been performed.

## Numerical validation

Run `npm test`, then `npm run validate:physics` to regenerate `artifacts/physics-validation.json`. These are simulation outcomes, not real-car calibration. Node 24.20.0, Rapier 0.21.0; primary tests use 120 Hz. Tolerances are regression envelopes for an ordinary dry-road game car, not safety/performance certification.

| Scenario | Measured result | Acceptance / interpretation |
| --- | --- | --- |
| Rest after settling | 0 m horizontal drift and height range across the next 10 s; four contacts | <1 cm drift; <5 mm height variation |
| Static compression | 0.095917 m on all wheels; 3433.500 N each | 0.08–0.12 m vs 0.10 m reference |
| Acceleration | 0–50 km/h: 3.25 s; 0–100: 8.208 s | 2–6 s and 6–12 s; smooth speed increase |
| Straight tracking | ~0.000001 m lateral drift after 10 s throttle | <0.05 m; no unexplained yaw |
| Braking | 50.049 km/h to 0.35 m/s in 11.658 m / 1.575 s | 9–22 m / 1–3 s; this is a near-stop threshold, not exact zero |
| Braking load transfer | Front sag 0.1360 m; rear 0.0554 m | Front compresses relative to rear |
| Low-speed right turn | 4.845 m/s, 0.4837 rad center steering, ~4.964 m instantaneous radius | Radius estimate `speed/yawRate`; 3–20 m envelope |
| Reverse steering | -5.121 m/s; yaw -1.026 rad/s with positive steering | Correct opposing yaw sign |
| One-wheel 8 cm bump | 0.0800 m left/right suspension difference; lengths 0.1816–0.3272 m | Independent travel and no chassis penetration in this fixture |
| Ramp | 0.483 s airborne; peak COM height 2.002 m; settles on four wheels | >0.15 s flight; landing stable |
| Flight force check | All contactless tire impulses/load zero; max vertical acceleration deviation 0.0154 m/s² from gravity | <0.2 m/s², allowing air drag |
| Wall | ~17.80 m/s approach; COM stays before z=40 wall | No tunneling; bounded finite states |
| CCD stress | Initial 80 m/s crash into 0.25 m wall remains on approach side | Isolated stress initial condition, beyond normal drive speed |
| Movable block | 65 kg box moves 10.964 m; peak speed 7.710 m/s | Real chassis collision response, no teleporting |
| 30/60/144 FPS schedules | 1440 physics steps each; maximum state difference 0 | Tolerance 1e-6 for position, quaternion, velocity in this runtime |
| Extended city driving | 180 s, repeated pedals/turns/obstacles and 5 explicit resets; max speed 16.888 m/s, angular speed 2.274 rad/s | Finite states; <100 m/s and <50 rad/s |
| Reset | 51 resets; one chassis remains, final height 0.544083 m | No duplicate bodies/controller corruption; separately checks occupied spawn |
| Coasting | 16.895 → 16.290 m/s across 3 s | Slows naturally while retaining most momentum |
| Handbrake/recovery | Parks near zero; corner-and-service-brake sequence returns upright/usable | No instantaneous speed assignment |
| Force-taper speed | 148.83 km/h after 45 s throttle | 35–44.2 m/s envelope, no velocity cap |

Additional checks verify effective inertia axes, gravity/sleeping of a prop, interpolation immutability and shortest quaternion arc, bounded stalls/pause, timestamped input clearing, camera obstruction, and independent operation/disposal of two controllers. Total: **22 passing automated tests**.

`npm run test:browser` separately built at `/block-city-test/` and ran Chrome 157.0.8103.79 at 1440×900 and 800×600. WASM startup, asset paths, actual W/S/D/R/C/P/F3 input, button controls, pause/resume, blur clearing, a deliberate 250 ms stall, and layout checks passed without console/network errors. City, driving, debug, and compact screenshots were inspected. This run averaged **57.81 render FPS** and **0.236 ms per physics tick**, with 57 reported main render calls at completion. Debugging, screenshots, and the deliberate stall are part of this short run; this is not an isolated GPU benchmark or a guarantee on other hardware.

GitHub Actions/Pages configuration is supplied but was not run remotely. The local production-subpath test validates static loading, not account permissions or a live deployment. Firefox, Safari, mobile, controller hardware, cross-platform determinism, extreme terrain, many vehicles, and hour-scale stability remain unverified.

## Tuning guidance and next work

Change one subsystem at a time. Keep `vehicle.ts` values in verified units and keep measurements alongside changes. Start with mass/COM/inertia and static spring sag; then damping/landing; then propulsion and brakes; then steering and tire limits. Increase solver iterations only for demonstrated contact problems. A large tire-grip value is not a substitute for a correct COM or steering response. Do not change test acceptance envelopes merely to bless a failure.

The highest-priority physics improvements are:

1. **Replace the stock tire-force adapter:** independently integrated wheel angular speed, longitudinal slip/lateral slip-angle curves, an explicit combined-grip limit, and full opposing forces on contacted dynamic bodies. Keep Rapier for chassis integration/collision.
2. **Improve wheel contact and suspension moments:** compare swept wheel volumes/multiple contact samples against raycasts at curbs; model unsprung mass, bump stops and anti-roll bars; remove the stock fixed roll reduction in favor of measured geometry and physically explained torque.
3. **Extend validation and replay:** calibrated skidpad/coastdown/rough-road fixtures, cross-browser/hardware tests, longer memory/stability soaks, and full vehicle/controller state serialization before multiplayer prediction or deterministic-package selection.

The current model is intentionally understandable, adjustable, and bounded. It is a useful browser-game foundation; it does not reproduce full tire deformation, suspension kinematics, drivetrain dynamics, or automotive-grade behavior.
