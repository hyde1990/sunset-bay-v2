// The HUD for Sunset Bay: DOM panels over the 3D canvas. Objective tracker,
// money/clock/wanted/REP, health and armour bars, speedometer, a live minimap
// (the city's ground texture with player, mission, police and traffic markers),
// subtitles, crosshair, and the title / pause / end screens with save slots.
// Text is only rewritten when it changes; the minimap redraws at 10 Hz.

import { SAVE_PREFIX } from './config.js';

const MAP_SIZE = 220;
const WORLD_SPAN = 560;

function el(id) {
  return document.getElementById(id);
}

export function createHud(S, city, callbacks) {
  const hud = el('hud');
  const objStage = el('obj-stage');
  const objText = el('obj-text');
  const objHint = el('obj-hint');
  const clockEl = el('hud-clock');
  const moneyEl = el('hud-money');
  const wantedEl = el('hud-wanted');
  const repEl = el('hud-rep');
  const locEl = el('loc-district');
  const hpBar = el('vit-hp');
  const hpNum = el('vit-hp-n');
  const arBar = el('vit-ar');
  const arNum = el('vit-ar-n');
  const ammoEl = el('hud-ammo');
  const vehEl = el('hud-vehicle');
  const vehSpeed = el('veh-speed');
  const vehName = el('veh-name');
  const subEl = el('hud-subtitle');
  const promptEl = el('hud-prompt');
  const crosshair = el('crosshair');
  const mapCanvas = el('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  const titleScreen = el('screen-title');
  const pauseScreen = el('screen-pause');
  const endScreen = el('screen-end');
  const endTitle = el('end-title');
  const endText = el('end-text');

  let mapTimer = 0;
  let subTimer = 0;
  let subQueue = [];
  let last = {};

  function setText(node, key, value) {
    if (last[key] !== value) {
      last[key] = value;
      node.textContent = value;
    }
  }

  function fmtClock(hour) {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    const hh = h < 10 ? `0${h}` : `${h}`;
    const mm = m < 10 ? `0${m}` : `${m}`;
    return `${hh}:${mm}`;
  }

  function stars(n) {
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < n ? '★' : '☆';
    return s;
  }

  function drawMinimap() {
    const g = mapCtx;
    g.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    g.drawImage(city.groundCanvas, 0, 0, MAP_SIZE, MAP_SIZE);
    const toMap = (x, z) => [((x + WORLD_SPAN / 2) / WORLD_SPAN) * MAP_SIZE, ((z + WORLD_SPAN / 2) / WORLD_SPAN) * MAP_SIZE];
    // Mission marker: pulsing gold diamond.
    const marker = S.missions ? S.missions.markerPos() : null;
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      const pulse = 6 + Math.sin(performance.now() * 0.005) * 2;
      g.fillStyle = '#ffc861';
      g.beginPath();
      g.moveTo(mx, my - pulse);
      g.lineTo(mx + pulse, my);
      g.lineTo(mx, my + pulse);
      g.lineTo(mx - pulse, my);
      g.closePath();
      g.fill();
    }
    // Traffic: small white dots.
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const car of S.cars) {
      if (car.kind !== 'traffic') continue;
      const [cx, cy] = toMap(car.x, car.z);
      g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // Police: red dots.
    g.fillStyle = '#ff4040';
    for (const car of S.cars) {
      if (car.kind !== 'police') continue;
      const [cx, cy] = toMap(car.x, car.z);
      g.beginPath();
      g.arc(cx, cy, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // Player: white arrow rotated by heading.
    const [px, py] = toMap(S.player.x, S.player.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(Math.sin(S.player.heading), Math.cos(S.player.heading)) + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1e1410';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  function dialogue(who, text) {
    subQueue.push({ who, text });
  }

  function refreshSlots() {
    for (let i = 0; i < 3; i += 1) {
      const slot = el(`slot-${i}`);
      if (!slot) continue;
      let raw = null;
      try { raw = window.localStorage.getItem(SAVE_PREFIX + i); } catch { raw = null; }
      if (raw) {
        try {
          const data = JSON.parse(raw);
          slot.textContent = `Slot ${i + 1} — $${data.money} · ${data.missionTitle || 'Sunset Bay'}`;
        } catch { slot.textContent = `Slot ${i + 1} — save`; }
      } else {
        slot.textContent = `Slot ${i + 1} — empty`;
      }
    }
  }

  function showTitle(hasSave) {
    titleScreen.hidden = false;
    pauseScreen.hidden = true;
    endScreen.hidden = true;
    hud.hidden = true;
    const cont = el('btn-continue');
    if (cont) cont.disabled = !hasSave;
    refreshSlots();
  }
  function showPause() {
    pauseScreen.hidden = false;
    refreshSlots();
  }
  function hidePause() {
    pauseScreen.hidden = true;
  }
  function showEnd(kind, text) {
    endScreen.hidden = false;
    endTitle.textContent = kind === 'busted' ? 'BUSTED' : kind === 'wasted' ? 'WASTED' : 'SUNSET BAY';
    endText.textContent = text;
  }
  function hideEnd() {
    endScreen.hidden = true;
  }
  function showHud() {
    hud.hidden = false;
    titleScreen.hidden = true;
    pauseScreen.hidden = true;
    endScreen.hidden = true;
  }

  // Wire the buttons once.
  const btnNew = el('btn-new');
  if (btnNew) btnNew.addEventListener('click', () => callbacks.onNewGame());
  const btnContinue = el('btn-continue');
  if (btnContinue) btnContinue.addEventListener('click', () => callbacks.onContinue());
  const btnResume = el('btn-resume');
  if (btnResume) btnResume.addEventListener('click', () => callbacks.onResume());
  const btnQuit = el('btn-quit');
  if (btnQuit) btnQuit.addEventListener('click', () => callbacks.onQuit());
  const btnRetry = el('btn-retry');
  if (btnRetry) btnRetry.addEventListener('click', () => callbacks.onRetry());
  for (let i = 0; i < 3; i += 1) {
    const slot = el(`slot-${i}`);
    if (slot) slot.addEventListener('click', () => callbacks.onSlot(i));
    const saveSlot = el(`save-${i}`);
    if (saveSlot) saveSlot.addEventListener('click', () => callbacks.onSaveSlot(i));
  }
  const vol = el('opt-volume');
  if (vol) vol.addEventListener('input', () => callbacks.onVolume(Number(vol.value)));
  const quality = el('opt-quality');
  if (quality) quality.addEventListener('change', () => callbacks.onQuality(quality.value));
  const vol2 = el('opt-volume-2');
  if (vol2) vol2.addEventListener('input', () => callbacks.onVolume(Number(vol2.value)));

  return {
    dialogue,
    showTitle,
    showPause,
    hidePause,
    showEnd,
    hideEnd,
    showHud,
    refreshSlots,
    setPrompt(text) {
      setText(promptEl, 'prompt', text);
    },
    update(dt) {
      // Subtitle queue.
      subTimer -= dt;
      if (subTimer <= 0) {
        const next = subQueue.shift();
        if (next) {
          subEl.innerHTML = '';
          const who = document.createElement('b');
          who.textContent = `${next.who}: `;
          subEl.appendChild(who);
          subEl.appendChild(document.createTextNode(next.text));
          subEl.hidden = false;
          subTimer = 3.6;
        } else {
          subEl.hidden = true;
        }
      }
      const job = S.missions ? S.missions.jobTitle() : 'Sunset Bay';
      setText(objStage, 'stage', job);
      setText(objText, 'obj', S.missions ? S.missions.objectiveText() : '');
      setText(objHint, 'hint', S.player.onFoot ? 'WASD move · E enter car · Click shoot · F punch' : 'WASD drive · E exit car · H horn · R radio');
      setText(clockEl, 'clock', fmtClock(S.timeHour));
      setText(moneyEl, 'money', `$${Math.floor(S.money)}`);
      setText(wantedEl, 'wanted', stars(S.wanted));
      wantedEl.style.color = S.wanted > 0 ? '#ff5a4a' : '';
      const rep = S.rep[S.district] || 0;
      setText(repEl, 'rep', `REP ${rep}`);
      setText(locEl, 'loc', S.district);
      hpBar.style.width = `${Math.max(0, S.player.health)}%`;
      setText(hpNum, 'hp', `${Math.ceil(Math.max(0, S.player.health))}`);
      arBar.style.width = `${Math.max(0, S.player.armor)}%`;
      setText(arNum, 'ar', `${Math.ceil(Math.max(0, S.player.armor))}`);
      setText(ammoEl, 'ammo', S.player.car ? '' : `AMMO ${S.player.ammo} / ${S.player.magSize}`);
      if (S.player.car) {
        vehEl.hidden = false;
        setText(vehSpeed, 'speed', `${Math.round(Math.abs(S.player.speed) * 3.6)}`);
        setText(vehName, 'vehname', S.player.car.isOwn ? 'Harbor Teal' : 'Street Car');
      } else {
        vehEl.hidden = true;
      }
      crosshair.hidden = Boolean(S.player.car);
      mapTimer -= dt;
      if (mapTimer <= 0) {
        mapTimer = 0.1;
        drawMinimap();
      }
    },
  };
}
