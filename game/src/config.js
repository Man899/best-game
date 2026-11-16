// Every tuning number and colour for Voidlight Arena, in one place. The arena is a fixed
// 1280x720 logical field; the renderer scales it to the window, so no rule below depends on
// the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Seconds of calm between waves, while the upgrade choice is offered. */
export const BREATHER = 3.0;

export const PLAYER = {
  radius: 14,
  speed: 300,
  maxHp: 100,
  fireInterval: 0.16,
  bulletSpeed: 640,
  bulletDamage: 34,
  bulletRadius: 5,
  dashSpeed: 900,
  dashTime: 0.16,
  dashCooldown: 1.6,
  invulnerableAfterHit: 0.9,
  pickupRadius: 90,
};

/** Enemy kinds: chaser, shooter, splitter and the wave-5 boss. */
export const ENEMY = {
  drifter: { radius: 16, hp: 30, speed: 95, damage: 12, score: 100, color: '#ff5d73' },
  spitter: { radius: 15, hp: 24, speed: 70, damage: 10, score: 150, color: '#c77dff', shootInterval: 2.2, bulletSpeed: 230 },
  splitter: { radius: 22, hp: 55, speed: 62, damage: 14, score: 200, color: '#ffb703' },
  mini: { radius: 10, hp: 12, speed: 165, damage: 8, score: 50, color: '#ffd166' },
  warden: { radius: 46, hp: 900, speed: 42, damage: 22, score: 2500, color: '#ff2e63', shootInterval: 1.6, bulletSpeed: 200 },
};

/** How a wave is built: count grows, mix widens, and every 5th wave adds the Warden. */
export const WAVE = {
  baseCount: 6,
  perWave: 3,
  maxAlive: 26,
  spawnInterval: 0.85,
  hpScalePerWave: 0.16,
  speedScalePerWave: 0.03,
};

/** Combo: kills chained inside this window raise the multiplier, up to x8. */
export const COMBO = { window: 2.5, max: 8 };

/** Pickups: what drops, how often, and what each one does. */
export const PICKUP = {
  dropChance: 0.16,
  heart: { heal: 30, color: '#ff6b9d' },
  rapid: { seconds: 8, color: '#4cc9f0' },
  shield: { seconds: 6, color: '#80ed99' },
  nova: { color: '#f72585' },
};

export const PALETTE = {
  backdrop: '#070312',
  nebulaA: '#1b1040',
  nebulaB: '#3a0ca3',
  grid: 'rgba(120, 90, 255, 0.07)',
  player: '#4cc9f0',
  playerCore: '#e0fbff',
  bullet: '#ffe66d',
  enemyBullet: '#ff5d8f',
  panel: 'rgba(10, 8, 28, 0.82)',
  panelEdge: '#4cc9f0',
  text: '#f1f5ff',
  muted: '#9aa5c7',
  gold: '#ffd166',
  danger: '#ff5d73',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'voidlight-arena.best';
