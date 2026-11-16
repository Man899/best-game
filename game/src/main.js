// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is there.
// The game moves between five screens: title, play, upgrade, paused and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|upgrade|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_PICKUP, EVENT_WAVE_CLEAR } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  window.__voidlight = { world, getScreen: () => scene.screen, getBest: () => scene.best };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;
  // Debug/testing hook: read-only view of the live world (no game logic depends on it).
  window.__voidlight = { world, getScreen: () => screen, getBest: () => best };

  // The title screen plays over a living arena: wave 1 drifts behind the menu.
  world.idle();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.startMusic();
    world.startRun();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1. Survive the swarm.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.stopMusic();
    audio.gameOver();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (actions & ACTION_DASH && screen === SCREEN_PLAY) dashQueued = true;
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_UPGRADE) {
      const pick = input.takeUpgradePick();
      if (pick >= 1 && pick <= 3 && world.chooseUpgrade(pick - 1)) {
        audio.upgrade();
        world.nextWave();
        screen = SCREEN_PLAY;
        announce(`Wave ${world.state.wave}.`);
      }
    }
  }

  /** Clicking an upgrade card picks it (mouse position mapped into arena space). */
  function handleUpgradeClick(event) {
    if (screen !== SCREEN_UPGRADE) return;
    const rect = canvas.getBoundingClientRect();
    const arena = renderer.toArena(event.clientX - rect.left, event.clientY - rect.top);
    const cardW = 280;
    const cardH = 220;
    const gap = 36;
    const total = cardW * 3 + gap * 2;
    const startX = (FIELD.width - total) / 2;
    const y = 260;
    for (let i = 0; i < 3; i += 1) {
      const x = startX + i * (cardW + gap);
      if (arena.x >= x && arena.x <= x + cardW && arena.y >= y && arena.y <= y + cardH) {
        if (world.chooseUpgrade(i)) {
          audio.upgrade();
          world.nextWave();
          screen = SCREEN_PLAY;
          announce(`Wave ${world.state.wave}.`);
        }
        return;
      }
    }
  }

  canvas.addEventListener('mousedown', handleUpgradeClick);

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, -Math.PI / 2, false, false);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const aimPoint = renderer.toArena(input.aim().x, input.aim().y);
    const p = world.state.player;
    const aimAngle = Math.atan2(aimPoint.y - p.y, aimPoint.x - p.x);
    const dash = dashQueued;
    dashQueued = false;
    const events = world.step(STEP, move, aimAngle, input.firing(), dash);
    if (events & EVENT_HIT) audio.playerHit();
    if (events & EVENT_KILL) audio.explode();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_WAVE_CLEAR) audio.waveHorn();
    if (world.state.waveState === 'upgrade') {
      screen = SCREEN_UPGRADE;
      announce('Wave clear. Choose an upgrade.');
    }
    if (events & EVENT_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the swarm feed unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Voidlight Arena. Press Enter or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
