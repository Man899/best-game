// All sound is synthesized with WebAudio: no audio files, no network. The context is created
// lazily on the first player gesture (browsers block audio before one) and every effect is a
// short oscillator/noise burst. A quiet bass-pulse loop starts with the game; M mutes all of it.

function makeNoiseBuffer(context) {
  const length = context.sampleRate * 0.5;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let noise = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  /** Bass notes of the loop, in Hz (A minor, driving eighths). */
  const BASS_LINE = [55, 55, 65.41, 55, 49, 55, 82.41, 73.42];

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      noise = makeNoiseBuffer(context);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, volume, slideTo) {
    if (!ensure() || muted) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function burst(dur, volume, filterFreq) {
    if (!ensure() || muted) return;
    const now = context.currentTime;
    const src = context.createBufferSource();
    src.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  function musicTick() {
    if (!context || muted) return;
    const note = BASS_LINE[musicStep % BASS_LINE.length];
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'triangle';
    osc.frequency.value = note;
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain).connect(musicGain);
    osc.start(now);
    osc.stop(now + 0.24);
    if (musicStep % 4 === 2) {
      const hat = context.createBufferSource();
      hat.buffer = noise;
      const hp = context.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      const hg = context.createGain();
      hg.gain.setValueAtTime(0.12, now);
      hg.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      hat.connect(hp).connect(hg).connect(musicGain);
      hat.start(now);
      hat.stop(now + 0.06);
    }
    musicStep += 1;
  }

  return {
    /** Call from any gesture so the context is allowed to start. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    startMusic() {
      if (!ensure() || musicTimer !== null) return;
      musicTimer = window.setInterval(musicTick, 210);
    },
    stopMusic() {
      if (musicTimer !== null) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    shoot() {
      tone(880, 0.09, 'square', 0.10, 220);
    },
    hit() {
      burst(0.08, 0.14, 2400);
    },
    explode() {
      burst(0.35, 0.30, 900);
      tone(160, 0.3, 'sine', 0.25, 40);
    },
    playerHit() {
      tone(220, 0.25, 'sawtooth', 0.22, 60);
      burst(0.2, 0.2, 700);
    },
    pickup() {
      tone(660, 0.1, 'sine', 0.18);
      window.setTimeout(() => tone(990, 0.14, 'sine', 0.18), 70);
    },
    dash() {
      burst(0.16, 0.16, 3200);
    },
    waveHorn() {
      tone(220, 0.35, 'sawtooth', 0.14, 440);
      window.setTimeout(() => tone(330, 0.3, 'sawtooth', 0.12, 440), 120);
    },
    upgrade() {
      [523, 659, 784].forEach((freq, i) => window.setTimeout(() => tone(freq, 0.16, 'triangle', 0.18), i * 80));
    },
    gameOver() {
      [392, 311, 233, 175].forEach((freq, i) => window.setTimeout(() => tone(freq, 0.3, 'triangle', 0.18), i * 160));
    },
  };
}
