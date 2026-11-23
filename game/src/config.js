// Sunset Bay v2 — every tuning number and colour in one place.
// The city is a 520 x 520 m grid in the XZ plane. Streets run every 40 m;
// blocks sit between them. West is the beach, south is the harbour.

/** Fixed simulation step, seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Local storage prefix for save slots (this browser only). */
export const SAVE_PREFIX = 'sunset-bay-v2.save.';

export const WORLD = {
  half: 260,
  streetStep: 40,
  streetMin: -240,
  streetMax: 240,
  roadWidth: 10,
  sidewalk: 3,
  bound: 255,
};

export const DISTRICTS = [
  { name: 'Marina', x0: -260, x1: -160, z0: -260, z1: 260, tint: 0x2ec4b6 },
  { name: 'Harbor', x0: -160, x1: 260, z0: 160, z1: 260, tint: 0x8a6d4b },
  { name: 'Hills', x0: 80, x1: 260, z0: -260, z1: 160, tint: 0xc96f4a },
  { name: 'Old Town', x0: -160, x1: 80, z0: -260, z1: 160, tint: 0xffc861 },
];

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  radius: 0.6,
  height: 1.8,
  health: 100,
  armorMax: 100,
  enterDistance: 3.2,
  punchRange: 2.2,
  punchDamage: 34,
  shootRange: 70,
  pistolDamage: 34,
  magSize: 12,
  reloadSeconds: 1.2,
  regenDelay: 8,
  regenRate: 3,
};

export const CAR = {
  accel: 16,
  brake: 34,
  reverseAccel: 10,
  maxSpeed: 38,
  reverseMax: 11,
  steerMax: 0.62,
  grip: 2.6,
  radius: 2.1,
  parkCount: 12,
};

export const TRAFFIC = {
  count: 16,
  speedMin: 8,
  speedMax: 13,
  radius: 2.1,
  simRadius: 200,
  respawnRadius: 260,
};

export const PED = {
  count: 26,
  walkMin: 1.1,
  walkMax: 1.7,
  runSpeed: 4.2,
  radius: 0.5,
  simRadius: 200,
  respawnRadius: 260,
};

export const POLICE = {
  chaseSpeed: 33,
  ramDamage: 9,
  bustDistance: 4,
  bustSeconds: 1.6,
  spawnDistance: 95,
  maxCars: 4,
};

export const WANTED = {
  max: 5,
  decayDelay: 10,
  decayStep: 4,
  stealNearPolice: 50,
  crashSpeed: 15,
  hideDistance: 60,
};

export const TIME = {
  startHour: 17.3,
  hoursPerSecond: 1 / 150,
  sunsetHour: 18.6,
  nightHour: 19.6,
  dawnHour: 6.0,
};

export const QUALITY = {
  pixelRatioCap: 1.5,
  pixelRatioLow: 1.0,
  shadowMap: 1024,
  shadowRange: 130,
};

export const PALETTE = {
  sun: 0xffb36b,
  sunNight: 0x8fa8ff,
  skyTopDay: 0x7fb2e5,
  skyTopSunset: 0x2e4a7a,
  skyTopNight: 0x0a1026,
  horizonDay: 0xcfe8f5,
  horizonSunset: 0xff9a5c,
  horizonNight: 0x1c2a4a,
  fogDay: 0xcfd8e0,
  fogSunset: 0xe8a06a,
  fogNight: 0x141c30,
  ground: 0x9a8a76,
  sand: 0xe8cf9e,
  water: 0x2e7f9e,
  asphalt: 0x3a3f4a,
  building: [0xe8d9c0, 0xd98a5f, 0xc96f4a, 0xf2e3c9, 0x7fb3a8, 0xe8b4a0, 0xb08968],
  roof: 0x5a4636,
  car: [0xd9503c, 0x2e7f9e, 0xe8c33c, 0x4a7a3c, 0xe8e0d0, 0x7a5aa0, 0x3c5a8a],
  police: 0x1e2a3a,
  taxi: 0xe8c33c,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
