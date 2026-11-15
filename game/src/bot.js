// bot.js — the five bots that make DUSTLINE a game.
// One job: bot bodies and bot brains. A bot is a state machine:
// ADVANCE, HOLD, SEARCHING, ENGAGING, DEFUSING, FALLING BACK,
// REPOSITIONING, SURRENDERED. Roles: Sentinels hold named angles and rotate
// after contact; Vanguard bots group up, trade kills and plant when they
// control a site. Surrender is decided by sim.js (damage resolution);
// this file owns what a surrendered bot looks and acts like: kneeling,
// weapon dropped, white flag, never fights again.

import * as THREE from 'three';
import { PALETTE, BOT, MOVE } from './palette.js';
import { collideCircle, groundAt, findRoute, nearestWaypoint } from './world.js';
import { createWeapon } from './weapon.js';

// Segment vs AABB (slab test). True when the segment is blocked.
export function losBlocked(a, b, colliders) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  for (const c of colliders) {
    if (c.maxY < Math.min(a.y, b.y) - 0.2 || c.minY > Math.max(a.y, b.y) + 0.2) continue;
    let t0 = 0, t1 = 1;
    for (const [o, d, mn, mx] of [[a.x, dx, c.minX, c.maxX], [a.y, dy, c.minY, c.maxY], [a.z, dz, c.minZ, c.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { t0 = 1; t1 = 0; break; } }
      else {
        let ta = (mn - o) / d, tb = (mx - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) break;
      }
    }
    if (t0 <= t1) return true;
  }
  return false;
}

function makeLabelSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(1.4, 0.35, 1);
  spr.renderOrder = 10;
  return { sprite: spr, canvas, tex, lastText: '' };
}

function drawLabel(label, name, state, teamColor) {
  const text = name + ' · ' + state;
  if (text === label.lastText) return;           // redrawn only on change
  label.lastText = text;
  const c = label.canvas.getContext('2d');
  c.clearRect(0, 0, 256, 64);
  c.fillStyle = 'rgba(10,10,12,0.62)';
  c.beginPath(); c.roundRect(6, 8, 244, 48, 10); c.fill();
  c.fillStyle = teamColor;
  c.beginPath(); c.arc(28, 32, 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f5efe2';
  c.font = 'bold 22px sans-serif';
  c.textBaseline = 'middle';
  c.fillText(text, 46, 33);
  label.tex.needsUpdate = true;
}

export function createBot(opts) {
  const { name, team, spawn, world, scene } = opts;
  const color = team === 'vanguard' ? PALETTE.vanguard : PALETTE.sentinel;
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 4, 10), bodyMat);
  body.position.y = 0.95; body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.7 })
  );
  head.position.y = 1.62; head.castShadow = true;
  group.add(head);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.09, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.3 })
  );
  visor.position.set(0, 1.64, 0.2);
  group.add(visor);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.12, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.4, metalness: 0.5 })
  );
  gun.position.set(0.28, 1.25, 0.3);
  group.add(gun);
  // white flag (hidden until surrender) — big, so it reads at a glance
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), bodyMat);
  pole.position.y = 0.55;
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x888888, emissiveIntensity: 0.35 })
  );
  cloth.position.set(0.44, 0.85, 0);
  flag.add(pole); flag.add(cloth);
  flag.position.set(-0.3, 1.0, 0);
  flag.visible = false;
  group.add(flag);
  // white ring on the ground, marking the surrendered bot unmistakably
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.75, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  group.add(ring);

  const label = makeLabelSprite();
  label.sprite.position.y = 2.15;
  group.add(label.sprite);

  group.position.set(spawn[0], 0, spawn[1]);
  scene.add(group);

  const bot = {
    name, team, group, body, head, gun, flag, flagCloth: cloth, ring, label,
    pos: group.position,
    vel: new THREE.Vector3(),
    yaw: team === 'vanguard' ? Math.PI : 0,
    hp: 100, alive: true, surrendered: false,
    state: team === 'sentinel' ? 'HOLD' : 'ADVANCE',
    weapon: createWeapon('starter'),
    hasRifle: false, hasArmor: false, money: 800,
    grenades: { frag: 0, smoke: 0, flash: 0 },
    route: [], routeIdx: 0,
    target: null, lastSeen: null, alertPos: null,
    reactAt: 0, burstLeft: 0, burstAt: 0,
    holdKey: null, holdPos: null, holdLook: null,
    plantAt: 0, defuseAt: 0,
    site: null, carrier: false,
    lastDamager: null, flinch: 0,
    speed: BOT.walkSpeed,
  };
  group.rotation.y = bot.yaw;
  drawLabel(label, name, bot.state, team === 'vanguard' ? '#3f8f5f' : '#4a6fa5');
  return bot;
}

export function setBotState(bot, state) {
  if (bot.state === state) return;
  bot.state = state;
  drawLabel(bot.label, bot.name, state, bot.team === 'vanguard' ? '#3f8f5f' : '#4a6fa5');
}

// The surrender: kneel, drop the weapon, raise the flag, stop forever.
export function surrenderBot(bot) {
  if (!bot.alive || bot.surrendered) return;
  bot.surrendered = true;
  bot.target = null;
  bot.route = [];
  bot.gun.visible = false;
  bot.flag.visible = true;
  bot.ring.visible = true;
  bot.body.position.y = 0.55;          // kneeling
  bot.head.position.y = 1.15;
  bot.group.rotation.x = 0.12;
  setBotState(bot, 'SURRENDERED');
}

export function killBot(bot) {
  bot.alive = false;
  bot.target = null;
  bot.group.visible = false;
  bot.label.sprite.visible = false;
}

export function reviveBot(bot, spawn, yaw) {
  bot.alive = true;
  bot.surrendered = false;
  bot.flinch = 0;
  bot.hp = 100;
  bot.pos.set(spawn[0], 0, spawn[1]);
  bot.yaw = yaw;
  bot.group.rotation.set(0, yaw, 0);
  bot.group.visible = true;
  bot.label.sprite.visible = true;
  bot.gun.visible = true;
  bot.flag.visible = false;
  bot.ring.visible = false;
  bot.body.position.y = 0.95;
  bot.head.position.y = 1.62;
  bot.route = []; bot.routeIdx = 0;
  bot.target = null; bot.lastSeen = null; bot.alertPos = null;
  bot.plantAt = 0; bot.defuseAt = 0;
  bot.carrier = false;
  setBotState(bot, bot.team === 'sentinel' ? 'HOLD' : 'ADVANCE');
}

// ---- perception ----
function eyeOf(bot) {
  return new THREE.Vector3(bot.pos.x, bot.pos.y + 1.55, bot.pos.z);
}

function canSee(bot, enemy, colliders, smokes) {
  if (!enemy.alive) return false;
  const a = eyeOf(bot);
  const b = new THREE.Vector3(enemy.pos.x, enemy.pos.y + 1.3, enemy.pos.z);
  const d = a.distanceTo(b);
  if (d > BOT.seeRange) return false;
  // vision cone
  const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
  const tx = (b.x - a.x) / d, tz = (b.z - a.z) / d;
  const dot = fx * tx + fz * tz;
  if (dot < Math.cos(BOT.fov / 2) && d > 4) return false;
  if (losBlocked(a, b, colliders)) return false;
  for (const s of smokes) {
    if (s.kind !== 'smoke' || !s.landed) continue;
    // segment passes through the smoke sphere?
    const cx = s.pos.x, cy = s.pos.y + 0.8, cz = s.pos.z;
    const px = a.x + (b.x - a.x) * 0.5, py = a.y + (b.y - a.y) * 0.5, pz = a.z + (b.z - a.z) * 0.5;
    const dd = Math.hypot(px - cx, py - cy, pz - cz);
    if (dd < s.radius) return false;
  }
  return true;
}

function moveToward(bot, tx, tz, dt, colliders, speed) {
  const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) { bot.speed = 0; return true; }
  bot.speed = speed;
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  const ox = bot.pos.x, oz = bot.pos.z;
  // diagonal step
  bot.pos.x += vx * dt;
  bot.pos.z += vz * dt;
  collideCircle(bot.pos, MOVE.radius, colliders);
  const moved = Math.hypot(bot.pos.x - ox, bot.pos.z - oz);
  if (moved < speed * dt * 0.25) {
    // blocked by something: slide along one axis — try X, then Z, and keep
    // whichever makes the most progress, so a bot walks around a crate
    // instead of pushing into it forever
    let bestX = ox, bestZ = oz, best = 0;
    bot.pos.x = ox; bot.pos.z = oz;
    bot.pos.x += vx * dt;
    collideCircle(bot.pos, MOVE.radius, colliders);
    const mx = Math.hypot(bot.pos.x - ox, bot.pos.z - oz);
    if (mx > best) { best = mx; bestX = bot.pos.x; bestZ = bot.pos.z; }
    bot.pos.x = ox; bot.pos.z = oz;
    bot.pos.z += vz * dt;
    collideCircle(bot.pos, MOVE.radius, colliders);
    const mz = Math.hypot(bot.pos.x - ox, bot.pos.z - oz);
    if (mz > best) { best = mz; bestX = bot.pos.x; bestZ = bot.pos.z; }
    bot.pos.x = bestX; bot.pos.z = bestZ;
  }
  const g = groundAt(bot.pos.x, bot.pos.z, bot.pos.y, colliders);
  bot.pos.y = g;
  const want = Math.atan2(-dx, -dz);
  let dy = want - bot.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dy));
  bot.group.rotation.y = bot.yaw;
  return false;
}

// ---- the brain: one fixed step ----
export function updateBot(bot, dt, ctx) {
  if (!bot.alive || bot.surrendered) return;
  bot.speed = 0; // moveToward sets it when the bot actually moves
  // hit reaction: stagger back briefly when shot (cleared when it ends;
  // the surrender kneel keeps its own tilt)
  if (bot.flinch > 0) {
    bot.flinch -= dt;
    bot.group.rotation.x = 0.1;
  } else if (!bot.surrendered) {
    bot.group.rotation.x = 0;
  }
  const { now, enemies, colliders, smokes, world, audio, onFire } = ctx;

  // pick the nearest visible enemy (skip self and teammates: `enemies` holds
  // entities, so the bot's own entity is bot.ent, not bot)
  let seen = null, seenD = Infinity;
  for (const e of enemies) {
    if (e === bot.ent || !e.alive) continue;
    if (e.surrendered) continue;
    if (e.team === bot.team) continue;
    if (canSee(bot, e, colliders, smokes)) {
      const d = bot.pos.distanceTo(e.pos);
      if (d < seenD) { seenD = d; seen = e; }
    }
  }
  if (seen) {
    // a NEW target costs a reaction beat; the same target does not keep
    // pushing the firing time forward (that bug made bots never shoot)
    if (bot.target !== seen) {
      bot.target = seen;
      bot.reactAt = now + BOT.react;
    }
    bot.lastSeen = seen.pos.clone();
  }

  // ---- state decisions ----
  if (bot.team === 'sentinel') {
    if (seen) setBotState(bot, 'ENGAGING');
    else if (ctx.bombPlanted && bot.state !== 'DEFUSING') {
      // rotate to the planted site
      const site = ctx.plantSite;
      if (!bot.route.length) {
        bot.route = findRoute(world, nearestWaypoint(world, bot.pos.x, bot.pos.z), site === 'A' ? 'aSite' : 'bSite');
        bot.routeIdx = 0;
      }
      setBotState(bot, 'ADVANCE');
    } else if (bot.alertPos && bot.state === 'HOLD') {
      setBotState(bot, 'SEARCHING');
    } else if (bot.state === 'SEARCHING' && !bot.alertPos) {
      setBotState(bot, 'HOLD');
    }
  } else {
    // vanguard: push the objective. A distant enemy is not worth stopping
    // for — close to a real fighting distance first, then duel. Stopping
    // to trade shots at 25 m is how a round stalls at mid forever.
    if (seen && seenD < 20) setBotState(bot, 'ENGAGING');
    else if (bot.carrier && ctx.siteClear) {
      setBotState(bot, 'ADVANCE'); // heading to plant
    } else if (bot.state === 'ENGAGING' && !seen) {
      setBotState(bot, 'SEARCHING');
    } else if (bot.state === 'SEARCHING' && bot.lastSeen && bot.pos.distanceTo(bot.lastSeen) < 1.5) {
      bot.lastSeen = null;
      setBotState(bot, 'ADVANCE');
    } else if (bot.state !== 'ADVANCE' && bot.state !== 'SEARCHING') {
      setBotState(bot, 'ADVANCE');
    }
  }

  // ---- act on the state ----
  if (bot.state === 'HOLD' && bot.holdPos) {
    // stand at the hold angle, slowly scan
    const arrived = moveToward(bot, bot.holdPos[0], bot.holdPos[1], dt, colliders, BOT.walkSpeed);
    if (arrived && bot.holdLook) {
      const want = Math.atan2(-(bot.holdLook[0] - bot.pos.x), -(bot.holdLook[1] - bot.pos.z));
      let dy = want - bot.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      bot.yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, dy + Math.sin(now * 0.5) * 0.4));
      bot.group.rotation.y = bot.yaw;
    }
    return;
  }

  if (bot.state === 'ENGAGING' && bot.target && bot.target.alive) {
    // face the target, close the distance when far, fire in bursts
    const t = bot.target;
    const dist = bot.pos.distanceTo(t.pos);
    const want = Math.atan2(-(t.pos.x - bot.pos.x), -(t.pos.z - bot.pos.z));
    let dy = want - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += Math.max(-6 * dt, Math.min(6 * dt, dy));
    bot.group.rotation.y = bot.yaw;
    // far target: walk toward it so the duel happens at a range where
    // shots actually land, instead of standing still at 40 m forever
    if (dist > 16) {
      moveToward(bot, t.pos.x, t.pos.z, dt, colliders, BOT.walkSpeed);
    } else {
      // close: small strafe so duels are not static
      const strafe = Math.sin(now * 1.7 + bot.name.length) * 0.8;
      bot.pos.x += Math.cos(bot.yaw) * strafe * dt * 0.7;
      bot.pos.z += -Math.sin(bot.yaw) * strafe * dt * 0.7;
      collideCircle(bot.pos, MOVE.radius, colliders);
    }
    if (now >= bot.reactAt) {
      // bots reload when dry (and resupply when the reserve runs out — the
      // player manages ammo, bots do not run dry mid-duel and go silent)
      if (bot.weapon.mag === 0) {
        if (!bot.weapon.startReload(now)) {
          bot.weapon.refill();
          bot.weapon.startReload(now);
        }
      }
      if (bot.burstLeft <= 0 && now >= bot.burstAt) {
        bot.burstLeft = BOT.burst;
        bot.burstAt = now + BOT.burstGap;
      }
      if (bot.burstLeft > 0 && bot.weapon.canFire(now)) {
        bot.burstLeft--;
        onFire(bot, t);
      }
    }
    return;
  }

  if (bot.state === 'DEFUSING') return; // sim.js drives the defuse timer

  // ADVANCE / SEARCHING / FALLING BACK: follow the route
  let goal = null;
  if (bot.state === 'SEARCHING' && bot.lastSeen) goal = [bot.lastSeen.x, bot.lastSeen.z];
  else if (bot.state === 'FALLING BACK') goal = bot.fallbackPoint;
  else if (bot.route.length && bot.routeIdx < bot.route.length) goal = bot.route[bot.routeIdx];

  if (goal) {
    const arrived = moveToward(bot, goal[0], goal[1], dt, colliders, BOT.runSpeed);
    if (arrived) {
      if (bot.state === 'SEARCHING') {
        // searched the spot: clear both the memory and the alert, so a
        // Sentinel can go back to HOLD instead of idling here forever
        bot.lastSeen = null;
        bot.alertPos = null;
      }
      else bot.routeIdx++;
    }
  } else if (bot.team === 'vanguard' && bot.site) {
    // no route yet: build one to the assigned site
    const key = bot.site === 'A' ? 'aSite' : 'bSite';
    bot.route = findRoute(world, nearestWaypoint(world, bot.pos.x, bot.pos.z), key);
    bot.routeIdx = 0;
  }
}
