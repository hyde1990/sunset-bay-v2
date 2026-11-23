// The story of Sunset Bay: four jobs from Mara, the fixer on the Marina.
// Each job is a chain of steps (go somewhere, tail a car, lose the heat) with
// a briefing, a glowing beacon over the target, a cash reward and district
// standing (REP) where the job ends. No per-frame allocation.

import * as THREE from 'three';
import { makeCarMesh } from './cars.js';

const JOBS = [
  {
    title: 'Job 1 — First Delivery',
    giver: 'Mara',
    brief: ['New in town? Good. Pick up a parcel at the Marina market.', 'Take it to the Old Town cafe. No detours, no cops.'],
    doneLine: 'Clean run. The cafe crowd likes you already.',
    reward: 150,
    steps: [
      { type: 'goto', x: -220, z: -40, label: 'Pick up the parcel at Marina Market', district: 'Marina' },
      { type: 'goto', x: 20, z: 40, label: 'Deliver the parcel to the Old Town cafe', district: 'Old Town' },
    ],
  },
  {
    title: 'Job 2 — Tail the Courier',
    giver: 'Mara',
    brief: ['A courier in a gold car is carrying my ledger around Old Town.', 'Stay close for twenty seconds. Do not let him see you sweat.'],
    doneLine: 'Got the route. You drive like a shadow.',
    reward: 250,
    steps: [
      { type: 'tail', duration: 20, label: 'Tail the gold courier — stay within 70 m', district: 'Old Town' },
    ],
  },
  {
    title: 'Job 3 — Lose the Heat',
    giver: 'Mara',
    brief: ['The Bay PD is on your tail now. Three stars, kid.', 'Lose them. Hide until the heat dies down.'],
    doneLine: 'Ghost. The dispatch lost you completely.',
    reward: 300,
    steps: [
      { type: 'evade', label: 'Lose the cops — wanted must fall to zero', district: 'Marina' },
    ],
  },
  {
    title: 'Job 4 — Harbor Finale',
    giver: 'Mara',
    brief: ['One last crate, at the Harbor docks. The Hills mansion pays big.', 'Cops will be watching the road. Make it count.'],
    doneLine: 'Sunset Bay is yours now. Welcome to the crew.',
    reward: 500,
    steps: [
      { type: 'goto', x: -40, z: 220, label: 'Pick up the crate at the Harbor docks', district: 'Harbor' },
      { type: 'goto', x: 200, z: -180, label: 'Deliver the crate to the Hills mansion', district: 'Hills' },
    ],
  },
];

const COURIER_LOOP = [
  { x: -80, z: -80 }, { x: 80, z: -80 }, { x: 80, z: 80 }, { x: -80, z: 80 },
];

export function createMissions(scene, city, random, S, hooks) {
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffc861, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 26, 16, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.2, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  ring.visible = false;
  scene.add(ring);

  let courier = null;
  let courierWp = 0;

  function currentJob() {
    return S.mission.index < JOBS.length ? JOBS[S.mission.index] : null;
  }
  function currentStep() {
    const job = currentJob();
    if (!job) return null;
    return job.steps[S.mission.step] || null;
  }

  function placeBeacon(x, z) {
    beacon.position.set(x, 13, z);
    beacon.visible = true;
    ring.position.set(x, 0.12, z);
    ring.visible = true;
  }
  function hideBeacon() {
    beacon.visible = false;
    ring.visible = false;
  }

  function startCourier() {
    if (courier) return;
    const mesh = makeCarMesh(0xe8c33c, false);
    mesh.position.set(-80, 0, -80);
    scene.add(mesh);
    courier = {
      mesh, x: -80, z: -80, heading: 0, speed: 12,
      kind: 'courier', active: true, radius: 2.1, wheels: mesh.userData.wheels,
    };
    S.cars.push(courier);
    courierWp = 1;
  }
  function removeCourier() {
    if (!courier) return;
    scene.remove(courier.mesh);
    S.cars.splice(S.cars.indexOf(courier), 1);
    courier = null;
  }

  function startStep() {
    const step = currentStep();
    const job = currentJob();
    if (!step || !job) { hideBeacon(); return; }
    if (step.type === 'goto') {
      placeBeacon(step.x, step.z);
    } else if (step.type === 'tail') {
      startCourier();
      S.mission.tailT = 0;
    } else if (step.type === 'evade') {
      hideBeacon();
      S.wanted = 3;
      S.wantedTimer = 0;
    }
  }

  function startJob(index) {
    S.mission.index = index;
    S.mission.step = 0;
    S.mission.tailT = 0;
    const job = JOBS[index];
    if (!job) {
      hideBeacon();
      S.storyDone = true;
      hooks.dialogue('Mara', 'Sunset Bay is yours now. Welcome to the crew.');
      return;
    }
    hooks.dialogue(job.giver, job.brief[0]);
    if (job.brief[1]) hooks.dialogue(job.giver, job.brief[1]);
    startStep();
  }

  function completeJob() {
    const job = currentJob();
    if (!job) return;
    const step = currentStep();
    S.money += job.reward;
    if (step && step.district) {
      S.rep[step.district] = (S.rep[step.district] || 0) + 1;
    }
    hooks.dialogue(job.giver, job.doneLine);
    hooks.sound('missionDone');
    hooks.sound('pickup');
    removeCourier();
    startJob(S.mission.index + 1);
  }

  function advanceStep() {
    S.mission.step += 1;
    const job = currentJob();
    if (!job || S.mission.step >= job.steps.length) {
      completeJob();
    } else {
      startStep();
    }
  }

  function distTo(x, z) {
    const dx = x - S.player.x;
    const dz = z - S.player.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  return {
    startJob,
    currentJob,
    currentStep,
    markerPos() {
      const step = currentStep();
      if (!step) return null;
      if (step.type === 'goto') return { x: step.x, z: step.z };
      if (step.type === 'tail' && courier) return { x: courier.x, z: courier.z };
      return null;
    },
    objectiveText() {
      const job = currentJob();
      const step = currentStep();
      if (!job || !step) return S.storyDone ? 'Free roam — Sunset Bay is yours' : '';
      if (step.type === 'tail') {
        return `${step.label} (${Math.floor(S.mission.tailT || 0)}s / ${step.duration}s)`;
      }
      return step.label;
    },
    jobTitle() {
      const job = currentJob();
      return job ? job.title : 'Sunset Bay';
    },
    update(dt) {
      const step = currentStep();
      if (!step) return;
      // Beacon pulse (scale only; no allocation).
      if (beacon.visible) {
        const s = 1 + Math.sin(performance.now() * 0.004) * 0.12;
        beacon.scale.set(s, 1, s);
        ringMat.opacity = 0.55 + Math.sin(performance.now() * 0.004) * 0.25;
      }
      if (step.type === 'goto') {
        if (distTo(step.x, step.z) < 7) {
          hooks.sound('pickup');
          advanceStep();
        }
      } else if (step.type === 'tail' && courier) {
        // Courier drives its loop around Old Town.
        const wp = COURIER_LOOP[courierWp];
        const dx = wp.x - courier.x;
        const dz = wp.z - courier.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 4) {
          courierWp = (courierWp + 1) % COURIER_LOOP.length;
        } else {
          courier.heading = Math.atan2(dx, dz);
          courier.x += Math.sin(courier.heading) * courier.speed * dt;
          courier.z += Math.cos(courier.heading) * courier.speed * dt;
          courier.mesh.position.set(courier.x, 0, courier.z);
          courier.mesh.rotation.y = courier.heading;
          for (const w of courier.wheels) w.rotation.x += (courier.speed * dt) / 0.36;
        }
        placeBeacon(courier.x, courier.z);
        if (distTo(courier.x, courier.z) < 70) {
          S.mission.tailT = (S.mission.tailT || 0) + dt;
          if (S.mission.tailT >= step.duration) advanceStep();
        } else {
          S.mission.tailT = Math.max(0, (S.mission.tailT || 0) - dt * 0.5);
        }
      } else if (step.type === 'evade') {
        if (S.wanted === 0) advanceStep();
      }
    },
  };
}
