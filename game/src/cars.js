// Vehicles for Sunset Bay: parked cars to steal, the player's own teal car,
// arcade driving physics, and the police (chase + roadblock + bust). Cars are
// small groups of boxes; wheels spin with speed. No per-frame allocation.

import * as THREE from 'three';
import { CAR, PALETTE, POLICE, WANTED, WORLD } from './config.js';

const tmpV = new THREE.Vector3();

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), dark);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const lx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    lamp.position.set(lx, 0.62, 2.22);
    group.add(lamp);
  }
  let bar = null;
  if (isPolice) {
    const red = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2a6aff });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), red);
    r.position.set(-0.4, 1.45, -0.2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), blue);
    b.position.set(0.4, 1.45, -0.2);
    group.add(r);
    group.add(b);
    bar = { red: r, blue: b };
  }
  group.userData.wheels = wheels;
  group.userData.bar = bar;
  return group;
}

function newCar(scene, x, z, heading, color, kind, isPolice) {
  const mesh = makeCarMesh(color, isPolice);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh, x, z, heading, speed: 0, color, kind, isPolice,
    wheels: mesh.userData.wheels, bar: mesh.userData.bar, active: true, bustT: 0,
  };
}

export function createVehicles(scene, city, random, S, hooks) {
  const parked = [];
  // The player's own teal car waits near the start, by the Marina promenade.
  const own = newCar(scene, -208, 8, Math.PI / 2, 0x2ec4b6, 'parked', false);
  own.isOwn = true;
  parked.push(own);
  for (let i = 0; i < CAR.parkCount - 1; i += 1) {
    const p = city.randomRoadPoint(0, 0, 30, 230);
    const heading = random.chance(0.5) ? 0 : Math.PI / 2;
    const car = newCar(scene, p.x + random.pick([-7, 7]), p.z + random.pick([-7, 7]), heading, random.pick(PALETTE.car), 'parked', false);
    parked.push(car);
  }
  const police = [];
  let roadblock = null;
  let flashT = 0;
  // Parked cars are solid: they join the shared car list for collisions.
  for (const car of parked) S.cars.push(car);

  function nearestParked(x, z, maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of parked) {
      const dx = car.x - x;
      const dz = car.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function policeNear(x, z, dist) {
    for (const p of police) {
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < dist * dist) return true;
    }
    return false;
  }

  function enterCar() {
    if (!S.player.onFoot) return false;
    const car = nearestParked(S.player.x, S.player.z, 3.2);
    if (!car) return false;
    parked.splice(parked.indexOf(car), 1);
    car.kind = 'player';
    S.player.car = car;
    S.player.onFoot = false;
    S.player.speed = 0;
    if (!car.isOwn && policeNear(car.x, car.z, WANTED.stealNearPolice)) {
      hooks.crime(1, 'Grand theft auto — the cops saw that');
    }
    hooks.sound('pickup');
    return true;
  }

  function exitCar() {
    const car = S.player.car;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    parked.push(car);
    S.player.car = null;
    S.player.onFoot = true;
    S.player.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.4;
    S.player.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.4;
    S.player.heading = car.heading;
    S.player.speed = 0;
  }

  function collideCarWithWorld(car) {
    const res = city.collideCircle(car.x, car.z, CAR.radius);
    if (res.hit) {
      if (Math.abs(car.speed) > WANTED.crashSpeed && car.kind === 'player') {
        hooks.crime(1, 'You smashed into the city');
        hooks.damage(6);
        hooks.sound('crash');
      }
      car.x = res.x;
      car.z = res.z;
      car.speed *= -0.25;
    }
  }

  function pushCarsApart(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const min = CAR.radius * 2;
    if (d > 0.001 && d < min) {
      const push = min - d;
      const nx = dx / d;
      const nz = dz / d;
      const aFixed = a.kind === 'parked';
      const bFixed = b.kind === 'parked';
      if (aFixed && bFixed) return false;
      if (bFixed) {
        a.x -= nx * push;
        a.z -= nz * push;
        a.speed *= 0.4;
      } else if (aFixed) {
        b.x += nx * push;
        b.z += nz * push;
        b.speed *= 0.4;
      } else {
        const half = push / 2;
        a.x -= nx * half;
        a.z -= nz * half;
        b.x += nx * half;
        b.z += nz * half;
        const exchange = (a.speed - b.speed) * 0.4;
        a.speed -= exchange;
        b.speed += exchange;
      }
      return true;
    }
    return false;
  }

  function drivePlayer(dt, input) {
    const car = S.player.car;
    const throttle = input.moveY();
    const steer = input.moveX();
    if (throttle > 0) car.speed += CAR.accel * dt;
    else if (throttle < 0) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
    else car.speed -= car.speed * 0.55 * dt;
    if (car.speed > 0) car.speed -= car.speed * 0.12 * dt;
    car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
    const grip = Math.min(1, Math.abs(car.speed) / 8);
    car.heading += steer * CAR.steerMax * grip * Math.sign(car.speed || 1) * dt * 1.9;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    collideCarWithWorld(car);
    for (const other of S.cars) {
      if (other !== car && other.active && other.kind !== 'player') {
        if (pushCarsApart(car, other) && Math.abs(car.speed) > WANTED.crashSpeed) {
          hooks.crime(1, 'Traffic collision');
          hooks.sound('crash');
        }
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
    S.player.x = car.x;
    S.player.z = car.z;
    S.player.heading = car.heading;
    S.player.speed = car.speed;
  }

  function updatePolice(dt) {
    const wanted = S.wanted;
    const desired = wanted === 0 ? 0 : Math.min(POLICE.maxCars, 1 + Math.floor(wanted / 2));
    while (police.length < desired) {
      const p = city.randomRoadPoint(S.player.x, S.player.z, 70, 130);
      const car = newCar(scene, p.x, p.z, 0, PALETTE.police, 'police', true);
      police.push(car);
      S.cars.push(car);
    }
    flashT += dt;
    const flashOn = Math.floor(flashT * 4) % 2 === 0;
    for (let i = police.length - 1; i >= 0; i -= 1) {
      const car = police[i];
      if (wanted === 0) {
        scene.remove(car.mesh);
        S.cars.splice(S.cars.indexOf(car), 1);
        police.splice(i, 1);
        continue;
      }
      // Pursuit steering toward the player, with a little lead on their motion.
      const lead = 0.6;
      const tx = S.player.x + Math.sin(S.player.heading) * S.player.speed * lead;
      const tz = S.player.z + Math.cos(S.player.heading) * S.player.speed * lead;
      const dx = tx - car.x;
      const dz = tz - car.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-1.9 * dt, Math.min(1.9 * dt, diff * 2.2 * dt * 3));
      car.speed = Math.min(POLICE.chaseSpeed, car.speed + 12 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      const res = city.collideCircle(car.x, car.z, CAR.radius);
      if (res.hit) { car.x = res.x; car.z = res.z; car.speed *= 0.4; }
      for (const other of S.cars) {
        if (other !== car && other.active && other.kind !== 'police') pushCarsApart(car, other);
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
      if (car.bar) {
        car.bar.red.material.color.setHex(flashOn ? 0xff2a2a : 0x550000);
        car.bar.blue.material.color.setHex(flashOn ? 0x0a1a55 : 0x2a6aff);
      }
      // Ram: close contact hurts the player and can bust them.
      if (dist < POLICE.bustDistance + 1.5) {
        car.bustT += dt;
        if (S.player.onFoot) hooks.damage(POLICE.ramDamage * dt * 2);
        else if (car.speed > 6) hooks.damage(POLICE.ramDamage * dt);
        if (car.bustT > POLICE.bustSeconds) hooks.onBusted();
      } else {
        car.bustT = Math.max(0, car.bustT - dt);
      }
    }
    // Roadblock at high wanted: two police cars parked across the road ahead.
    if (wanted >= 4 && !roadblock) {
      const aheadX = S.player.x + Math.sin(S.player.heading) * 45;
      const aheadZ = S.player.z + Math.cos(S.player.heading) * 45;
      const streetX = city.nearestStreet(S.player.x);
      const streetZ = city.nearestStreet(S.player.z);
      const vertical = Math.abs(S.player.x - streetX) < Math.abs(S.player.z - streetZ);
      roadblock = [];
      for (let k = -1; k <= 1; k += 2) {
        const car = newCar(scene,
          vertical ? streetX + k * 3 : aheadX,
          vertical ? aheadZ : streetZ + k * 3,
          vertical ? Math.PI / 2 : 0, PALETTE.police, 'police', true);
        roadblock.push(car);
        S.cars.push(car);
      }
    } else if (wanted < 4 && roadblock) {
      for (const car of roadblock) {
        scene.remove(car.mesh);
        S.cars.splice(S.cars.indexOf(car), 1);
      }
      roadblock = null;
    }
  }

  return {
    parked,
    police,
    enterCar,
    exitCar,
    nearestParked,
    update(dt, input) {
      if (S.player.car) drivePlayer(dt, input);
      updatePolice(dt);
    },
  };
}
