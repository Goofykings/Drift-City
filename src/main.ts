import './style.css';
import { initializePhysics } from './physics/PhysicsWorld';
import { Game } from './core/Game';

declare global { interface Window { blockCity?: { telemetry: () => ReturnType<Game['telemetry']> } } }
let game: Game | undefined;
const play = document.getElementById('play') as HTMLButtonElement;
const home = document.getElementById('home-screen')!;
play.addEventListener('click', async () => {
  if (play.disabled) return;
  play.disabled = true;
  play.classList.add('is-starting');
  play.querySelector('span')!.textContent = 'STARTING';
  try {
    // Let the pressed state render before loading the physics engine and scene.
    await new Promise(resolve => window.setTimeout(resolve, 180));
    await initializePhysics();
    game = new Game(document.getElementById('game') as HTMLCanvasElement);
    window.blockCity = { telemetry: () => game!.telemetry() };
    document.body.classList.add('playing');
    home.hidden = true;
  } catch (error) {
    game?.dispose();
    home.hidden = true;
    const status = document.getElementById('status')!;
    status.hidden = false;
    status.textContent = `Drift City could not start: ${error instanceof Error ? error.message : String(error)}. Use a browser with WebGL 2 and WebAssembly support.`;
    console.error(error);
  }
});
const dispose = () => { game?.dispose(); delete window.blockCity; window.removeEventListener('pagehide', onPageHide); };
const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) dispose(); };
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(dispose);
