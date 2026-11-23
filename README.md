# Block City

A small browser driving game built around a testable physics simulation: one road car, a minimal city, and a separate ramp/curb/crash testing apron. TypeScript, Three.js 0.187.0, Rapier 0.21.0, and Vite 8.3.8. Exact dependencies are locked in `package-lock.json`.

This is a standalone project inside the existing Crossfire workspace. Run commands **from `block-city`**, not the parent folder. Crossfire's source, dependencies, and deployment workflow are unchanged.

## Run locally

Use Node 24 LTS (minimum 22.12), npm, and a desktop browser with WebGL 2 and WebAssembly.

```sh
cd block-city
npm ci
npm run dev
```

Open the localhost address printed by Vite, normally `http://127.0.0.1:5173`. In Windows PowerShell, use `npm.cmd` if your execution policy prevents `npm.ps1`. Dependencies are already installed in the delivered workspace.

```sh
npm run typecheck       # strict TypeScript
npm test                # 23 physics, clock, input, camera, and architecture checks
npm run validate:physics # numerical results -> artifacts/physics-validation.json
npm run build           # production output -> dist/
npm run preview         # serve dist/ locally
npm run test:browser    # build at a repository subpath and test in installed Chrome
```

The browser test owns and closes its localhost server and headless browser. Screenshots and measurements go to `artifacts/`. Chrome is the default. To use Playwright Chromium instead, install it with `npx playwright install chromium`, then set `BROWSER_CHANNEL=chromium` (PowerShell: `$env:BROWSER_CHANNEL = 'chromium'`). CI installs Chromium explicitly.

## Controls

| Key | Action |
| --- | --- |
| W | Accelerate forward; brake first if reversing |
| S | Brake while moving forward, then reverse below 0.35 m/s |
| A / D | Steer left / right |
| Space | Rear handbrake; cuts drive force |
| R | Reset to a clear position above the original spawn |
| C | Switch standard / high chase camera |
| Esc | Pause / resume; the pause menu also has Resume and Home screen |
| P | Alternate pause / resume shortcut |
| F3 | Physics diagnostics and collider/contact drawing |

W and S together apply the service brake. Losing window focus pauses and clears held keys; press Esc or Resume to continue. Long stalls discard excess time and clear stale driving inputs. Release and press a driving key again after a stall. Reset leaves the current pause state unchanged.

Drive east (world +X) along a cross street to reach the paved test apron at x≈115 m. It contains an 8° ramp, an 8 cm curb, three movable blocks, and a wall. The street network is open and bounded. The home screen starts the game; Esc opens the pause menu and can return home.

F3 shows simulation/render rates, CPU time per physics tick, discarded time, position, velocities, steering, pedals, and each wheel's contact, length, and suspension force. Colored wireframes show the engine's actual colliders. Green lines show wheel rays and contact normals. Debug drawing uses current physics state; the normal meshes are interpolated.

## Architecture

| Folder | Responsibility |
| --- | --- |
| `src/core` | Lifecycle, bounded fixed-step clock, renderer-independent math |
| `src/physics` | Rapier initialization, collider creation, authoritative tick order |
| `src/vehicles` | Vehicle interface, control processing, raycast vehicle adapter |
| `src/config` | Simulation rate and documented vehicle parameters |
| `src/input` | Timestamped key transitions, focus clearing |
| `src/world` | Shared map data for colliders and graphics |
| `src/rendering` | Primitive car, wheel pivots, interpolated dynamic objects, static instancing, contact-based drift effects |
| `src/camera` | Time-based chase smoothing and sphere-cast obstruction handling |
| `src/debug` | Engine collider and wheel-contact visualization |
| `tests`, `tools` | Headless scenarios, browser tests, quantitative reports |

`Simulation.step(input)` has no DOM or Three.js dependency. It updates the car controller, advances Rapier once, and captures snapshots. All forces use the fixed timestep; rendering never moves the physical body. `VehicleSystem` and `VehicleVisualState` separate future vehicle models from presentation. A two-car isolation test checks that controller state and disposal are per vehicle; the playable map deliberately has only one car.

See [PHYSICS.md](PHYSICS.md) for engine selection, equations, assumptions, tuning, measured results, and limitations.

## GitHub Pages

The project includes an automatic deployment workflow at [`.github/workflows/pages.yml`](.github/workflows/pages.yml). A push to `main` runs validation and deploys the built `dist` when all checks pass. The workflow can also be started manually.

For a dedicated Block City repository:

1. Put the **contents of `block-city`** at the repository root, including its hidden `.github` directory. The nested workflow is intentionally inactive in the current Crossfire repository; GitHub only discovers root-level workflows.
2. In repository **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Push to `main` when ready. **Validate and deploy Block City** installs, tests, builds, browser-tests, and deploys `dist` automatically if all checks pass.
4. The workflow uses `/<repository-name>/` as the asset base. For a user/organization root site or a custom domain, change its `BASE_PATH` to `/`.

For a local repository-subpath build:

```powershell
$env:BASE_PATH = '/my-repository/'
npm.cmd run build
npm.cmd run preview
```

On POSIX shells: `BASE_PATH=/my-repository/ npm run build`. The default base is `./`. Rapier's compatibility package embeds WASM in the JavaScript bundle, so there is no separate WASM URL or special MIME configuration. There is no backend or cross-origin-isolation requirement. The embedded engine makes the physics chunk relatively large (~4.33 MB minified, ~1.67 MB gzip); Vite's bundle-size warning is expected.

If later hosting alongside Crossfire, explicitly design a combined artifact and merge the deployment workflow. Do not enable a second workflow that overwrites Crossfire's Pages artifact accidentally.

## Replace the primitive car with a Blender model

Replace the view factory in `src/rendering/VehicleView.ts`; keep its input boundary. Use `GLTFLoader` from the pinned Three.js package and resolve the asset with `new URL('../assets/car.glb', import.meta.url)` for correct Vite base handling.

- Export in meters: 1 scene unit = 1 m. Apply Blender scale and rotation before export.
- The car root represents the chassis COM/body origin, not the floor. Local +Y is up, +Z points out the front, and +X is the car's right. Blender's native axes differ; verify the exported GLB, not just the Blender viewport.
- The configured body envelope is 4.3 × 1.8 m; its box center is 0.04 m above the origin. The roof is ~0.81 m above the origin. The origin settles ~0.544 m above pavement with this tune.
- Separate the four wheels. Wheel pivots sit at wheel centers, axle aligned with local X. Apply steering around local +Y, then spin around local +X. The controller uses an axle vector of -X to obtain forward +Z tire force; its reported positive spin maps to +X visual rotation.
- Use the interpolated suspension length to position each pivot below its mount. Do not bake a fixed wheel position into the chassis mesh.
- Cosmetic mesh changes must not change mass, inertia, colliders, or wheel mounts implicitly. Update `src/config/vehicle.ts` deliberately if the physical dimensions change.

The primitive mesh has simple wheel openings; the solid body collider conservatively includes those openings. There are no wheel colliders.

## Add a building with a collider

In `src/world/map.ts`, add one shared box specification:

```ts
map.boxes.push(box('new-building', vec(12, 10, 18), vec(100, 5, -70), 0x77838a));
```

`size` means full dimensions in meters, and `position` is the box center. By default the helper creates matching visible and fixed collision geometry. Set `mass` for a movable prop. Use `collider: false` only for flat paint/decorations; elevated surfaces and barriers need colliders. Do not put a building on the configured spawn or duplicate the ground with coplanar solid road slabs.

## Validation and limits

On November 23, 2026, the 23 automated checks and strict production build passed with the playful tune. Headless Chrome loaded the production build beneath `/block-city-test/` and passed real keyboard, steering, contact-based drift marks and dust, reset, camera, debug, pause/home navigation, focus-loss, long-stall, and compact layout checks without console or network errors. Screenshots were inspected.

This is a game vehicle foundation, not an automotive simulator. Tire grip, wheel spin, drivetrain, suspension geometry, and stock-controller roll response remain simplified. Wheel sidewalls do not collide with curbs. Dynamic road/platform momentum transfer needs a different vehicle-contact model. Firefox, Safari, mobile input, long-duration memory profiling, this revision's live Pages deployment, and multiplayer synchronization remain unverified. See the detailed measurements and highest-priority improvements in [PHYSICS.md](PHYSICS.md).
