// main.js — DUSTLINE's entry point.
// One job: boot and the frame loop. It builds the renderer, the camera and
// the scene, wires input (pointer lock, keys, mouse) to the sim, and runs a
// fixed-step simulation (60 Hz) apart from rendering. No game rules here.
//
// GAME FLOW — what a player sees, in order:
//   1. MENU: the DUSTLINE title, the briefing (objective, controls, the
//      surrender rule) and a CLICK TO PLAY button. The camera slowly orbits
//      the yard behind the menu.
//   2. BRIEFING / BUY: round 1 opens on the buy menu (12 s). The objective
//      banner reads "ATTACK SITE A" or "ATTACK SITE B". The player buys a
//      rifle, armor and grenades with money that persists between rounds;
//      the bots buy their own loadouts the same way.
//   3. GAMEPLAY: pointer-lock mouse look, WASD movement, firing with recoil
//      and spread that punish firing on the move, reload on R, crouch,
//      jump, grenades (frag / smoke / flash). Vanguard (player + Rook + Vex)
//      pushes a lane to the site; Sentinels (Hale, Mira, Onyx) hold named
//      angles and rotate after contact. Floating name + status labels show
//      what every bot is doing. A round ends on a plant, a defuse, an
//      elimination, or the timer.
//   4. SIGNATURE MOMENT: wound an enemy bot to 25 HP or less and it
//      SURRENDERS — it drops its weapon, kneels, raises a white flag and
//      never fights again; the player is paid $300, and nearby enemies fall
//      back. The kill feed and the round timeline record it.
//   5. WIN: the round banner says which side won and why; the score and the
//      money update; the next round's buy phase opens. First to 5 rounds
//      takes the match.
//   6. LOSE: the same banner, the other way round; the loss bonus grows
//      with each consecutive lost round so the player can always re-arm.
//   7. RESTART: the match-end screen shows the final score; click it (or
//      press Enter) to play again from round 1 with fresh money.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { buildWorld } from './world.js';
import { createAudio } from './audio.js';
import { createSim } from './sim.js';
import { createHud } from './hud.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 220);

// ---- viewmodel: the player's gun, held in the lower-right of the view ----
// One coherent firing sequence: the gun kicks back on a shot and recovers,
// the muzzle flashes, and it dips while reloading. It is parented to the
// camera so it follows the view; the camera must be in the scene for that.
const viewmodel = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.35, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.8 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.42), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.32);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), grip);
  handguard.position.set(0, -0.01, -0.22);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), dark);
  sight.position.set(0, 0.08, -0.05);
  viewmodel.add(receiver, barrel, handguard, sight);
  viewmodel.position.set(0.26, -0.24, -0.5);
  viewmodel.rotation.y = 0.06;
  camera.add(viewmodel);
}
// muzzle flash: a bright star at the barrel tip, shown for one frame's worth
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
flash.position.set(0, 0.02, -0.48);
viewmodel.add(flash);
scene.add(camera);

const audio = createAudio();
const world = buildWorld(scene);
const hud = createHud();
const sim = createSim(scene, world, audio, hud);

// read-only handle for the screenshot / play-test script
window.__dustline = { get phase() { return sim.phase; }, sim };

// ---- input ----
const input = {
  forward: false, back: false, left: false, right: false,
  sprint: false, crouch: false, jump: false,
  fire: false, reload: false, plant: false,
  grenade: null, weaponKey: null,
};
let locked = false;
let firing = false;

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  if (sim.phase === 'play' && sim.playerEnt.alive) sim.playerCtl.look(e.movementX, e.movementY);
});
document.addEventListener('mousedown', (e) => {
  audio.unlock();
  if (e.button !== 0) return;
  if (sim.phase === 'menu') return;
  if (!locked) { canvas.requestPointerLock(); return; }
  firing = true;
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
document.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.repeat) return;
  const k = e.code;
  if (k === 'KeyW' || k === 'ArrowUp') input.forward = true;
  if (k === 'KeyS' || k === 'ArrowDown') input.back = true;
  if (k === 'KeyA' || k === 'ArrowLeft') input.left = true;
  if (k === 'KeyD' || k === 'ArrowRight') input.right = true;
  if (k === 'ShiftLeft' || k === 'ShiftRight') input.sprint = true;
  if (k === 'ControlLeft' || k === 'ControlRight') input.crouch = true;
  if (k === 'Space') input.jump = true;
  if (k === 'KeyR') input.reload = true;
  if (k === 'KeyE') input.plant = true;
  if (k === 'KeyB') {
    if (sim.phase === 'buy') {
      if (hud.buyVisible) hud.hideBuy(); else { hud.refreshBuy(sim.state.money, sim.playerEnt); hud.showBuy(); }
    }
  }
  if (k === 'Digit1') input.weaponKey = '1';
  if (k === 'Digit2') input.weaponKey = '2';
  if (k === 'Digit3') input.grenade = 'frag';
  if (k === 'Digit4') input.grenade = 'smoke';
  if (k === 'Digit5') input.grenade = 'flash';
  if (k === 'KeyQ' && !sim.playerEnt.alive) sim.cycleSpectator();
  if (k === 'Enter' && sim.phase === 'matchEnd') restartMatch();
});
document.addEventListener('keyup', (e) => {
  const k = e.code;
  if (k === 'KeyW' || k === 'ArrowUp') input.forward = false;
  if (k === 'KeyS' || k === 'ArrowDown') input.back = false;
  if (k === 'KeyA' || k === 'ArrowLeft') input.left = false;
  if (k === 'KeyD' || k === 'ArrowRight') input.right = false;
  if (k === 'ShiftLeft' || k === 'ShiftRight') input.sprint = false;
  if (k === 'ControlLeft' || k === 'ControlRight') input.crouch = false;
  if (k === 'Space') input.jump = false;
  if (k === 'KeyR') input.reload = false;
  if (k === 'KeyE') input.plant = false;
});

// buy menu clicks
document.getElementById('hud').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy]');
  if (btn) {
    audio.unlock();
    sim.buy(btn.dataset.buy);
  }
  if (e.target.id === 'playBtn') startGame();
  if (e.target.closest('#matchEnd')) restartMatch();
});

// ---- menu / restart ----
function startGame() {
  audio.unlock();
  hud.hideMenu();
  canvas.requestPointerLock();
  sim.startMatch();
}
function restartMatch() {
  hud.hideMatchEnd();
  canvas.requestPointerLock();
  sim.startMatch();
}

// ---- the loop: fixed 60 Hz sim, render as fast as the display ----
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
const camPos = new THREE.Vector3();
const camDir = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // feed the sim the live fire button state
  input.fire = firing && locked && sim.phase === 'play' && sim.playerEnt.alive;

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    sim.step(STEP, input);
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;

  // camera: the player's eye, or the spectated bot's eye after death
  if (sim.phase === 'play' || sim.phase === 'buy' || sim.phase === 'roundEnd') {
    if (sim.playerEnt.alive) {
      sim.playerCtl.eyePos(camPos);
      camDir.copy(sim.playerCtl.dir());
    } else {
      const spec = sim.spectatorEye(camPos);
      if (spec) {
        camDir.set(-Math.sin(spec.yaw), 0, -Math.cos(spec.yaw));
      } else {
        sim.playerCtl.eyePos(camPos);
        camDir.copy(sim.playerCtl.dir());
      }
    }
    camera.position.copy(camPos);
    camera.lookAt(camPos.clone().add(camDir));
  } else {
    // menu / match end: slow orbit over the yard
    const t = now * 0.00008;
    camera.position.set(Math.sin(t) * 26, 14, Math.cos(t) * 20);
    camera.lookAt(0, 0, -4);
  }

  // ---- surrender flag wave: a surrendered bot's white flag waves gently
  for (const b of sim.bots) {
    if (b.surrendered && b.flagCloth) {
      b.flagCloth.rotation.y = Math.sin(now * 0.004) * 0.35;
    }
  }

  // ---- viewmodel: kick, flash, reload dip ----
  // The gun kicks back from the last shot and recovers over ~120 ms; the
  // flash is brightest in the first 40 ms. While the weapon reloads, the
  // gun dips down and comes back up.
  const sinceShot = sim.state.now - sim.state.lastPlayerShot;
  const kick = Math.max(0, 1 - sinceShot / 0.12);
  const reloading = sim.playerEnt.weapon.reloading;
  viewmodel.position.z = -0.5 + kick * 0.07;
  viewmodel.rotation.x = kick * 0.06 + (reloading ? 0.35 : 0);
  viewmodel.position.y = -0.24 - (reloading ? 0.12 : 0);
  flashMat.opacity = sinceShot < 0.04 ? 0.95 : 0;
  flash.rotation.z = Math.random() * Math.PI;
  viewmodel.visible = sim.playerEnt.alive && (sim.phase === 'play' || sim.phase === 'buy' || sim.phase === 'roundEnd');

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.showMenu();
requestAnimationFrame(frame);

// ---- screenshot staging (?shot=...) ----
// The screenshot script drives the game through these hooks so each shot
// shows a real frame of the real game: the menu, the buy menu, live play,
// and the signature surrender moment (staged through the real damage path
// in sim.debugSurrender). A human player reaches the same states by playing.
const shot = new URLSearchParams(location.search).get('shot');
if (shot === 'buy' || shot === 'play' || shot === 'surrender' || shot === 'win') {
  // start the match without waiting for a click; pointer lock is skipped
  // headless (the camera still follows the player).
  hud.hideMenu();
  sim.startMatch();
  if (shot === 'play' || shot === 'surrender' || shot === 'win') {
    // skip the buy phase so the round is live
    setTimeout(() => { sim.state.timer = 0.2; }, 600);
  }
  if (shot === 'surrender') {
    setTimeout(() => { sim.debugSurrender(); }, 2500);
  }
  if (shot === 'win') {
    // end the round as a Vanguard win through the real damage path
    setTimeout(() => { sim.debugWinRound(); }, 2500);
  }
}
