import './style.css';
import { initializePhysics } from './physics/PhysicsWorld';
import { Game } from './core/Game';

declare global { interface Window { blockCity?: { telemetry: () => ReturnType<Game['telemetry']> } } }
let game: Game | undefined;
const play = document.getElementById('play') as HTMLButtonElement;
const home = document.getElementById('home-screen')!;
const title = document.getElementById('home-title')!;
title.addEventListener('pointermove', event => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const bounds = title.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;
  title.style.setProperty('--tilt-x', `${(-y * 8).toFixed(1)}deg`);
  title.style.setProperty('--tilt-y', `${(x * 8).toFixed(1)}deg`);
});
title.addEventListener('pointerleave', () => {
  title.style.removeProperty('--tilt-x'); title.style.removeProperty('--tilt-y');
});
const returnHome = () => {
  game?.dispose(); game = undefined; delete window.blockCity;
  document.body.classList.remove('playing');
  document.getElementById('pause-screen')!.hidden = true;
  home.hidden = false; play.disabled = false;
  play.classList.remove('is-starting');
  play.querySelector('span')!.textContent = 'PLAY';
};
play.addEventListener('click', async () => {
  if (play.disabled) return;
  play.disabled = true;
  play.classList.add('is-starting');
  play.querySelector('span')!.textContent = 'STARTING';
  try {
    // Let the pressed state render before loading the physics engine and scene.
    await new Promise(resolve => window.setTimeout(resolve, 180));
    await initializePhysics();
    game = new Game(document.getElementById('game') as HTMLCanvasElement, returnHome);
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
