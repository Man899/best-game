// The arena simulation: one fixed-step world with no rendering in it. It owns the player,
// enemies, bullets, pickups, particles, waves, upgrades and the combo, and reports events
// (hits, kills, wave clears, game over) as a bitmask so the loop can play sounds for them.

import { BREATHER, COMBO, ENEMY, FIELD, PICKUP, PLAYER, STEP, WAVE } from './config.js';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_OVER = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_PICKUP = 16;
export const EVENT_BOSS = 32;

/** The upgrade pool: each entry is offered between waves and stacks when picked again. */
export const UPGRADES = [
  { id: 'damage', name: 'OVERCHARGE', desc: '+25% bullet damage', icon: '✦' },
  { id: 'firerate', name: 'RAPID CYCLER', desc: '+20% fire rate', icon: '≫' },
  { id: 'multishot', name: 'TRIPLE LANCE', desc: '+1 bullet per shot', icon: '⋔' },
  { id: 'speed', name: 'ION THRUSTERS', desc: '+12% move speed', icon: '➤' },
  { id: 'maxhp', name: 'HULL PLATING', desc: '+25 max hull, repair 25', icon: '⬢' },
  { id: 'magnet', name: 'TRACTOR WEB', desc: '+60% pickup radius', icon: '◎' },
  { id: 'dash', name: 'PHASE DASH', desc: '-30% dash cooldown', icon: '↯' },
  { id: 'pierce', name: 'LANCE PIERCE', desc: 'Bullets pierce +1 enemy', icon: '⇢' },
];

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const state = {
    time: 0,
    score: 0,
    kills: 0,
    wave: 0,
    waveState: 'idle', // idle | spawning | fighting | breather | upgrade
    breather: 0,
    spawnQueue: 0,
    spawnTimer: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    shake: 0,
    boss: null,
    offer: [],
    player: null,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    pickups: [],
    particles: [],
    floaters: [],
    stars: [],
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      speed: PLAYER.speed,
      fireTimer: 0,
      fireInterval: PLAYER.fireInterval,
      damage: PLAYER.bulletDamage,
      shots: 1,
      pierce: 0,
      dashTimer: 0,
      dashCooldown: PLAYER.dashCooldown,
      dashTime: 0,
      dashX: 0,
      dashY: 0,
      invuln: 0,
      rapidTimer: 0,
      shieldTimer: 0,
      pickupRadius: PLAYER.pickupRadius,
      alive: true,
    };
  }

  function makeStars() {
    const stars = [];
    for (let i = 0; i < 110; i += 1) {
      stars.push({
        x: random.range(0, FIELD.width),
        y: random.range(0, FIELD.height),
        r: random.range(0.5, 2.2),
        tw: random.range(0, TAU),
        speed: random.range(0.2, 0.8),
      });
    }
    return stars;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random.range(0, TAU);
      const v = random.range(speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: random.range(0.3, 0.7),
        maxLife: 0.7,
        radius: random.range(1.5, 4),
        color,
      });
    }
  }

  function floater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 0.9 });
  }

  function edgeSpawn(minPlayerDist) {
    for (let tries = 0; tries < 12; tries += 1) {
      const side = random.int(0, 3);
      let x = 0;
      let y = 0;
      if (side === 0) { x = random.range(30, FIELD.width - 30); y = 30; }
      if (side === 1) { x = random.range(30, FIELD.width - 30); y = FIELD.height - 30; }
      if (side === 2) { x = 30; y = random.range(30, FIELD.height - 30); }
      if (side === 3) { x = FIELD.width - 30; y = random.range(30, FIELD.height - 30); }
      if (dist2(x, y, state.player.x, state.player.y) > minPlayerDist * minPlayerDist) return { x, y };
    }
    return { x: 40, y: 40 };
  }

  function hpScale() {
    return 1 + (state.wave - 1) * WAVE.hpScalePerWave;
  }

  function speedScale() {
    return 1 + (state.wave - 1) * WAVE.speedScalePerWave;
  }

  function spawnEnemy(kind, x, y) {
    const def = ENEMY[kind];
    const pos = x === undefined ? edgeSpawn(260) : { x, y };
    const enemy = {
      kind,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      radius: def.radius,
      hp: def.hp * hpScale(),
      maxHp: def.hp * hpScale(),
      speed: def.speed * speedScale() * random.range(0.9, 1.1),
      damage: def.damage,
      score: def.score,
      color: def.color,
      shootTimer: random.range(1, (def.shootInterval || 2) * 1.2),
      flash: 0,
      angle: 0,
      wobble: random.range(0, TAU),
    };
    state.enemies.push(enemy);
    if (kind === 'warden') state.boss = enemy;
    return enemy;
  }

  /** The wave's roster: drifters always, spitters from wave 2, splitters from wave 3. */
  function waveRoster(wave) {
    const count = WAVE.baseCount + (wave - 1) * WAVE.perWave;
    const roster = [];
    for (let i = 0; i < count; i += 1) {
      const roll = random.next();
      if (wave >= 3 && roll < 0.22) roster.push('splitter');
      else if (wave >= 2 && roll < 0.5) roster.push('spitter');
      else roster.push('drifter');
    }
    return roster;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = waveRoster(wave);
    state.spawnTimer = 0.4;
    state.waveState = 'spawning';
    if (wave % 5 === 0) {
      spawnEnemy('warden');
      return EVENT_BOSS;
    }
    return 0;
  }

  function rollOffer() {
    const pool = [...UPGRADES];
    const offer = [];
    while (offer.length < 3 && pool.length > 0) {
      offer.push(pool.splice(random.int(0, pool.length - 1), 1)[0]);
    }
    state.offer = offer;
  }

  function applyUpgrade(id) {
    const p = state.player;
    if (id === 'damage') p.damage *= 1.25;
    if (id === 'firerate') p.fireInterval *= 0.83;
    if (id === 'multishot') p.shots = Math.min(5, p.shots + 1);
    if (id === 'speed') p.speed *= 1.12;
    if (id === 'maxhp') {
      p.maxHp += 25;
      p.hp = Math.min(p.maxHp, p.hp + 25);
    }
    if (id === 'magnet') p.pickupRadius *= 1.6;
    if (id === 'dash') p.dashCooldown *= 0.7;
    if (id === 'pierce') p.pierce += 1;
    state.offer = [];
    state.waveState = 'breather';
    state.breather = 0.6;
  }

  function dropPickup(x, y) {
    if (random.next() > PICKUP.dropChance) return;
    const kind = random.pick(['heart', 'rapid', 'shield', 'nova']);
    state.pickups.push({
      kind, x, y,
      vx: random.range(-30, 30),
      vy: random.range(-30, 30),
      life: 12,
      bob: random.range(0, TAU),
    });
  }

  function killEnemy(enemy, index) {
    const p = state.player;
    state.enemies.splice(index, 1);
    if (enemy.kind === 'warden') state.boss = null;
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.multiplier = Math.min(COMBO.max, 1 + Math.floor(state.combo / 4));
    const gained = enemy.score * state.multiplier;
    state.score += gained;
    floater(enemy.x, enemy.y, `+${gained}`, state.multiplier > 1 ? '#ffd166' : '#f1f5ff');
    burst(enemy.x, enemy.y, enemy.color, enemy.kind === 'warden' ? 60 : 18, 260);
    state.shake = Math.min(14, state.shake + (enemy.kind === 'warden' ? 12 : 4));
    dropPickup(enemy.x, enemy.y);
    if (enemy.kind === 'splitter') {
      spawnEnemy('mini', enemy.x - 18, enemy.y);
      spawnEnemy('mini', enemy.x + 18, enemy.y);
    }
    return EVENT_KILL;
  }

  function damagePlayer(amount) {
    const p = state.player;
    if (p.invuln > 0 || p.shieldTimer > 0 || !p.alive) return 0;
    p.hp -= amount;
    p.invuln = PLAYER.invulnerableAfterHit;
    state.shake = Math.min(16, state.shake + 8);
    burst(p.x, p.y, '#ff5d73', 14, 220);
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      burst(p.x, p.y, '#4cc9f0', 70, 380);
      state.shake = 20;
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function fireBullets() {
    const p = state.player;
    const base = p.angle;
    const spread = 0.11;
    for (let i = 0; i < p.shots; i += 1) {
      const offset = (i - (p.shots - 1) / 2) * spread;
      const a = base + offset;
      state.bullets.push({
        x: p.x + Math.cos(a) * (PLAYER.radius + 6),
        y: p.y + Math.sin(a) * (PLAYER.radius + 6),
        vx: Math.cos(a) * PLAYER.bulletSpeed,
        vy: Math.sin(a) * PLAYER.bulletSpeed,
        radius: PLAYER.bulletRadius,
        damage: p.damage,
        pierce: p.pierce,
        life: 1.1,
      });
    }
  }

  function novaBlast() {
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      e.hp -= 150;
      burst(e.x, e.y, '#f72585', 10, 200);
      if (e.hp <= 0) killEnemy(e, i);
    }
    state.shake = 18;
    return EVENT_KILL;
  }

  function stepPlayer(dt, move, aimAngle, firing, dash) {
    const p = state.player;
    if (!p.alive) return 0;
    p.angle = aimAngle;
    p.fireTimer -= dt;
    p.dashTimer -= dt;
    p.invuln -= dt;
    p.rapidTimer -= dt;
    p.shieldTimer -= dt;
    if (dash && p.dashTimer <= 0 && (move.x !== 0 || move.y !== 0)) {
      p.dashTime = PLAYER.dashTime;
      p.dashTimer = p.dashCooldown;
      p.dashX = move.x;
      p.dashY = move.y;
      p.invuln = Math.max(p.invuln, PLAYER.dashTime + 0.05);
      burst(p.x, p.y, '#4cc9f0', 10, 160);
      return 0;
    }
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.x += p.dashX * PLAYER.dashSpeed * dt;
      p.y += p.dashY * PLAYER.dashSpeed * dt;
    } else {
      const accel = 2400;
      p.vx += move.x * accel * dt;
      p.vy += move.y * accel * dt;
      const drag = Math.exp(-6 * dt);
      p.vx *= drag;
      p.vy *= drag;
      const speed = Math.hypot(p.vx, p.vy);
      const max = p.speed;
      if (speed > max) {
        p.vx = (p.vx / speed) * max;
        p.vy = (p.vy / speed) * max;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    p.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, p.x));
    p.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, p.y));
    const interval = p.rapidTimer > 0 ? p.fireInterval * 0.55 : p.fireInterval;
    if (firing && p.fireTimer <= 0) {
      p.fireTimer = interval;
      fireBullets();
      return 0;
    }
    return 0;
  }

  function stepEnemies(dt) {
    const p = state.player;
    let events = 0;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      e.flash -= dt;
      e.wobble += dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.angle = Math.atan2(dy, dx);
      if (e.kind === 'spitter') {
        // Keep a firing distance: close in when far, back off when near, strafe slowly.
        const want = 260;
        const radial = d > want + 40 ? 1 : d < want - 40 ? -1 : 0;
        const strafe = Math.sin(e.wobble * 0.7) * 0.6;
        e.x += ((dx / d) * radial + (-dy / d) * strafe) * e.speed * dt;
        e.y += ((dy / d) * radial + (dx / d) * strafe) * e.speed * dt;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && p.alive && d < 560) {
          e.shootTimer = ENEMY.spitter.shootInterval * random.range(0.9, 1.2);
          state.enemyBullets.push({
            x: e.x, y: e.y,
            vx: (dx / d) * ENEMY.spitter.bulletSpeed,
            vy: (dy / d) * ENEMY.spitter.bulletSpeed,
            radius: 6, damage: e.damage, life: 4,
          });
        }
      } else if (e.kind === 'warden') {
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && p.alive) {
          e.shootTimer = ENEMY.warden.shootInterval;
          const base = random.range(0, TAU);
          for (let k = 0; k < 10; k += 1) {
            const a = base + (k / 10) * TAU;
            state.enemyBullets.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * ENEMY.warden.bulletSpeed,
              vy: Math.sin(a) * ENEMY.warden.bulletSpeed,
              radius: 7, damage: 12, life: 5,
            });
          }
          if (random.next() < 0.5) spawnEnemy('mini');
        }
      } else {
        // Drifters, splitters and minis chase, with a slight weave so they do not stack.
        const weave = Math.sin(e.wobble * 2) * 0.35;
        e.x += ((dx / d) + (-dy / d) * weave) * e.speed * dt;
        e.y += ((dy / d) + (dx / d) * weave) * e.speed * dt;
      }
      e.x = Math.max(e.radius, Math.min(FIELD.width - e.radius, e.x));
      e.y = Math.max(e.radius, Math.min(FIELD.height - e.radius, e.y));
      if (p.alive && dist2(e.x, e.y, p.x, p.y) < (e.radius + PLAYER.radius) * (e.radius + PLAYER.radius)) {
        events |= damagePlayer(e.damage);
        // Bounce the enemy back so one touch is not a chain of hits.
        e.x -= (dx / d) * 26;
        e.y -= (dy / d) * 26;
        if (!p.alive) return events;
      }
    }
    return events;
  }

  function stepBullets(dt) {
    let events = 0;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const e = state.enemies[j];
          if (dist2(b.x, b.y, e.x, e.y) < (b.radius + e.radius) * (b.radius + e.radius)) {
            e.hp -= b.damage;
            e.flash = 0.08;
            burst(b.x, b.y, '#ffe66d', 3, 120);
            if (e.hp <= 0) events |= killEnemy(e, j);
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    const p = state.player;
    for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = state.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const gone = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!gone && p.alive && dist2(b.x, b.y, p.x, p.y) < (b.radius + PLAYER.radius) * (b.radius + PLAYER.radius)) {
        events |= damagePlayer(b.damage);
        state.enemyBullets.splice(i, 1);
        continue;
      }
      if (gone) state.enemyBullets.splice(i, 1);
    }
    return events;
  }

  function stepPickups(dt) {
    const p = state.player;
    let events = 0;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      pk.life -= dt;
      pk.bob += dt * 3;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy) || 1;
      if (p.alive && d < p.pickupRadius) {
        pk.x += (dx / d) * 320 * dt;
        pk.y += (dy / d) * 320 * dt;
      } else {
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
        pk.vx *= 0.98;
        pk.vy *= 0.98;
      }
      if (p.alive && d < PLAYER.radius + 16) {
        if (pk.kind === 'heart') {
          p.hp = Math.min(p.maxHp, p.hp + PICKUP.heart.heal);
          floater(p.x, p.y - 24, `+${PICKUP.heart.heal} HULL`, '#ff6b9d');
        }
        if (pk.kind === 'rapid') {
          p.rapidTimer = PICKUP.rapid.seconds;
          floater(p.x, p.y - 24, 'RAPID FIRE', '#4cc9f0');
        }
        if (pk.kind === 'shield') {
          p.shieldTimer = PICKUP.shield.seconds;
          floater(p.x, p.y - 24, 'SHIELD', '#80ed99');
        }
        if (pk.kind === 'nova') {
          floater(p.x, p.y - 24, 'NOVA!', '#f72585');
          events |= novaBlast();
        }
        state.pickups.splice(i, 1);
        events |= EVENT_PICKUP;
        continue;
      }
      if (pk.life <= 0) state.pickups.splice(i, 1);
    }
    return events;
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.y -= 42 * dt;
      f.life -= dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - 30 * dt);
  }

  function step(dt, move, aimAngle, firing, dash) {
    state.time += dt;
    let events = stepPlayer(dt, move, aimAngle, firing, dash);
    events |= stepEnemies(dt);
    events |= stepBullets(dt);
    events |= stepPickups(dt);
    stepParticles(dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.multiplier = 1;
      }
    }
    // Wave flow: spawn the roster, fight until it is gone, then offer upgrades.
    if (state.waveState === 'spawning') {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.spawnQueue.length > 0 && state.enemies.length < WAVE.maxAlive) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer = WAVE.spawnInterval * random.range(0.7, 1.2);
      }
      if (state.spawnQueue.length === 0) state.waveState = 'fighting';
    }
    if ((state.waveState === 'fighting' || state.waveState === 'spawning') && state.spawnQueue.length === 0 && state.enemies.length === 0 && state.player.alive) {
      state.waveState = 'breather';
      state.breather = BREATHER;
      rollOffer();
      events |= EVENT_WAVE_CLEAR;
    }
    if (state.waveState === 'breather') {
      state.breather -= dt;
      if (state.breather <= 0) {
        // The offer is rolled at the clear; re-roll if it is ever empty, so the
        // upgrade screen can never open with no cards.
        if (state.offer.length === 0) rollOffer();
        state.waveState = 'upgrade';
      }
    }
    return events;
  }

  return {
    state,
    /** Fresh run: new player, wave 1, empty arena. */
    reset() {
      state.time = 0;
      state.score = 0;
      state.kills = 0;
      state.wave = 0;
      state.waveState = 'idle';
      state.breather = 0;
      state.spawnQueue = [];
      state.spawnTimer = 0;
      state.combo = 0;
      state.comboTimer = 0;
      state.multiplier = 1;
      state.shake = 0;
      state.boss = null;
      state.offer = [];
      state.player = freshPlayer();
      state.enemies = [];
      state.bullets = [];
      state.enemyBullets = [];
      state.pickups = [];
      state.particles = [];
      state.floaters = [];
      state.stars = makeStars();
    },
    /** Begin wave 1 from a fresh run. */
    startRun() {
      this.reset();
      return startWave(1);
    },
    /** Advance the world one fixed step; returns the event bitmask. */
    step,
    /** Apply a chosen upgrade card (by index into the current offer) and resume. */
    chooseUpgrade(index) {
      const up = state.offer[index];
      if (!up) return false;
      applyUpgrade(up.id);
      return true;
    },
    /** Start the next wave after the upgrade choice. */
    nextWave() {
      return startWave(state.wave + 1);
    },
    /** A wave-1 snapshot for the title screen's living backdrop. */
    idle() {
      this.reset();
      startWave(1);
    },
  };
}
