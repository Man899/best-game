// Headless play-test + screenshot driver for Voidlight Arena, over Chrome DevTools Protocol.
// Node 22+ (global WebSocket, no dependencies). Usage:
//   node cdp-shots.mjs <base-url>   # takes the 4 screenshots from shots.json into screenshots/
//   node cdp-shots.mjs <base-url> --playtest   # also drives a real game with keyboard/mouse
// Requires a headless Chrome with --remote-debugging-port=9222 already running.
import { readFileSync, writeFileSync } from 'node:fs';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const base = positional[0] ?? 'file:///home/hatch/workspace/tools/makefun/best-game-entry/game/index.html';
const playtest = process.argv.includes('--playtest');
const shots = JSON.parse(readFileSync(new URL('./shots.json', import.meta.url), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(url) {
  const res = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let msgId = 0;
  const pending = new Map();
  const listeners = [];
  const page = {
    onConsole(fn) { listeners.push(fn); },
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    async eval(expression) {
      const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      return r.result.value;
    },
    close() { ws.close(); },
  };
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(`${data.error.code}: ${data.error.message}`));
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      listeners.forEach((fn) => fn(`${data.params.type}: ${text}`));
    } else if (data.method === 'Runtime.exceptionThrown') {
      listeners.forEach((fn) => fn('EXCEPTION: ' + (data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text)));
    }
  };
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url });
  return page;
}

async function waitFor(page, expression, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await page.eval(expression)) return true;
    } catch { /* page still loading */ }
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function sendKey(page, type, key, code, vk) {
  await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk });
}

async function tapKey(page, key, code, vk) {
  await sendKey(page, 'keyDown', key, code, vk);
  await sendKey(page, 'keyUp', key, code, vk);
}

const consoleLines = [];

for (const shot of shots) {
  const page = await openPage(`${base}${shot.query}`);
  page.onConsole((line) => consoleLines.push(`[${shot.name}] ${line}`));
  await waitFor(page, 'window.__shotReady === true', 30000, `__shotReady for ${shot.name}`);
  const state = await page.eval(`({screen: window.__voidlight.getScreen(), score: window.__voidlight.world.state.score, wave: window.__voidlight.world.state.wave, kills: window.__voidlight.world.state.kills, enemies: window.__voidlight.world.state.enemies.length, hp: Math.round(window.__voidlight.world.state.player.hp), alive: window.__voidlight.world.state.player.alive, offer: window.__voidlight.world.state.offer.length})`);
  const shotData = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  const out = new URL(`./screenshots/${shot.name}`, import.meta.url);
  writeFileSync(out, Buffer.from(shotData.data, 'base64'));
  console.log(`${shot.name}: screen=${state.screen} wave=${state.wave} score=${state.score} kills=${state.kills} enemies=${state.enemies} hp=${state.hp} alive=${state.alive} offer=${state.offer}`);
  page.close();
}

if (playtest) {
  const page = await openPage(`${base}?seed=42`);
  page.onConsole((line) => consoleLines.push(`[play] ${line}`));
  await waitFor(page, 'window.__voidlight !== undefined', 15000, 'game boot');
  console.log('boot screen:', await page.eval('window.__voidlight.getScreen()'));
  await tapKey(page, 'Enter', 'Enter', 13);
  await sleep(500);
  console.log('after Enter:', await page.eval('window.__voidlight.getScreen()'));
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 360 });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 });
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  const t0 = Date.now();
  let ki = 0;
  let picked = 0;
  while (Date.now() - t0 < 60000) {
    const code = keys[ki % keys.length];
    ki += 1;
    await sendKey(page, 'keyDown', code.slice(3).toLowerCase(), code, 0);
    const a = (Date.now() - t0) / 1000;
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640 + Math.cos(a) * 300, y: 360 + Math.sin(a) * 200 });
    await sleep(900);
    await sendKey(page, 'keyUp', code.slice(3).toLowerCase(), code, 0);
    const s = await page.eval(`({screen: window.__voidlight.getScreen(), score: window.__voidlight.world.state.score, wave: window.__voidlight.world.state.wave, kills: window.__voidlight.world.state.kills, hp: Math.round(window.__voidlight.world.state.player.hp), waveState: window.__voidlight.world.state.waveState})`);
    console.log(`t=${Math.round((Date.now() - t0) / 1000)}s screen=${s.screen} wave=${s.wave} (${s.waveState}) score=${s.score} kills=${s.kills} hp=${s.hp}`);
    if (s.screen === 'upgrade') {
      picked += 1;
      console.log('upgrade screen reached, picking card 1');
      await tapKey(page, '1', 'Digit1', 49);
      await sleep(300);
      console.log('after pick:', await page.eval('window.__voidlight.getScreen()'), 'wave:', await page.eval('window.__voidlight.world.state.wave'));
    }
    if (s.screen === 'over') break;
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 });
  const final = await page.eval(`({screen: window.__voidlight.getScreen(), score: window.__voidlight.world.state.score, wave: window.__voidlight.world.state.wave, kills: window.__voidlight.world.state.kills, hp: Math.round(window.__voidlight.world.state.player.hp)})`);
  console.log('PLAYTEST FINAL:', JSON.stringify(final), 'upgrades picked:', picked);
  if (final.screen === 'over') {
    await tapKey(page, 'Enter', 'Enter', 13);
    await sleep(400);
    console.log('after restart Enter:', await page.eval('window.__voidlight.getScreen()'), 'score:', await page.eval('window.__voidlight.world.state.score'));
  }
  // Pause check: press P during play, confirm paused, resume.
  const scr = await page.eval('window.__voidlight.getScreen()');
  if (scr === 'play') {
    await tapKey(page, 'p', 'KeyP', 80);
    await sleep(300);
    console.log('after P:', await page.eval('window.__voidlight.getScreen()'));
    await tapKey(page, 'p', 'KeyP', 80);
    await sleep(300);
    console.log('after P again:', await page.eval('window.__voidlight.getScreen()'));
  }
  page.close();
}

console.log('--- console output (errors/warnings only) ---');
const interesting = consoleLines.filter((l) => /error|exception|failed|warning/i.test(l));
console.log(interesting.length ? interesting.join('\n') : '(none)');
console.log('total console lines:', consoleLines.length);
process.exit(0);
