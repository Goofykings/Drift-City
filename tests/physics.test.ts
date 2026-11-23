import { beforeAll, test } from 'vitest';
import { initializePhysics } from '../src/physics/PhysicsWorld';
import { scenarios } from './scenarios';
beforeAll(async () => { await initializePhysics(); });
for (const [name, scenario] of Object.entries(scenarios)) test(name, () => { scenario(); });
