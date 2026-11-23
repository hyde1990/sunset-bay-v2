// Staged screenshot scenes for ?shot=cover|onfoot|night|title. Each one drives
// the real game forward from a seeded world — a real chase, real police, real
// traffic — so the frame is what the game really looks like, and the same seed
// always gives the same frame. The painter runs twice, then window.__shotReady.

import * as THREE from 'three';
import { STEP } from './config.js';

const fakeInput = {
  moveY: () => 1,
  moveX: () => 0,
  running: () => false,
  takeActions: () => 0,
  takeDrag: () => ({ x: 0, y: 0 }),
  takeShoot: () => false,
};

function driveStraight(G, seconds, streetX) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const car = G.S.player.car;
    if (car) {
      // Gentle autopilot: hold the lane and the heading.
      car.heading += (0 - car.heading) * 0.04;
      car.x += (streetX - car.x) * 0.02;
    }
    G.tick(STEP, fakeInput);
  }
}

function walkForward(G, seconds, heading) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    G.S.player.heading = heading;
    G.tick(STEP, fakeInput);
  }
}

function setCamera(G, px, py, pz, lx, ly, lz) {
  G.shotCam = {
    pos: new THREE.Vector3(px, py, pz),
    look: new THREE.Vector3(lx, ly, lz),
  };
  G.camera.position.copy(G.shotCam.pos);
  G.camera.lookAt(G.shotCam.look);
}

export function stageShot(name, G) {
  const S = G.S;
  if (name === 'cover') {
    // Daytime chase: wanted 3, Job 3, police behind, traffic ahead, Marina.
    S.timeHour = 17.3;
    G.missions.startJob(2);
    // Step next to the player's own teal car, then take it.
    S.player.x = -208;
    S.player.z = 5;
    G.vehicles.enterCar();
    const car = S.player.car;
    car.x = -200;
    car.z = -90;
    car.heading = 0;
    car.speed = 24;
    car.mesh.position.set(car.x, 0, car.z);
    driveStraight(G, 6, -200);
    // The autopilot can clip a pedestrian and raise wanted; pin it back to
    // the staged level so the frame shows the intended three stars.
    S.wanted = 3;
    G.hud.update(0);
    const cx = S.player.x;
    const cz = S.player.z;
    setCamera(G, cx + 9, 5.5, cz - 13, cx - 2, 2, cz + 18);
    return { screen: 'play' };
  }
  if (name === 'onfoot') {
    // Midday on foot in Old Town: stand on the z = 0 avenue at the
    // intersection and walk east, so the camera stays on the open road
    // instead of inside a building block.
    S.timeHour = 15.0;
    G.missions.startJob(0);
    S.player.x = 0;
    S.player.z = 0;
    S.player.heading = Math.PI / 2;
    walkForward(G, 2.5, Math.PI / 2);
    const px = S.player.x;
    const pz = S.player.z;
    setCamera(G, px - 6.5, 3.2, pz, px + 12, 1.4, pz);
    return { screen: 'play' };
  }
  if (name === 'night') {
    // Night getaway: wanted 4, lamps on, roadblock ahead on the avenue.
    S.timeHour = 22.0;
    G.missions.startJob(3);
    S.player.x = -208;
    S.player.z = 5;
    G.vehicles.enterCar();
    const car = S.player.car;
    car.x = 0;
    car.z = -70;
    car.heading = 0;
    car.speed = 26;
    car.mesh.position.set(car.x, 0, car.z);
    S.wanted = 4;
    driveStraight(G, 8, 0);
    // Pin wanted back to the staged four stars (see cover).
    S.wanted = 4;
    G.hud.update(0);
    const cx = S.player.x;
    const cz = S.player.z;
    setCamera(G, cx + 8, 5, cz - 12, cx - 1, 2, cz + 16);
    return { screen: 'play' };
  }
  // Title: golden hour over the Marina, camera looking across the city.
  S.timeHour = 17.6;
  setCamera(G, -238, 26, -120, -40, 12, 40);
  return { screen: 'title' };
}
