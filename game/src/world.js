// Sunset Bay's city: a procedural coastal grid built once at boot. Streets
// every 40 m, blocks with instanced buildings (one draw call for all of them),
// palms, lamps and harbour containers — all instanced. The ground is one big
// plane with a painted canvas texture (roads, sidewalks, beach, water), which
// the minimap reuses. Nothing here allocates after createCity returns.

import * as THREE from 'three';
import { DISTRICTS, PALETTE, WORLD } from './config.js';

const STREETS = [];
for (let c = WORLD.streetMin; c <= WORLD.streetMax; c += WORLD.streetStep) STREETS.push(c);

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();

function facadeTexture(lit) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = lit ? '#000000' : '#e8dcc8';
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = 12 + col * 28;
      const y = 14 + row * 30;
      if (lit) {
        // Only some windows glow: a fixed pseudo-random pattern from the cell.
        const on = ((row * 4 + col) * 37 + 11) % 5 < 2;
        g.fillStyle = on ? '#ffd27a' : '#101418';
      } else {
        g.fillStyle = '#3a4a5a';
      }
      g.fillRect(x, y, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  const span = WORLD.half + 20; // world metres mapped to the canvas
  const toPx = (v) => ((v + span) / (span * 2)) * 1024;
  const pxPerM = 1024 / (span * 2);
  // Base pavement.
  g.fillStyle = '#b59a78';
  g.fillRect(0, 0, 1024, 1024);
  // Water on the west edge.
  const waterGrad = g.createLinearGradient(0, 0, toPx(-245), 0);
  waterGrad.addColorStop(0, '#1d5f7a');
  waterGrad.addColorStop(1, '#2e7f9e');
  g.fillStyle = waterGrad;
  g.fillRect(0, 0, toPx(-258), 1024);
  // Beach sand.
  g.fillStyle = '#e8cf9e';
  g.fillRect(toPx(-258), 0, toPx(-240) - toPx(-258), 1024);
  // City blocks.
  for (let i = 0; i < STREETS.length - 1; i += 1) {
    for (let j = 0; j < STREETS.length - 1; j += 1) {
      const x0 = STREETS[i] + 8;
      const z0 = STREETS[j] + 8;
      const w = WORLD.streetStep - 16;
      const park = ((i * 7 + j * 11) % 13) === 0;
      g.fillStyle = park ? '#7fae6a' : '#c9b18a';
      g.fillRect(toPx(x0), toPx(z0), w * pxPerM, w * pxPerM);
    }
  }
  // Roads.
  g.fillStyle = '#3a3f4a';
  for (const s of STREETS) {
    g.fillRect(toPx(s - 5), 0, 10 * pxPerM, 1024);
    g.fillRect(0, toPx(s - 5), 1024, 10 * pxPerM);
  }
  // Lane dashes.
  g.fillStyle = '#e8c33c';
  for (const s of STREETS) {
    for (let m = -240; m < 240; m += 16) {
      g.fillRect(toPx(s) - 1, toPx(m), 2, 8 * pxPerM);
      g.fillRect(toPx(m), toPx(s) - 1, 8 * pxPerM, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas: c, texture: tex };
}

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
  }
  return 'Old Town';
}

function districtHeight(name, random) {
  if (name === 'Hills') return random.range(18, 46);
  if (name === 'Old Town') return random.range(10, 28);
  if (name === 'Marina') return random.range(8, 18);
  return random.range(8, 13);
}

export function createCity(scene, random) {
  const colliders = [];
  function addCollider(x0, z0, x1, z1) {
    colliders.push({ x0, z0, x1, z1 });
  }

  // --- Ground ---
  const ground = groundTexture();
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry((WORLD.half + 20) * 2, (WORLD.half + 20) * 2),
    new THREE.MeshLambertMaterial({ map: ground.texture }),
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  // Shallow water plane west of the beach, slightly above the ground.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(60, (WORLD.half + 20) * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.85 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-272, 0.15, 0);
  scene.add(water);

  // --- Buildings (instanced) ---
  const placements = [];
  for (let i = 0; i < STREETS.length - 1; i += 1) {
    for (let j = 0; j < STREETS.length - 1; j += 1) {
      const bx0 = STREETS[i] + 8;
      const bz0 = STREETS[j] + 8;
      const park = ((i * 7 + j * 11) % 13) === 0;
      if (park) continue;
      const cx = bx0 + 12;
      const cz = bz0 + 12;
      const district = districtAt(cx, cz);
      const count = random.chance(0.45) ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        const w = random.range(10, count === 1 ? 20 : 11);
        const d = random.range(10, count === 1 ? 20 : 11);
        const x = count === 1 ? cx : bx0 + 6 + k * 12;
        const z = count === 1 ? cz : bz0 + 6 + ((k * 7) % 12);
        const h = districtHeight(district, random);
        placements.push({ x, z, w, d, h, district });
        addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
      }
    }
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const sideMat = new THREE.MeshLambertMaterial({
    map: facadeTexture(false),
    emissiveMap: facadeTexture(true),
    emissive: 0xffc861,
    emissiveIntensity: 0,
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.roof });
  const buildings = new THREE.InstancedMesh(boxGeo, [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat], placements.length);
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    tmpPos.set(p.x, 0, p.z);
    tmpQuat.identity();
    tmpScale.set(p.w, p.h, p.d);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    buildings.setMatrixAt(i, tmpMatrix);
    tmpColor.setHex(random.pick(PALETTE.building));
    buildings.setColorAt(i, tmpColor);
  }
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings);

  // --- Harbour containers (instanced) ---
  const containerSpots = [];
  for (let i = 0; i < 42; i += 1) {
    const x = random.range(-150, 150);
    const z = random.range(185, 245);
    containerSpots.push({ x, z, w: 12, d: 3, h: 3, stack: random.chance(0.4) ? 2 : 1 });
    addCollider(x - 6, z - 1.5, x + 6, z + 1.5);
  }
  const containers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    containerSpots.length,
  );
  containers.castShadow = true;
  for (let i = 0; i < containerSpots.length; i += 1) {
    const p = containerSpots[i];
    tmpPos.set(p.x, (p.h * p.stack) / 2, p.z);
    tmpQuat.identity();
    tmpScale.set(p.w, p.h * p.stack, p.d);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    containers.setMatrixAt(i, tmpMatrix);
    tmpColor.setHex(random.pick([0xc96f4a, 0x2e7f9e, 0xe8c33c, 0x8a6d4b]));
    containers.setColorAt(i, tmpColor);
  }
  containers.instanceMatrix.needsUpdate = true;
  if (containers.instanceColor) containers.instanceColor.needsUpdate = true;
  scene.add(containers);

  // --- Palms (instanced trunks + foliage) ---
  const palmSpots = [];
  for (let i = 0; i < 130; i += 1) {
    const alongBeach = random.chance(0.35);
    const x = alongBeach ? random.range(-252, -242) : random.pick(STREETS) + random.pick([-8, 8]);
    const z = alongBeach ? random.range(-240, 240) : random.range(-240, 240);
    if (x > -238 && Math.abs(x) < 250) palmSpots.push({ x, z, h: random.range(5, 8) });
    else if (alongBeach) palmSpots.push({ x, z, h: random.range(5, 8) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a6d4b }), palmSpots.length);
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  leafGeo.scale(1.6, 0.9, 1.6);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x4a7a3c }), palmSpots.length);
  leaves.castShadow = true;
  for (let i = 0; i < palmSpots.length; i += 1) {
    const p = palmSpots[i];
    tmpQuat.identity();
    tmpPos.set(p.x, 0, p.z);
    tmpScale.set(1, p.h, 1);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    trunks.setMatrixAt(i, tmpMatrix);
    tmpPos.set(p.x, p.h + 0.6, p.z);
    tmpScale.set(1.4, 1.4, 1.4);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    leaves.setMatrixAt(i, tmpMatrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  scene.add(trunks);
  scene.add(leaves);

  // --- Street lamps (instanced poles + glowing heads) ---
  const lampSpots = [];
  for (const s of STREETS) {
    for (let m = -220; m <= 220; m += 80) {
      lampSpots.push({ x: s + 7, z: m });
      lampSpots.push({ x: m, z: s + 7 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  poleGeo.translate(0, 2.7, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2f38 }), lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0x8a7a5a });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  for (let i = 0; i < lampSpots.length; i += 1) {
    const p = lampSpots[i];
    tmpQuat.identity();
    tmpPos.set(p.x, 0, p.z);
    tmpScale.set(1, 1, 1);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    poles.setMatrixAt(i, tmpMatrix);
    tmpPos.set(p.x, 5.5, p.z);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    heads.setMatrixAt(i, tmpMatrix);
  }
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(heads);

  // --- Harbour cranes (few plain meshes) ---
  for (let i = 0; i < 3; i += 1) {
    const crane = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 26, 3), new THREE.MeshLambertMaterial({ color: 0xc96f4a }));
    tower.position.y = 13;
    tower.castShadow = true;
    const jib = new THREE.Mesh(new THREE.BoxGeometry(22, 1.6, 1.6), new THREE.MeshLambertMaterial({ color: 0xe8c33c }));
    jib.position.set(8, 25, 0);
    jib.castShadow = true;
    crane.add(tower);
    crane.add(jib);
    crane.position.set(-120 + i * 110, 0, 232);
    scene.add(crane);
    addCollider(crane.position.x - 2, 230, crane.position.x + 2, 234);
  }

  // --- Collision + road helpers ---
  function collideCircle(x, z, radius) {
    let hit = false;
    let nx = x;
    let nz = z;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      const cx = Math.max(c.x0, Math.min(x, c.x1));
      const cz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          nx = cx + (dx / d) * radius;
          nz = cz + (dz / d) * radius;
        } else {
          nx = x + radius;
        }
        x = nx;
        z = nz;
      }
    }
    if (x < -WORLD.bound) { x = -WORLD.bound; hit = true; }
    if (x > WORLD.bound) { x = WORLD.bound; hit = true; }
    if (z < -WORLD.bound) { z = -WORLD.bound; hit = true; }
    if (z > WORLD.bound) { z = WORLD.bound; hit = true; }
    return { x, z, hit };
  }

  function nearestStreet(v) {
    let best = STREETS[0];
    let bestD = Math.abs(v - best);
    for (let i = 1; i < STREETS.length; i += 1) {
      const d = Math.abs(v - STREETS[i]);
      if (d < bestD) { bestD = d; best = STREETS[i]; }
    }
    return best;
  }

  function randomRoadPoint(cx, cz, minD, maxD) {
    for (let tries = 0; tries < 24; tries += 1) {
      const vertical = random.chance(0.5);
      const street = random.pick(STREETS);
      const along = random.range(-240, 240);
      const x = vertical ? street : along;
      const z = vertical ? along : street;
      const dx = x - cx;
      const dz = z - cz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= minD && d <= maxD) return { x, z };
    }
    return { x: nearestStreet(cx), z: cz };
  }

  function randomSidewalkPoint(cx, cz, minD, maxD) {
    const p = randomRoadPoint(cx, cz, minD, maxD);
    p.x += random.pick([-8, 8]);
    p.z += random.pick([-8, 8]);
    return p;
  }

  return {
    colliders,
    groundCanvas: ground.canvas,
    collideCircle,
    districtAt,
    nearestStreet,
    randomRoadPoint,
    randomSidewalkPoint,
    update(nightFactor) {
      sideMat.emissiveIntensity = nightFactor * 1.6;
      headMat.color.setHex(nightFactor > 0.5 ? 0xffd27a : 0x8a7a5a);
    },
  };
}
