// Sky, sun, fog and shadows for Sunset Bay. One directional sun (warm and low
// at golden hour, dim blue moonlight at night), one hemisphere fill, a gradient
// sky dome, and warm fog. The shadow camera follows the player so the 1024
// shadow map always covers the action. No per-frame allocation here.

import * as THREE from 'three';
import { PALETTE, QUALITY } from './config.js';

const tmpColor = new THREE.Color();
const sunDir = new THREE.Vector3();

export function createSky(scene) {
  const skyGeo = new THREE.SphereGeometry(900, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(PALETTE.skyTopSunset) },
      horizonColor: { value: new THREE.Color(PALETTE.horizonSunset) },
      offset: { value: 12 },
      exponent: { value: 0.65 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
      }`,
  });
  const dome = new THREE.Mesh(skyGeo, skyMat);
  dome.frustumCulled = false;
  scene.add(dome);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
  sun.shadow.camera.left = -QUALITY.shadowRange;
  sun.shadow.camera.right = QUALITY.shadowRange;
  sun.shadow.camera.top = QUALITY.shadowRange;
  sun.shadow.camera.bottom = -QUALITY.shadowRange;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x5a4a3a, 0.85);
  scene.add(hemi);

  scene.fog = new THREE.Fog(PALETTE.fogSunset, 130, 430);

  return { dome, sun, hemi, scene };
}

/** nightFactor 0 = full day, 1 = full night. */
export function updateSky(env, hour, playerPos, nightFactor) {
  const day = 1 - nightFactor;
  // Golden-hour sun sits low in the west; at night it becomes dim moonlight.
  const sunAngle = THREE.MathUtils.degToRad(28 - nightFactor * 14);
  sunDir.set(-Math.cos(sunAngle), Math.sin(sunAngle), 0.35).normalize();
  env.sun.position.copy(playerPos).addScaledVector(sunDir, 180);
  env.sun.target.position.copy(playerPos);
  env.sun.target.updateMatrixWorld();
  env.sun.color.setHex(PALETTE.sun);
  env.sun.color.lerp(tmpColor.setHex(PALETTE.sunNight), nightFactor);
  env.sun.intensity = 0.35 + day * 2.05;
  env.hemi.intensity = 0.25 + day * 0.6;
  // Sunset is the warm midpoint: blend day -> sunset -> night.
  const sunsetMix = Math.max(0, 1 - Math.abs(hour - 18.2) / 2.2) * day;
  const top = env.dome.material.uniforms.topColor.value;
  const horizon = env.dome.material.uniforms.horizonColor.value;
  top.setHex(PALETTE.skyTopDay);
  top.lerp(tmpColor.setHex(PALETTE.skyTopNight), nightFactor);
  top.lerp(tmpColor.setHex(PALETTE.skyTopSunset), sunsetMix);
  horizon.setHex(PALETTE.horizonDay);
  horizon.lerp(tmpColor.setHex(PALETTE.horizonSunset), sunsetMix);
  horizon.lerp(tmpColor.setHex(PALETTE.horizonNight), nightFactor);
  env.scene.fog.color.setHex(PALETTE.fogDay);
  env.scene.fog.color.lerp(tmpColor.setHex(PALETTE.fogSunset), sunsetMix);
  env.scene.fog.color.lerp(tmpColor.setHex(PALETTE.fogNight), nightFactor);
  env.dome.position.copy(playerPos);
}

/** 0 = day, 1 = night, from the game clock. */
export function nightFactorFor(hour) {
  if (hour >= 19.6 || hour < 5.5) return 1;
  if (hour >= 18.4 && hour < 19.6) return (hour - 18.4) / 1.2;
  if (hour >= 5.5 && hour < 6.8) return 1 - (hour - 5.5) / 1.3;
  return 0;
}
