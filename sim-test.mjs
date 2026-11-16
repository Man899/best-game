// Headless logic test of the world simulation (no DOM): autopilot plays until death or
// wave 6, asserting the loop's invariants at each step.
import { createWorld, EVENT_OVER, EVENT_WAVE_CLEAR } from './game/src/world.js';
import { createRandom } from './game/src/random.js';
import { FIELD, STEP } from './game/src/config.js';

const world = createWorld(createRandom(99));
world.startRun();
let steps = 0, clears = 0, upgrades = 0, bossSeen = false, maxWave = 0, prevScore = 0;
let died = false;
while (steps < 60 * 60 * 8 && !died) {
  const s = world.state, p = s.player;
  // Autopilot: flee nearest enemy, aim at it, always fire, dash when cornered.
  let t = null, td = Infinity;
  for (const e of s.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < td) { td = d; t = e; } }
  let mx = 0, my = 0;
  if (t && td < 240) { mx = (p.x - t.x) / td; my = (p.y - t.y) / td; }
  else { const cx = FIELD.width / 2 - p.x, cy = FIELD.height / 2 - p.y, cd = Math.hypot(cx, cy) || 1; if (cd > 120) { mx = cx / cd; my = cy / cd; } }
  const aim = t ? Math.atan2(t.y - p.y, t.x - p.x) : -Math.PI / 2;
  const ev = world.step(STEP, { x: mx, y: my }, aim, true, t !== null && td < 90);
  if (ev & EVENT_WAVE_CLEAR) clears += 1;
  if (ev & EVENT_OVER) died = true;
  if (s.boss) bossSeen = true;
  maxWave = Math.max(maxWave, s.wave);
  if (s.waveState === 'upgrade') {
    if (s.offer.length !== 3) throw new Error(`upgrade offer has ${s.offer.length} cards, want 3`);
    if (!world.chooseUpgrade(1)) throw new Error('chooseUpgrade failed');
    upgrades += 1;
    world.nextWave();
  }
  if (s.score < prevScore) throw new Error('score went backwards');
  prevScore = s.score;
  if (p.hp < 0 || p.hp > p.maxHp) throw new Error(`hp out of range: ${p.hp}/${p.maxHp}`);
  if (s.enemies.length > 26) throw new Error(`too many enemies alive: ${s.enemies.length}`);
  steps += 1;
}
const s = world.state;
console.log(JSON.stringify({ steps, seconds: +(steps / 60).toFixed(1), died, maxWave, clears, upgrades, bossSeen, score: s.score, kills: s.kills, hp: Math.round(s.player.hp) }));
if (!died) throw new Error('autopilot never died in 8 sim-minutes');
if (maxWave < 5) throw new Error(`only reached wave ${maxWave}, boss never tested`);
if (!bossSeen) throw new Error('Warden never spawned');
if (clears < 4 || upgrades < 4) throw new Error(`too few clears/upgrades: ${clears}/${upgrades}`);
console.log('SIM TEST PASSED');
