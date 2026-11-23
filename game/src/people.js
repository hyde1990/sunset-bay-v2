// Traffic and pedestrians for Sunset Bay. Traffic cars drive the street grid
// (straight through intersections, sometimes turning), keep a gap to the car
// ahead, and only simulate within 200 m of the player — farther away they are
// frozen, and beyond 260 m they respawn near the player. Pedestrians stroll
// the sidewalks, flee a speeding car, and fall when hit. No per-frame allocation.

import * as THREE from 'three';
import { PALETTE, PED, TRAFFIC } from './config.js';
import { makeCarMesh } from './cars.js';

const CARDINAL = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function pedMesh(shirtColor) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.85, 0.3),
    new THREE.MeshLambertMaterial({ color: shirtColor }),
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }),
  );
  head.position.y = 1.68;
  head.castShadow = true;
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.7, 0.26),
    new THREE.MeshLambertMaterial({ color: 0x2a3040 }),
  );
  legs.position.y = 0.35;
  group.add(torso);
  group.add(head);
  group.add(legs);
  group.userData.legs = legs;
  return group;
}

export function createPeople(scene, city, random, S, hooks) {
  const traffic = [];
  const peds = [];

  function spawnTrafficCar(px, pz) {
    const p = city.randomRoadPoint(px, pz, 40, 150);
    const vertical = random.chance(0.5);
    const heading = vertical ? random.pick([0, Math.PI]) : random.pick([Math.PI / 2, -Math.PI / 2]);
    const mesh = makeCarMesh(random.pick(PALETTE.car), false);
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      mesh, x: p.x, z: p.z, heading,
      speed: random.range(TRAFFIC.speedMin, TRAFFIC.speedMax),
      targetSpeed: random.range(TRAFFIC.speedMin, TRAFFIC.speedMax),
      kind: 'traffic', active: true, radius: TRAFFIC.radius,
      wheels: mesh.userData.wheels, turnedX: p.x, turnedZ: p.z,
    };
    traffic.push(car);
    S.cars.push(car);
    return car;
  }

  function spawnPed(px, pz) {
    const p = city.randomSidewalkPoint(px, pz, 10, 140);
    const mesh = pedMesh(random.pick([0xd9503c, 0x2e7f9e, 0xe8c33c, 0x4a7a3c, 0xe8e0d0, 0x7a5aa0]));
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    const ped = {
      mesh, x: p.x, z: p.z,
      heading: random.pick(CARDINAL),
      speed: random.range(PED.walkMin, PED.walkMax),
      state: 'walk', downT: 0, walkT: 0,
    };
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar(S.player.x, S.player.z);
  for (let i = 0; i < PED.count; i += 1) spawnPed(S.player.x, S.player.z);

  function dist2(ax, az, bx, bz) {
    const dx = ax - bx;
    const dz = az - bz;
    return dx * dx + dz * dz;
  }

  function nearIntersection(x, z) {
    const sx = city.nearestStreet(x);
    const sz = city.nearestStreet(z);
    return Math.abs(x - sx) < 2.5 && Math.abs(z - sz) < 2.5;
  }

  function updateTraffic(dt) {
    for (const car of traffic) {
      const d2 = dist2(car.x, car.z, S.player.x, S.player.z);
      if (d2 > TRAFFIC.respawnRadius * TRAFFIC.respawnRadius) {
        const p = city.randomRoadPoint(S.player.x, S.player.z, 40, 150);
        car.x = p.x;
        car.z = p.z;
        car.heading = random.pick(CARDINAL);
        car.speed = car.targetSpeed;
        continue;
      }
      const active = d2 < TRAFFIC.simRadius * TRAFFIC.simRadius;
      car.mesh.visible = active;
      if (!active) continue;
      // Keep a gap to the car ahead on the same heading.
      let want = car.targetSpeed;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      for (const other of S.cars) {
        if (other === car || !other.active) continue;
        const ox = other.x - car.x;
        const oz = other.z - car.z;
        const ahead = ox * fx + oz * fz;
        const side = Math.abs(ox * fz - oz * fx);
        if (ahead > 0 && ahead < 12 && side < 3) {
          want = Math.min(want, Math.max(0, other.speed - 1));
        }
      }
      car.speed += Math.max(-8 * dt, Math.min(8 * dt, want - car.speed));
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      if (nearIntersection(car.x, car.z)) {
        const moved = Math.abs(car.x - car.turnedX) + Math.abs(car.z - car.turnedZ);
        if (moved > 30 && random.chance(0.35)) {
          car.heading += random.pick([-Math.PI / 2, Math.PI / 2]);
          car.turnedX = car.x;
          car.turnedZ = car.z;
        }
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
    }
  }

  function updatePeds(dt) {
    for (const ped of peds) {
      const d2 = dist2(ped.x, ped.z, S.player.x, S.player.z);
      if (ped.state === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) {
          const p = city.randomSidewalkPoint(S.player.x, S.player.z, 30, 140);
          ped.x = p.x;
          ped.z = p.z;
          ped.state = 'walk';
          ped.mesh.rotation.x = 0;
          ped.mesh.visible = true;
        }
        continue;
      }
      if (d2 > PED.respawnRadius * PED.respawnRadius) {
        const p = city.randomSidewalkPoint(S.player.x, S.player.z, 20, 140);
        ped.x = p.x;
        ped.z = p.z;
        continue;
      }
      const active = d2 < PED.simRadius * PED.simRadius;
      ped.mesh.visible = active;
      if (!active) continue;
      // Flee a fast car bearing down on them.
      const playerCar = S.player.car;
      if (playerCar && Math.abs(playerCar.speed) > 8) {
        const dx = ped.x - playerCar.x;
        const dz = ped.z - playerCar.z;
        const dd = Math.sqrt(dx * dx + dz * dz);
        if (dd < 10) {
          ped.state = 'flee';
          ped.heading = Math.atan2(dx, dz);
          ped.speed = PED.runSpeed;
        }
      }
      if (ped.state === 'flee') {
        ped.walkT += dt;
        if (ped.walkT > 2.5) {
          ped.state = 'walk';
          ped.speed = random.range(PED.walkMin, PED.walkMax);
          ped.walkT = 0;
        }
      }
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      const res = city.collideCircle(ped.x, ped.z, PED.radius);
      ped.x = res.x;
      ped.z = res.z;
      if (nearIntersection(ped.x, ped.z) && random.chance(0.02)) {
        ped.heading += random.pick([-Math.PI / 2, Math.PI / 2, Math.PI]);
      }
      ped.walkT += dt;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      ped.mesh.userData.legs.rotation.x = Math.sin(ped.walkT * 7) * 0.45;
      // Hit by the player's speeding car.
      if (playerCar && Math.abs(playerCar.speed) > 5) {
        const dx = ped.x - playerCar.x;
        const dz = ped.z - playerCar.z;
        if (dx * dx + dz * dz < 2.4 * 2.4) {
          ped.state = 'down';
          ped.downT = 6;
          ped.mesh.rotation.x = -Math.PI / 2;
          ped.mesh.position.y = 0.3;
          hooks.crime(1, 'You ran over a pedestrian');
          hooks.sound('crash');
        }
      }
    }
  }

  /** Punch: nearest standing pedestrian within range of (x, z). */
  function punchAt(x, z, range) {
    let best = null;
    let bestD = range;
    for (const ped of peds) {
      if (ped.state !== 'walk' && ped.state !== 'flee') continue;
      const d = Math.sqrt(dist2(ped.x, ped.z, x, z));
      if (d < bestD) { bestD = d; best = ped; }
    }
    if (!best) return false;
    best.state = 'down';
    best.downT = 5;
    best.mesh.rotation.x = -Math.PI / 2;
    best.mesh.position.y = 0.3;
    return true;
  }

  /** Shoot: nearest hittable (pedestrian, traffic or police car) near the ray. */
  function shootAt(ox, oz, dirX, dirZ, range) {
    let best = null;
    let bestD = range;
    let bestKind = '';
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - ox;
      const dz = ped.z - oz;
      const along = dx * dirX + dz * dirZ;
      if (along < 1 || along > bestD) continue;
      const side = Math.abs(dx * dirZ - dz * dirX);
      if (side < 2.2) { best = ped; bestD = along; bestKind = 'ped'; }
    }
    for (const car of S.cars) {
      if (!car.active || car.kind === 'player' || car.kind === 'parked') continue;
      const dx = car.x - ox;
      const dz = car.z - oz;
      const along = dx * dirX + dz * dirZ;
      if (along < 1 || along > bestD) continue;
      const side = Math.abs(dx * dirZ - dz * dirX);
      if (side < 3) { best = car; bestD = along; bestKind = car.kind; }
    }
    if (!best) return null;
    if (bestKind === 'ped') {
      best.state = 'down';
      best.downT = 6;
      best.mesh.rotation.x = -Math.PI / 2;
      best.mesh.position.y = 0.3;
    } else if (bestKind === 'police') {
      best.speed = Math.max(0, best.speed - 14);
    } else {
      best.speed = Math.max(0, best.speed - 8);
    }
    return { kind: bestKind, dist: bestD };
  }

  return {
    traffic,
    peds,
    punchAt,
    shootAt,
    update(dt) {
      updateTraffic(dt);
      updatePeds(dt);
    },
  };
}
