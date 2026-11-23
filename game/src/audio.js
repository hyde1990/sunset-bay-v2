// Procedural sound for Sunset Bay: no audio files at all. Everything is
// synthesised with WebAudio — engine hum, horn, gunshot, siren and three tiny
// radio stations (bass + lead patterns scheduled on the audio clock). If the
// browser has no AudioContext (headless screenshots) every call is a no-op.

const STATIONS = [
  { name: 'Bay FM', bpm: 96, bass: [0, 0, 7, 5], lead: [12, 15, 19, 15, 12, 10, 7, 10] },
  { name: 'Coral Nights', bpm: 72, bass: [0, 3, 5, 3], lead: [12, 12, 15, 19, 15, 12, 7, 5] },
  { name: 'Harbor Drive', bpm: 122, bass: [0, 0, 10, 7], lead: [12, 14, 17, 19, 17, 14, 12, 7] },
];
const BASE_FREQ = 55;

function noteFreq(semitones) {
  return BASE_FREQ * Math.pow(2, semitones / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let volume = 0.7;
  let muted = false;
  let station = 0;
  let radioOn = true;
  let nextNoteTime = 0;
  let noteIndex = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 110;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      nextNoteTime = ctx.currentTime + 0.1;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(type, freq, dur, gainValue, slideTo) {
    if (!ctx || !master) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gainValue, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch { /* sound is never fatal */ }
  }

  function noiseBurst(dur, gainValue) {
    if (!ctx || !master) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.value = gainValue;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start();
    } catch { /* sound is never fatal */ }
  }

  return {
    ensure,
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = muted ? 0 : volume;
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : volume;
    },
    isMuted() {
      return muted;
    },
    stationName() {
      return STATIONS[station].name;
    },
    cycleStation() {
      station = (station + 1) % STATIONS.length;
      noteIndex = 0;
      return STATIONS[station].name;
    },
    setRadio(on) {
      radioOn = on;
    },
    horn() {
      if (!ensure()) return;
      blip('square', 370, 0.28, 0.12);
      blip('square', 466, 0.28, 0.08);
    },
    gunshot() {
      if (!ensure()) return;
      noiseBurst(0.14, 0.5);
      blip('sine', 160, 0.1, 0.3, 50);
    },
    punch() {
      if (!ensure()) return;
      noiseBurst(0.08, 0.3);
    },
    pickup() {
      if (!ensure()) return;
      blip('sine', 660, 0.09, 0.15);
      setTimeout(() => blip('sine', 990, 0.12, 0.15), 90);
    },
    missionDone() {
      if (!ensure()) return;
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip('triangle', f, 0.16, 0.18), i * 110));
    },
    crash() {
      if (!ensure()) return;
      noiseBurst(0.25, 0.4);
      blip('sine', 90, 0.2, 0.35, 40);
    },
    /** Engine hum follows speed 0..1; call every frame. Siren wails while on. */
    update(dt, speed01, driving, sirenOn) {
      if (!ctx || !master) return;
      try {
        const target = driving ? 0.05 + speed01 * 0.11 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        engineOsc.frequency.setTargetAtTime(52 + speed01 * 95, ctx.currentTime, 0.1);
        engineOsc2.frequency.setTargetAtTime(104 + speed01 * 190, ctx.currentTime, 0.1);
        engineFilter.frequency.setTargetAtTime(380 + speed01 * 900, ctx.currentTime, 0.1);
        if (sirenOn) {
          sirenTimer -= dt;
          if (sirenTimer <= 0) {
            sirenTimer = 0.42;
            sirenHigh = !sirenHigh;
            sirenOsc.frequency.setTargetAtTime(sirenHigh ? 980 : 720, ctx.currentTime, 0.05);
          }
          sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
        } else {
          sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        }
        // Tiny radio sequencer: bass on the beat, lead every other beat.
        if (radioOn && ctx.currentTime >= nextNoteTime - 0.05) {
          const st = STATIONS[station];
          const beat = 60 / st.bpm / 2;
          const bassNote = st.bass[noteIndex % st.bass.length];
          const leadNote = st.lead[noteIndex % st.lead.length];
          const t = Math.max(ctx.currentTime, nextNoteTime);
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = noteFreq(bassNote);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.9);
          osc.connect(g);
          g.connect(master);
          osc.start(t);
          osc.stop(t + beat);
          if (noteIndex % 2 === 0) {
            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = noteFreq(leadNote);
            const g2 = ctx.createGain();
            g2.gain.setValueAtTime(0.0001, t);
            g2.gain.exponentialRampToValueAtTime(0.055, t + 0.02);
            g2.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.8);
            osc2.connect(g2);
            g2.connect(master);
            osc2.start(t);
            osc2.stop(t + beat * 2);
          }
          nextNoteTime = t + beat;
          noteIndex += 1;
        }
      } catch { /* sound is never fatal */ }
    },
  };
}
