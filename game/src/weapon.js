// weapon.js — guns and grenades.
// One job: the shooting model. Weapon defs live in palette.js; this file
// owns ammo, reload timing, spread and recoil, and the grenade arc.
// It never decides what a shot hits — sim.js does the raycast and damage.

import * as THREE from 'three';
import { WEAPONS, GRENADES } from './palette.js';

export function createWeapon(defKey) {
  const def = WEAPONS[defKey];
  let mag = def.mag;
  let reserve = def.reserve;
  let reloading = false;
  let reloadEnd = 0;
  let lastShot = -99;
  let bloom = 0;          // spread growth from sustained fire
  let recoilP = 0;        // accumulated pitch kick, recovered over time

  return {
    def,
    get mag() { return mag; },
    get reserve() { return reserve; },
    get reloading() { return reloading; },
    get bloom() { return bloom; },
    get recoilP() { return recoilP; },

    canFire(now) {
      return !reloading && mag > 0 && now - lastShot >= def.rate;
    },
    // Returns true when a shot actually left the barrel.
    fire(now) {
      if (!this.canFire(now)) return false;
      mag--;
      lastShot = now;
      bloom = Math.min(1, bloom + 0.16);
      recoilP = Math.min(0.06, recoilP + def.recoil);
      return true;
    },
    startReload(now) {
      if (reloading || reserve <= 0 || mag === def.mag) return false;
      reloading = true;
      reloadEnd = now + def.reload;
      return true;
    },
    update(now, dt) {
      bloom = Math.max(0, bloom - dt * 1.4);
      recoilP = Math.max(0, recoilP - dt * 0.09);
      if (reloading && now >= reloadEnd) {
        const need = def.mag - mag;
        const take = Math.min(need, reserve);
        mag += take;
        reserve -= take;
        reloading = false;
      }
    },
    // Spread in radians for this shot: base + movement + sustained fire.
    spreadFor(moving, airborne) {
      let s = def.spread + bloom * 0.02;
      if (moving) s += def.moveSpread;
      if (airborne) s += 0.02;
      return s;
    },
    refill() { mag = def.mag; reserve = def.reserve; },
    setReserve(n) { reserve = n; },
  };
}

// ---- grenades: a thrown object with a fuse; sim.js owns the list ----
export function throwGrenade(kind, origin, dir, speed) {
  const g = GRENADES[kind];
  return {
    kind,
    pos: origin.clone(),
    vel: dir.clone().multiplyScalar(speed || 13).add(new THREE.Vector3(0, 3.2, 0)),
    fuse: kind === 'frag' ? 1.6 : 0.9,   // frag pops mid-air; smoke/flash on landing
    radius: g.radius,
    landed: false,
    life: kind === 'smoke' ? g.life : 0, // smoke lingers after landing
    age: 0,
  };
}

export function stepGrenade(g, dt, colliders, groundAt) {
  g.age += dt;
  g.vel.y -= 14 * dt;
  g.pos.addScaledVector(g.vel, dt);
  // bounce off the ground
  const ground = groundAt(g.pos.x, g.pos.z, g.pos.y, colliders);
  if (g.pos.y <= ground + 0.08) {
    g.pos.y = ground + 0.08;
    if (Math.abs(g.vel.y) > 2) g.vel.y *= -0.35;
    else g.vel.y = 0;
    g.vel.x *= 0.6; g.vel.z *= 0.6;
    g.landed = true;
  }
  // bounce off walls (cheap: clamp to the yard)
  if (g.pos.x < -31.5 || g.pos.x > 31.5) { g.vel.x *= -0.4; g.pos.x = Math.max(-31.5, Math.min(31.5, g.pos.x)); }
  if (g.pos.z < -23.5 || g.pos.z > 23.5) { g.vel.z *= -0.4; g.pos.z = Math.max(-23.5, Math.min(23.5, g.pos.z)); }
  g.fuse -= dt;
  return g.fuse <= 0;
}
