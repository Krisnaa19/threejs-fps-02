// player.js — the first-person controller.
// One job: move the player's eyes through the map. Mouse look, WASD with
// acceleration and friction, crouch, jump, and collision against the world.
// It knows nothing about weapons, bots or rounds; sim.js reads its state.

import * as THREE from 'three';
import { MOVE } from './palette.js';
import { collideCircle, groundAt } from './world.js';

export function createPlayer(world, audio) {
  const pos = new THREE.Vector3(0, 0, 20);       // feet position
  const vel = new THREE.Vector3();
  let yaw = 0;                                    // facing, radians (0 = -z)
  let pitch = 0;
  let crouched = false;
  let onGround = true;
  let bobPhase = 0;
  let lastStep = 0;

  const eye = new THREE.Vector3();

  function spawnAt(x, z, facingYaw) {
    pos.set(x, 0, z);
    vel.set(0, 0, 0);
    yaw = facingYaw;
    pitch = 0;
    crouched = false;
    onGround = true;
  }

  function look(dx, dy) {
    yaw -= dx * 0.0021;
    pitch -= dy * 0.0021;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
  }

  function eyePos(out) {
    const h = crouched ? MOVE.eyeCrouch : MOVE.eyeStand;
    const bob = onGround && vel.lengthSq() > 0.5 ? Math.sin(bobPhase) * 0.03 : 0;
    out.set(pos.x, pos.y + h + bob, pos.z);
    return out;
  }

  function forward(out) {
    out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    return out;
  }

  function right(out) {
    out.set(Math.cos(yaw), 0, -Math.sin(yaw));
    return out;
  }

  function update(dt, input, colliders) {
    const fwd = forward(new THREE.Vector3());
    const rgt = right(new THREE.Vector3());
    const wish = new THREE.Vector3();
    if (input.forward) wish.add(fwd);
    if (input.back) wish.sub(fwd);
    if (input.right) wish.add(rgt);
    if (input.left) wish.sub(rgt);
    if (wish.lengthSq() > 0) wish.normalize();

    crouched = !!input.crouch;
    const speed = crouched ? MOVE.crouch : (input.sprint && !crouched ? MOVE.sprint : MOVE.walk);

    // accelerate toward the wish direction, friction when idle
    const accel = onGround ? MOVE.accel : MOVE.airAccel;
    vel.x += wish.x * accel * dt;
    vel.z += wish.z * accel * dt;
    if (wish.lengthSq() === 0 && onGround) {
      const f = Math.max(0, 1 - MOVE.friction * dt);
      vel.x *= f; vel.z *= f;
    }
    const hv = Math.hypot(vel.x, vel.z);
    if (hv > speed) { vel.x *= speed / hv; vel.z *= speed / hv; }

    if (input.jump && onGround) { vel.y = MOVE.jump; onGround = false; }
    vel.y -= MOVE.gravity * dt;

    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    pos.y += vel.y * dt;
    collideCircle(pos, MOVE.radius, colliders);

    const g = groundAt(pos.x, pos.z, pos.y, colliders);
    if (pos.y <= g) {
      pos.y = g;
      vel.y = 0;
      onGround = true;
    } else if (pos.y > g + 0.02) {
      onGround = false;
    }

    // head bob + footsteps
    if (onGround && hv > 1) {
      bobPhase += dt * hv * 1.6;
      if (bobPhase - lastStep > Math.PI) { lastStep = bobPhase; audio.step(); }
    }
  }

  return {
    pos, vel,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get crouched() { return crouched; },
    get onGround() { return onGround; },
    get moving() { return Math.hypot(vel.x, vel.z) > 0.8; },
    get speed() { return Math.hypot(vel.x, vel.z); },
    spawnAt, look, update, eyePos,
    eye() { return eyePos(eye); },
    dir() {
      return new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
      );
    },
  };
}
