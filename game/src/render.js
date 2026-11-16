// The canvas renderer: paints the arena, the ships and the HUD, and the title, upgrade,
// pause and game-over screens. The playfield is a fixed 1280x720 logical area scaled to the
// canvas, letterboxed; mouse coordinates come back through the same scale.

import { FIELD, FONT, PALETTE, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let nebula = null;

  function resize() {
    const w = canvas.clientWidth || FIELD.width;
    const h = canvas.clientHeight || FIELD.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    offsetX = (canvas.width - FIELD.width * scale) / 2;
    offsetY = (canvas.height - FIELD.height * scale) / 2;
    nebula = null;
  }

  function buildNebula() {
    nebula = document.createElement('canvas');
    nebula.width = FIELD.width;
    nebula.height = FIELD.height;
    const n = nebula.getContext('2d');
    n.fillStyle = PALETTE.backdrop;
    n.fillRect(0, 0, FIELD.width, FIELD.height);
    const blobs = [
      [300, 180, 420, 'rgba(58, 12, 163, 0.55)'],
      [1050, 520, 460, 'rgba(114, 9, 183, 0.4)'],
      [950, 120, 300, 'rgba(76, 201, 240, 0.16)'],
      [220, 600, 320, 'rgba(247, 37, 133, 0.14)'],
    ];
    for (const [x, y, r, color] of blobs) {
      const g = n.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = g;
      n.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  /** Canvas CSS pixel -> arena coordinates (for aiming). */
  function toArena(clientX, clientY) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = clientX * dpr;
    const py = clientY * dpr;
    return { x: (px - offsetX) / scale, y: (py - offsetY) / scale };
  }

  function drawBackground(state) {
    if (!nebula) buildNebula();
    ctx.drawImage(nebula, 0, 0);
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= FIELD.width; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
    }
    for (let y = 0; y <= FIELD.height; y += 80) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
    }
    ctx.stroke();
    const t = state.time;
    for (const s of state.stars) {
      const a = 0.35 + 0.4 * Math.abs(Math.sin(t * s.speed + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe8ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Arena edge.
    ctx.strokeStyle = 'rgba(76, 201, 240, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, FIELD.width - 2, FIELD.height - 2);
  }

  function drawShip(x, y, angle, radius, color, core) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(radius + 6, 0);
    ctx.lineTo(-radius * 0.7, radius * 0.75);
    ctx.lineTo(-radius * 0.35, 0);
    ctx.lineTo(-radius * 0.7, -radius * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.32, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
      if (e.kind === 'drifter' || e.kind === 'mini') {
        // Spiked shard.
        ctx.rotate(e.angle);
        ctx.beginPath();
        ctx.moveTo(e.radius, 0);
        for (let k = 1; k <= 6; k += 1) {
          const a = (k / 6) * TAU;
          const r = k % 2 === 0 ? e.radius : e.radius * 0.55;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else if (e.kind === 'spitter') {
        ctx.rotate(e.angle);
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#1b1035';
        ctx.beginPath();
        ctx.arc(e.radius * 0.4, 0, e.radius * 0.35, 0, TAU);
        ctx.fill();
      } else if (e.kind === 'splitter') {
        ctx.rotate(e.wobble);
        ctx.fillRect(-e.radius, -e.radius, e.radius * 2, e.radius * 2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#1b1035';
        ctx.lineWidth = 3;
        ctx.strokeRect(-e.radius * 0.55, -e.radius * 0.55, e.radius * 1.1, e.radius * 1.1);
      } else if (e.kind === 'warden') {
        // The boss: a heavy ringed hull.
        ctx.rotate(e.wobble * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.68, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.22, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      if (e.maxHp > 60) {
        const w = e.radius * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w, 5);
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w * Math.max(0, e.hp / e.maxHp), 5);
      }
    }
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.bob) * 3;
      const color = pk.kind === 'heart' ? '#ff6b9d' : pk.kind === 'rapid' ? '#4cc9f0' : pk.kind === 'shield' ? '#80ed99' : '#f72585';
      const blink = pk.life < 3 ? (Math.sin(state.time * 12) > 0 ? 1 : 0.25) : 1;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.translate(pk.x, pk.y + bob);
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0a0618';
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glyph = pk.kind === 'heart' ? '+' : pk.kind === 'rapid' ? '»' : pk.kind === 'shield' ? '◈' : '✦';
      ctx.fillText(glyph, 0, 1);
      ctx.restore();
    }
  }

  function drawBullets(state) {
    ctx.save();
    ctx.shadowColor = PALETTE.bullet;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = PALETTE.bullet;
    ctx.lineWidth = 3;
    ctx.fillStyle = PALETTE.bullet;
    for (const b of state.bullets) {
      // A short trail behind each bolt so volleys read at a glance.
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, TAU);
      ctx.fill();
    }
    ctx.shadowColor = PALETTE.enemyBullet;
    ctx.fillStyle = PALETTE.enemyBullet;
    for (const b of state.enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p.alive) return;
    const blink = p.invuln > 0 && p.dashTime <= 0 ? (Math.sin(state.time * 30) > 0 ? 1 : 0.35) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    if (p.shieldTimer > 0) {
      ctx.strokeStyle = 'rgba(128, 237, 153, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER.radius + 12 + Math.sin(state.time * 6) * 2, 0, TAU);
      ctx.stroke();
    }
    drawShip(p.x, p.y, p.angle, PLAYER.radius, PALETTE.player, PALETTE.playerCore);
    if (p.dashTime > 0) {
      ctx.globalAlpha = 0.35 * blink;
      drawShip(p.x - p.dashX * 26, p.y - p.dashY * 26, p.angle, PLAYER.radius, PALETTE.player, PALETTE.playerCore);
    }
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = 'rgba(76, 201, 240, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();
  }

  function text(str, x, y, size, color, align = 'center', weight = 'bold') {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawHud(state, best) {
    const p = state.player;
    // Top-left: score and best.
    ctx.textAlign = 'left';
    text(`SCORE ${state.score.toLocaleString('en-US')}`, 24, 30, 24, PALETTE.text, 'left');
    text(`BEST ${Math.max(best, state.score).toLocaleString('en-US')}`, 24, 56, 14, PALETTE.muted, 'left', 'normal');
    // Top-centre: wave.
    text(`WAVE ${state.wave}`, FIELD.width / 2, 30, 22, PALETTE.gold);
    const remaining = state.enemies.length + state.spawnQueue.length;
    if ((state.waveState === 'spawning' || state.waveState === 'fighting') && !state.boss) {
      text(`${remaining} HOSTILE${remaining === 1 ? '' : 'S'}`, FIELD.width / 2, 56, 14, PALETTE.muted, 'center', 'normal');
    } else if (state.waveState === 'breather') {
      text('WAVE CLEAR — CHOOSE AN UPGRADE', FIELD.width / 2, 56, 14, '#80ed99', 'center', 'normal');
    }
    // Top-right: kills and combo.
    text(`KILLS ${state.kills}`, FIELD.width - 24, 30, 20, PALETTE.text, 'right');
    if (state.multiplier > 1) {
      text(`COMBO x${state.multiplier}`, FIELD.width - 24, 56, 18, PALETTE.gold, 'right');
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(FIELD.width - 144, 68, 120 * Math.max(0, state.comboTimer / 2.5), 4);
    }
    // Bottom-left: hull bar.
    const bw = 220;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(24, FIELD.height - 44, bw, 18);
    ctx.fillStyle = p.hp / p.maxHp > 0.35 ? '#4cc9f0' : '#ff5d73';
    ctx.fillRect(24, FIELD.height - 44, bw * Math.max(0, p.hp / p.maxHp), 18);
    ctx.strokeStyle = 'rgba(241,245,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(24, FIELD.height - 44, bw, 18);
    text(`HULL ${Math.ceil(p.hp)} / ${p.maxHp}`, 24 + bw / 2, FIELD.height - 35, 12, PALETTE.text);
    // Bottom-right: dash cooldown.
    const dashReady = p.dashTimer <= 0;
    text(dashReady ? 'DASH READY  [SHIFT]' : 'DASH …', FIELD.width - 24, FIELD.height - 35, 14, dashReady ? '#80ed99' : PALETTE.muted, 'right', 'normal');
    if (!dashReady) {
      const dw = 120;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(FIELD.width - 24 - dw, FIELD.height - 52, dw, 5);
      ctx.fillStyle = '#80ed99';
      ctx.fillRect(FIELD.width - 24 - dw, FIELD.height - 52, dw * (1 - p.dashTimer / p.dashCooldown), 5);
    }
    // Active timers.
    let ty = FIELD.height - 76;
    if (p.rapidTimer > 0) {
      text(`RAPID FIRE ${Math.ceil(p.rapidTimer)}s`, 24, ty, 14, '#4cc9f0', 'left', 'normal');
      ty -= 22;
    }
    if (p.shieldTimer > 0) {
      text(`SHIELD ${Math.ceil(p.shieldTimer)}s`, 24, ty, 14, '#80ed99', 'left', 'normal');
    }
    // Boss bar.
    if (state.boss) {
      const bw2 = 460;
      const bx = (FIELD.width - bw2) / 2;
      text('⚠ WARDEN OF THE VOID ⚠', FIELD.width / 2, 84, 16, '#ff2e63');
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, 98, bw2, 12);
      ctx.fillStyle = '#ff2e63';
      ctx.fillRect(bx, 98, bw2 * Math.max(0, state.boss.hp / state.boss.maxHp), 12);
      ctx.strokeStyle = 'rgba(241,245,255,0.6)';
      ctx.strokeRect(bx, 98, bw2, 12);
    }
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(4, 2, 12, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text('VOIDLIGHT', FIELD.width / 2, 218, 92, '#e0fbff');
    text('ARENA', FIELD.width / 2, 296, 92, PALETTE.player);
    text('Survive the swarm. Chain kills. Break the Warden.', FIELD.width / 2, 360, 20, PALETTE.muted, 'center', 'normal');
    panel(FIELD.width / 2 - 330, 398, 660, 118);
    text('WASD / ARROWS — fly      MOUSE — aim      HOLD CLICK / SPACE — fire', FIELD.width / 2, 426, 17, PALETTE.text, 'center', 'normal');
    text('SHIFT / RIGHT-CLICK — dash      P — pause      M — mute', FIELD.width / 2, 456, 17, PALETTE.text, 'center', 'normal');
    text('Clear a wave, pick 1 of 3 upgrades. Every 5th wave the Warden comes.', FIELD.width / 2, 488, 15, PALETTE.muted, 'center', 'normal');
    if (best > 0) text(`BEST SCORE ${best.toLocaleString('en-US')}`, FIELD.width / 2, 548, 18, PALETTE.gold);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    text('▶  CLICK OR PRESS ENTER TO LAUNCH', FIELD.width / 2, 606, 22, '#80ed99');
    ctx.globalAlpha = 1;
  }

  function drawUpgrade(state) {
    ctx.fillStyle = 'rgba(4, 2, 12, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text(`WAVE ${state.wave} CLEAR`, FIELD.width / 2, 150, 40, '#80ed99');
    text('Choose one upgrade — press 1, 2 or 3, or click a card', FIELD.width / 2, 196, 18, PALETTE.muted, 'center', 'normal');
    const cardW = 280;
    const cardH = 220;
    const gap = 36;
    const total = cardW * 3 + gap * 2;
    const startX = (FIELD.width - total) / 2;
    const y = 260;
    state.offer.forEach((up, i) => {
      const x = startX + i * (cardW + gap);
      panel(x, y, cardW, cardH);
      text(up.icon, x + cardW / 2, y + 52, 44, PALETTE.gold);
      text(up.name, x + cardW / 2, y + 112, 21, PALETTE.text);
      text(up.desc, x + cardW / 2, y + 150, 16, PALETTE.muted, 'center', 'normal');
      text(`[ ${i + 1} ]`, x + cardW / 2, y + 188, 16, '#80ed99');
    });
  }

  function drawPaused(state) {
    ctx.fillStyle = 'rgba(4, 2, 12, 0.65)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text('PAUSED', FIELD.width / 2, 330, 64, PALETTE.text);
    text('Press P or Enter to resume — M to mute', FIELD.width / 2, 396, 18, PALETTE.muted, 'center', 'normal');
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(12, 2, 8, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text('SIGNAL LOST', FIELD.width / 2, 240, 72, '#ff5d73');
    text('Your light went out in the void.', FIELD.width / 2, 306, 20, PALETTE.muted, 'center', 'normal');
    panel(FIELD.width / 2 - 260, 350, 520, 150);
    text(`FINAL SCORE   ${state.score.toLocaleString('en-US')}`, FIELD.width / 2, 386, 24, PALETTE.text);
    text(`WAVE REACHED   ${state.wave}      KILLS   ${state.kills}`, FIELD.width / 2, 424, 18, PALETTE.muted, 'center', 'normal');
    const isBest = state.score > 0 && state.score >= best;
    text(isBest ? '★ NEW BEST SCORE ★' : `BEST   ${best.toLocaleString('en-US')}`, FIELD.width / 2, 464, 18, PALETTE.gold);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    text('↻  CLICK OR PRESS ENTER TO FLY AGAIN', FIELD.width / 2, 566, 22, '#80ed99');
    ctx.globalAlpha = 1;
  }

  return {
    resize,
    toArena,
    /** Paint the world for one screen. */
    draw(state, screen, best) {
      resize();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PALETTE.backdrop;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
      const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
      ctx.setTransform(scale, 0, 0, scale, offsetX + shakeX * scale, offsetY + shakeY * scale);
      drawBackground(state);
      drawPickups(state);
      drawEnemies(state);
      drawBullets(state);
      drawPlayer(state);
      drawParticles(state);
      if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_PAUSED) {
        drawHud(state, best);
      }
      if (screen === SCREEN_TITLE) drawTitle(state, best);
      if (screen === SCREEN_UPGRADE) drawUpgrade(state);
      if (screen === SCREEN_PAUSED) drawPaused(state);
      if (screen === SCREEN_OVER) drawOver(state, best);
    },
  };
}
