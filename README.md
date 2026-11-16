# Voidlight Arena

[![make.fun bounty](https://make.fun/b/best-game-01/badge.svg)](https://make.fun/b/best-game-01)
[![entry rank](https://make.fun/b/best-game-01/rank.svg?repo=voidlight-arena)](https://make.fun/b/best-game-01)
[![reward](https://make.fun/b/best-game-01/reward.svg)](https://make.fun/b/best-game-01)

**Voidlight Arena** is a neon arena survival shooter: fly a lone light-ship through waves of
void shards, chain kills into a combo multiplier, pick 1 of 3 upgrades after every cleared
wave, and break the Warden — the boss that arrives every 5th wave. One ship, one arena, no
way out but through.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network: `game/index.html` plus its ES modules under `game/src/` run from
any static server in a desktop browser.

| Control | Action |
| --- | --- |
| WASD / arrows | Fly |
| Mouse | Aim |
| Hold click / Space | Fire |
| Shift / right-click | Dash (brief invulnerability) |
| P | Pause |
| M | Mute |
| 1 / 2 / 3 or click | Pick an upgrade card |

## The loop

- **Waves that escalate** — drifters chase, spitters shoot from range, splitters burst into
  fast minis, and every 5th wave the Warden arrives with a radial bullet storm.
- **Choices that matter** — after each wave, choose 1 of 3 upgrades (damage, fire rate,
  multishot, hull, magnet, dash, pierce, speed). Builds stack and diverge.
- **Combo scoring** — kills chained inside 2.5 s raise the multiplier up to x8.
- **Pickups** — hull repair, rapid fire, shield, and the screen-clearing Nova.
- **Feel** — synthesized WebAudio sound (no audio files), screen shake, particles, floating
  score text, and a boss health bar. Best score is kept in the browser.

## Files

- `game/index.html` — the page; `game/src/main.js` — boot and the fixed-step loop
- `game/src/world.js` — simulation: player, enemies, waves, upgrades, collisions
- `game/src/render.js` — canvas drawing, HUD, and all five screens
- `game/src/audio.js` — WebAudio synth effects and the bass-pulse loop
- `game/src/input.js` — keyboard and mouse
- `game/src/shots.js` — deterministic screenshot scenes (`?shot=start|play|upgrade|end`)
- `game/src/config.js` — all tuning numbers and colours; `game/src/random.js` — seeded RNG
- `main.ts` — hands the game in; `screenshots/` — the four screenshots of the real game

## License

MIT — see [LICENSE](LICENSE).
