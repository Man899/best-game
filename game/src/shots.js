// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot (flee
// the nearest enemy, aim at it, fire constantly, dash when cornered), so the frame is what a
// real game looks like and the same seed always gives the same frame.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 24;
const UPGRADE_SECONDS = 40;
const END_LIMIT_SECONDS = 240;
const SAMPLE = 1 / 30;

/** Steer the ship: away from the nearest enemy, toward the centre when clear. */
function autopilotMove(state, brave) {
  const p = state.player;
  let threat = null;
  let threatD = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < threatD) {
      threatD = d;
      threat = e;
    }
  }
  let x = 0;
  let y = 0;
  if (threat && threatD < 240) {
    x = (p.x - threat.x) / threatD;
    y = (p.y - threat.y) / threatD;
  } else {
    const cx = FIELD.width / 2 - p.x;
    const cy = FIELD.height / 2 - p.y;
    const cd = Math.hypot(cx, cy) || 1;
    if (cd > 120) {
      x = cx / cd;
      y = cy / cd;
    }
  }
  // Dodge incoming enemy bullets.
  for (const b of state.enemyBullets) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < 90) {
      const px = -b.vy;
      const py = b.vx;
      const pl = Math.hypot(px, py) || 1;
      x += (px / pl) * 0.8;
      y += (py / pl) * 0.8;
    }
  }
  const len = Math.hypot(x, y) || 1;
  const dash = brave && threat !== null && threatD < 90;
  return { x: x / len, y: y / len, dash };
}

/** Aim at the nearest enemy. */
function autopilotAim(state) {
  const p = state.player;
  let target = null;
  let best = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < best) {
      best = d;
      target = e;
    }
  }
  if (!target) return -Math.PI / 2;
  return Math.atan2(target.y - p.y, target.x - p.x);
}

function runWorld(world, seconds, brave, fire = true) {
  for (let i = 0; i < seconds / STEP; i += 1) {
    const move = autopilotMove(world.state, brave);
    const events = world.step(STEP, { x: move.x, y: move.y }, autopilotAim(world.state), fire, move.dash);
    if (events & EVENT_OVER) return true;
    // A cleared wave opens the upgrade screen: take the first card and keep flying.
    if (world.state.waveState === 'upgrade') {
      world.chooseUpgrade(0);
      world.nextWave();
    }
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best score
 * to show. Unknown names stage the title.
 */
export function stageShot(name, world) {
  world.startRun();
  if (name === 'start') {
    // No firing: the swarm drifts in and stays alive behind the title.
    runWorld(world, START_SECONDS, true, false);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    // Play into wave 5, where the roster is biggest and the Warden arrives, so the
    // frame shows the fight at full strength, bullets in the air.
    for (let i = 0; i < 120 / STEP; i += 1) {
      const move = autopilotMove(world.state, true);
      const events = world.step(STEP, { x: move.x, y: move.y }, autopilotAim(world.state), true, move.dash);
      if (events & EVENT_OVER) break;
      if (world.state.waveState === 'upgrade') {
        world.chooseUpgrade(0);
        world.nextWave();
      }
      if (world.state.wave === 5) {
        runWorld(world, 5, true);
        break;
      }
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'upgrade') {
    runWorld(world, UPGRADE_SECONDS, true);
    if (world.state.waveState !== 'upgrade') {
      // Clear the wave through the normal path, so the offer is rolled, then
      // step through the breather until the cards are on screen.
      world.state.enemies = [];
      world.state.spawnQueue = [];
      for (let i = 0; i < 600 && world.state.waveState !== 'upgrade'; i += 1) {
        world.step(STEP, { x: 0, y: 0 }, -Math.PI / 2, false, false);
      }
    }
    return { screen: SCREEN_UPGRADE, best: world.state.score };
  }
  // end: a reckless pilot that flies into the swarm. It fires for the first seconds,
  // builds a small score, then stops shooting and is overrun in wave 1 or 2.
  for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
    const p = world.state.player;
    let target = null;
    let bestD = Infinity;
    for (const e of world.state.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestD) {
        bestD = d;
        target = e;
      }
    }
    let move = { x: 0, y: 0 };
    if (target) {
      move = { x: (target.x - p.x) / bestD, y: (target.y - p.y) / bestD };
    }
    const firing = i < 15 * 60 && i % 2 === 0;
    const events = world.step(STEP, move, target ? Math.atan2(target.y - p.y, target.x - p.x) : -Math.PI / 2, firing, false);
    if (events & EVENT_OVER) break;
    if (world.state.waveState === 'upgrade') {
      world.chooseUpgrade(0);
      world.nextWave();
    }
  }
  return { screen: SCREEN_OVER, best: world.state.score };
}
