// Sunset Bay v2 — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between title, play, paused, busted/wasted and story-complete.
// ?shot=cover|onfoot|night|title (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady.

import * as THREE from 'three';
import { PLAYER, QUALITY, SAVE_PREFIX, STEP, TIME, WANTED } from './config.js';
import { createRandom } from './random.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_HORN, ACTION_MUTE, ACTION_PAUSE,
  ACTION_PUNCH, ACTION_RADIO, ACTION_RELOAD, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createSky, nightFactorFor, updateSky } from './render.js';
import { createCity } from './world.js';
import { createVehicles } from './cars.js';
import { createPeople } from './people.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const START_POS = { x: -215, z: 0 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
const random = createRandom(seed);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.pixelRatioCap));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(-238, 26, -120);

const S = {
  money: 0,
  timeHour: TIME.startHour,
  nightFactor: 0,
  wanted: 0,
  wantedTimer: 0,
  hiddenTime: 0,
  decayAcc: 0,
  rep: { Marina: 0, 'Old Town': 0, Hills: 0, Harbor: 0 },
  district: 'Marina',
  storyDone: false,
  mission: { index: 0, step: 0, tailT: 0 },
  player: {
    x: START_POS.x, z: START_POS.z, heading: Math.PI / 2,
    onFoot: true, car: null, speed: 0,
    health: PLAYER.health, armor: 0, ammo: PLAYER.magSize, magSize: PLAYER.magSize,
    reloading: false, reloadT: 0, lastDamageT: -99, walkPhase: 0,
  },
  cars: [],
  missions: null,
};

const sky = createSky(scene);
const city = createCity(scene, random);
const audio = createAudio();

let mode = 'title';
let camYaw = Math.PI * 0.75;
let camPitch = 0.32;
let promptTimer = 0;
let fpsEma = 60;
let quality = 'high';

// --- Player character mesh (low-poly, built here) ---
const playerMesh = new THREE.Group();
const pTorso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32), new THREE.MeshLambertMaterial({ color: 0xd9503c }));
pTorso.position.y = 1.15;
pTorso.castShadow = true;
const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
pHead.position.y = 1.75;
pHead.castShadow = true;
const legMat = new THREE.MeshLambertMaterial({ color: 0x2a3040 });
const pLegL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.24), legMat);
pLegL.position.set(-0.14, 0.38, 0);
const pLegR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.24), legMat);
pLegR.position.set(0.14, 0.38, 0);
playerMesh.add(pTorso);
playerMesh.add(pHead);
playerMesh.add(pLegL);
playerMesh.add(pLegR);
scene.add(playerMesh);

const playerPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();

const hooks = {
  crime(level, msg) {
    S.wanted = Math.min(WANTED.max, S.wanted + level);
    S.wantedTimer = 0;
    S.hiddenTime = 0;
    S.decayAcc = 0;
    hud.setPrompt(msg);
    promptTimer = 3;
  },
  damage(n) {
    if (mode !== 'play') return;
    const absorbed = Math.min(S.player.armor, n * 0.5);
    S.player.armor -= absorbed;
    S.player.health -= (n - absorbed);
    S.player.lastDamageT = S.timeHour * 3600 + performance.now() / 1000;
    if (S.player.health <= 0) {
      S.player.health = 0;
      endGame('wasted');
    }
  },
  sound(name) {
    if (audio[name]) audio[name]();
  },
  dialogue(who, text) {
    hud.dialogue(who, text);
  },
  onBusted() {
    endGame('busted');
  },
};

const vehicles = createVehicles(scene, city, random, S, hooks);
const people = createPeople(scene, city, random, S, hooks);
const missions = createMissions(scene, city, random, S, hooks);
S.missions = missions;

const hud = createHud(S, city, {
  onNewGame() {
    newGame();
  },
  onContinue() {
    let last = null;
    try { last = window.localStorage.getItem(SAVE_PREFIX + 'last'); } catch { last = null; }
    if (last !== null) loadSlot(Number(last));
    else newGame();
  },
  onSlot(i) {
    loadSlot(i);
  },
  onSaveSlot(i) {
    saveSlot(i);
  },
  onResume() {
    mode = 'play';
    hud.hidePause();
  },
  onQuit() {
    mode = 'title';
    hud.showTitle(true);
  },
  onRetry() {
    respawn();
  },
  onVolume(v) {
    audio.setVolume(v);
  },
  onQuality(q) {
    quality = q;
    applyQuality();
  },
});

function applyQuality() {
  if (quality === 'low') {
    renderer.setPixelRatio(QUALITY.pixelRatioLow);
    renderer.shadowMap.enabled = false;
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.pixelRatioCap));
    renderer.shadowMap.enabled = true;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const G = {
  S, scene, camera, city, vehicles, people, missions, hud, sky, random,
  shotCam: null,
  tick,
};

function newGame() {
  S.money = 0;
  S.timeHour = TIME.startHour;
  S.wanted = 0;
  S.rep = { Marina: 0, 'Old Town': 0, Hills: 0, Harbor: 0 };
  S.storyDone = false;
  S.mission = { index: 0, step: 0, tailT: 0 };
  const p = S.player;
  p.x = START_POS.x;
  p.z = START_POS.z;
  p.heading = Math.PI / 2;
  p.onFoot = true;
  p.car = null;
  p.speed = 0;
  p.health = PLAYER.health;
  p.armor = 0;
  p.ammo = PLAYER.magSize;
  p.reloading = false;
  camYaw = Math.PI * 0.75;
  mode = 'play';
  hud.showHud();
  audio.ensure();
  missions.startJob(0);
}

function saveSlot(i) {
  const p = S.player;
  const data = {
    money: S.money, missionIndex: S.mission.index, rep: S.rep,
    x: p.x, z: p.z, heading: p.heading, timeHour: S.timeHour,
    health: p.health, armor: p.armor, ammo: p.ammo,
  };
  try {
    window.localStorage.setItem(SAVE_PREFIX + i, JSON.stringify(data));
    window.localStorage.setItem(SAVE_PREFIX + 'last', String(i));
  } catch { /* storage can be off */ }
  hud.refreshSlots();
}

function loadSlot(i) {
  let raw = null;
  try { raw = window.localStorage.getItem(SAVE_PREFIX + i); } catch { raw = null; }
  if (!raw) return;
  let data;
  try { data = JSON.parse(raw); } catch { return; }
  S.money = data.money || 0;
  S.rep = data.rep || S.rep;
  S.timeHour = data.timeHour || TIME.startHour;
  const p = S.player;
  p.x = data.x ?? START_POS.x;
  p.z = data.z ?? START_POS.z;
  p.heading = data.heading ?? 0;
  p.health = data.health ?? PLAYER.health;
  p.armor = data.armor ?? 0;
  p.ammo = data.ammo ?? PLAYER.magSize;
  p.onFoot = true;
  p.car = null;
  mode = 'play';
  hud.showHud();
  audio.ensure();
  missions.startJob(data.missionIndex || 0);
}

function respawn() {
  const p = S.player;
  if (p.car) vehicles.exitCar();
  p.x = START_POS.x;
  p.z = START_POS.z;
  p.heading = Math.PI / 2;
  p.onFoot = true;
  p.car = null;
  p.health = PLAYER.health;
  p.armor = 0;
  p.ammo = PLAYER.magSize;
  S.wanted = 0;
  S.wantedTimer = 0;
  S.hiddenTime = 0;
  mode = 'play';
  hud.showHud();
  missions.startJob(S.mission.index);
}

function endGame(kind) {
  if (mode !== 'play') return;
  mode = 'end';
  if (kind === 'busted') hud.showEnd('busted', 'The Bay PD caught you. Your crew posts bail — try again.');
  else if (kind === 'wasted') hud.showEnd('wasted', 'You went down in the streets of Sunset Bay. Try again.');
  else hud.showEnd('complete', 'Story complete — Sunset Bay is yours. Keep cruising.');
}

function hasSave() {
  for (let i = 0; i < 3; i += 1) {
    try {
      if (window.localStorage.getItem(SAVE_PREFIX + i)) return true;
    } catch { /* ignore */ }
  }
  return false;
}

function policeNear(dist) {
  for (const car of S.cars) {
    if (car.kind !== 'police') continue;
    const dx = car.x - S.player.x;
    const dz = car.z - S.player.z;
    if (dx * dx + dz * dz < dist * dist) return true;
  }
  return false;
}

function movePlayerOnFoot(dt, input) {
  const p = S.player;
  const my = input.moveY();
  const mx = input.moveX();
  if (my === 0 && mx === 0) return;
  const fx = -Math.sin(camYaw);
  const fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw);
  const rz = -Math.sin(camYaw);
  let dx = fx * my + rx * mx;
  let dz = fz * my + rz * mx;
  const len = Math.sqrt(dx * dx + dz * dz);
  dx /= len;
  dz /= len;
  const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const nx = p.x + dx * speed * dt;
  const nz = p.z + dz * speed * dt;
  const res = city.collideCircle(nx, nz, PLAYER.radius);
  p.x = res.x;
  p.z = res.z;
  p.heading = Math.atan2(dx, dz);
  p.speed = speed;
  p.walkPhase += speed * dt * 1.7;
}

function tick(dt, input) {
  const p = S.player;
  S.timeHour = (S.timeHour + dt / 150) % 24;
  S.nightFactor = nightFactorFor(S.timeHour);
  playerPos.set(p.x, 0, p.z);
  updateSky(sky, S.timeHour, playerPos, S.nightFactor);
  city.update(S.nightFactor);
  if (p.onFoot && (mode === 'play' || mode === 'shot')) movePlayerOnFoot(dt, input);
  vehicles.update(dt, input);
  people.update(dt);
  missions.update(dt);
  // Wanted decay: hide from every cop for a while and the heat drops.
  if (S.wanted > 0) {
    if (policeNear(WANTED.hideDistance)) {
      S.hiddenTime = 0;
      S.decayAcc = 0;
    } else {
      S.hiddenTime += dt;
      if (S.hiddenTime > WANTED.decayDelay) {
        S.decayAcc += dt;
        if (S.decayAcc >= WANTED.decayStep) {
          S.wanted -= 1;
          S.decayAcc = 0;
        }
      }
    }
  }
  // Health regen after a quiet spell.
  if (p.health > 0 && p.health < PLAYER.health && performance.now() / 1000 - p.lastDamageT > PLAYER.regenDelay) {
    p.health = Math.min(PLAYER.health, p.health + PLAYER.regenRate * dt);
  }
  // Reload timer.
  if (p.reloading) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      p.reloading = false;
      p.ammo = p.magSize;
    }
  }
  S.district = city.districtAt(p.x, p.z);
  // Sync the character mesh.
  playerMesh.visible = p.onFoot;
  if (p.onFoot) {
    playerMesh.position.set(p.x, 0, p.z);
    playerMesh.rotation.y = p.heading;
    const swing = Math.sin(p.walkPhase) * 0.5;
    pLegL.rotation.x = swing;
    pLegR.rotation.x = -swing;
    pTorso.position.y = 1.15 + Math.abs(Math.sin(p.walkPhase)) * 0.05;
  }
  if (promptTimer > 0) {
    promptTimer -= dt;
    if (promptTimer <= 0) hud.setPrompt('');
  }
  const driving = Boolean(p.car);
  const speed01 = driving ? Math.abs(p.speed) / 38 : Math.abs(p.speed || 0) / 10;
  audio.update(dt, speed01, driving, policeNear(90) && S.wanted > 0);
}

function updateCamera(dtFrame) {
  if (G.shotCam) {
    camera.position.copy(G.shotCam.pos);
    camera.lookAt(G.shotCam.look);
    return;
  }
  const p = S.player;
  if (mode === 'title') {
    const t = performance.now() * 0.00004;
    camera.position.set(Math.sin(t) * 190, 62, Math.cos(t) * 190);
    camera.lookAt(0, 8, 0);
    return;
  }
  const drag = input.takeDrag();
  camYaw -= drag.x * 0.005;
  camPitch = Math.max(0.08, Math.min(1.05, camPitch + drag.y * 0.003));
  if (!p.onFoot) {
    const target = p.heading + Math.PI;
    let diff = target - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, 2.2 * dtFrame);
  }
  const dist = p.onFoot ? 7.5 : 11;
  const hDist = dist * Math.cos(camPitch);
  const vDist = dist * Math.sin(camPitch);
  camTarget.set(
    p.x + Math.sin(camYaw) * hDist,
    1.6 + vDist,
    p.z + Math.cos(camYaw) * hDist,
  );
  const k = 1 - Math.exp(-8 * dtFrame);
  camera.position.lerp(camTarget, k);
  if (camera.position.y < 1.2) camera.position.y = 1.2;
  camera.lookAt(p.x, 1.6, p.z);
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    if (mode === 'play') {
      mode = 'paused';
      hud.showPause();
    } else if (mode === 'paused') {
      mode = 'play';
      hud.hidePause();
    }
    return;
  }
  if (mode !== 'play') {
    if (actions & ACTION_CONFIRM) {
      if (mode === 'title') newGame();
      else if (mode === 'end') respawn();
    }
    return;
  }
  if (actions & ACTION_ENTER) {
    if (S.player.onFoot) vehicles.enterCar();
    else vehicles.exitCar();
  }
  if (actions & ACTION_PUNCH && S.player.onFoot) {
    const p = S.player;
    const hit = people.punchAt(p.x + Math.sin(p.heading) * 1.6, p.z + Math.cos(p.heading) * 1.6, PLAYER.punchRange);
    audio.punch();
    if (hit) hooks.crime(1, 'Assault in broad daylight');
  }
  if (actions & ACTION_RELOAD && !S.player.reloading && S.player.ammo < S.player.magSize) {
    S.player.reloading = true;
    S.player.reloadT = PLAYER.reloadSeconds;
  }
  if (actions & ACTION_HORN && S.player.car) audio.horn();
  if (actions & ACTION_RADIO) {
    const name = audio.cycleStation();
    hud.dialogue('Radio', `Now playing: ${name}`);
  }
  if (actions & ACTION_MUTE) audio.setMuted(!audio.isMuted());
  if (input.takeShoot() && S.player.onFoot && !S.player.reloading) {
    const p = S.player;
    if (p.ammo <= 0) {
      p.reloading = true;
      p.reloadT = PLAYER.reloadSeconds;
    } else {
      p.ammo -= 1;
      audio.gunshot();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1;
      const hit = people.shootAt(p.x, p.z, dir.x / len, dir.z / len, PLAYER.shootRange);
      if (hit) {
        if (hit.kind === 'police') hooks.crime(1, 'You shot a cop');
        else if (hit.kind === 'ped') hooks.crime(1, 'You shot a pedestrian');
      }
    }
  }
  // Context prompt: near a car, offer to enter it.
  if (S.player.onFoot) {
    const near = vehicles.nearestParked(S.player.x, S.player.z, 3.2);
    if (near && promptTimer <= 0) hud.setPrompt(near.isOwn ? 'Press E — your Harbor Teal' : 'Press E — take the car');
  } else if (promptTimer <= 0) {
    hud.setPrompt('Press E — get out');
  }
}

const input = createInput(canvas);

function runShot(name) {
  mode = 'shot';
  const staged = stageShot(name, G);
  if (staged.screen === 'title') {
    hud.showTitle(hasSave());
  } else {
    hud.showHud();
  }
  hud.update(0.1);
  playerPos.set(S.player.x, 0, S.player.z);
  S.nightFactor = nightFactorFor(S.timeHour);
  updateSky(sky, S.timeHour, playerPos, S.nightFactor);
  city.update(S.nightFactor);
  function paint() {
    renderer.render(scene, camera);
  }
  paint();
  requestAnimationFrame(() => {
    paint();
    window.__shotReady = true;
  });
}

function runGame() {
  mode = 'title';
  hud.showTitle(hasSave());
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dtFrame = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (dtFrame > 0) fpsEma = fpsEma * 0.95 + (1 / dtFrame) * 0.05;
    window.__fps = Math.round(fpsEma);
    handleActions();
    if (mode === 'play') {
      accumulator += Math.min(dtFrame, MAX_FRAME);
      while (accumulator >= STEP) {
        tick(STEP, input);
        accumulator -= STEP;
      }
    }
    updateCamera(dtFrame);
    renderer.render(scene, camera);
    if (mode === 'play' || mode === 'paused' || mode === 'end') hud.update(dtFrame);
  }
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'play') {
      mode = 'paused';
      hud.showPause();
    }
  });
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
