// sim.js — DUSTLINE's single source of truth.
// One job: the game. It owns the state (phase, rounds, money, bomb,
// entities, grenades, kill feed, timeline), runs the fixed-step simulation,
// resolves every shot, the bomb, the economy and the spectator camera.
// Rendering lives in main.js; the HUD lives in hud.js; bots think in bot.js.

import * as THREE from 'three';
import { PALETTE, MAP, WEAPONS, GRENADES, ARMOR_PRICE, ARMOR_BLOCK, BOT } from './palette.js';
import { createPlayer } from './player.js';
import { createBot, updateBot, surrenderBot, killBot, reviveBot, setBotState, losBlocked } from './bot.js';
import { createWeapon, throwGrenade, stepGrenade } from './weapon.js';
import { groundAt } from './world.js';

// Ray vs AABB (slab test). Returns the nearest t >= 0, or Infinity.
export function rayBox(o, d, c) {
  let t0 = 0, t1 = Infinity;
  for (const [oo, dd, mn, mx] of [[o.x, d.x, c.minX, c.maxX], [o.y, d.y, c.minY, c.maxY], [o.z, d.z, c.minZ, c.maxZ]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) return Infinity; }
    else {
      let ta = (mn - oo) / dd, tb = (mx - oo) / dd;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

// Ray vs sphere. Returns t or Infinity.
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

export function createSim(scene, world, audio, hud) {
  const playerCtl = createPlayer(world, audio);
  const state = {
    phase: 'menu',           // menu | buy | play | roundEnd | matchEnd
    round: 1,
    scoreV: 0, scoreS: 0,
    timer: MAP.buyTime,
    money: MAP.startMoney,
    lossStreak: 0,
    bomb: { state: 'carried', site: null, pos: null, timer: 0, plantAt: 0, defuseAt: 0 },
    entities: [],
    grenades: [],
    smokes: [],
    feed: [],                // kill feed: {text, t}
    timeline: [],            // round timeline: {t, text}
    spectator: -1,           // index into vanguard bots, -1 = playing
    roundStartAt: 0,
    now: 0,
    lastPlayerShot: -10,     // sim time of the player's last shot (viewmodel)
    tracers: [],
    flashes: [],
  };

  // ---- entities ----
  const playerEnt = {
    kind: 'player', name: 'Dust', team: 'vanguard',
    ctl: playerCtl, weapon: createWeapon('starter'),
    hp: MAP.playerHP, alive: true, surrendered: false,
    hasArmor: false, money: MAP.startMoney,
    grenades: { frag: 1, smoke: 0, flash: 0 },
    selected: 'rifle', lastDamager: null,
  };
  playerEnt.pos = playerCtl.pos;
  state.entities.push(playerEnt);

  const bots = [];
  const vanguardNames = ['Rook', 'Vex'];
  const sentinelNames = ['Hale', 'Mira', 'Onyx'];
  vanguardNames.forEach((n, i) => {
    const b = createBot({ name: n, team: 'vanguard', spawn: world.vanguardSpawn[i + 1], world, scene });
    b.ent = { kind: 'bot', name: n, team: 'vanguard', ref: b, weapon: b.weapon, hp: 100, alive: true, surrendered: false, hasArmor: false, money: 800, grenades: { frag: 0, smoke: 0, flash: 0 }, lastDamager: null, pos: b.pos };
    bots.push(b);
    state.entities.push(b.ent);
  });
  sentinelNames.forEach((n, i) => {
    const b = createBot({ name: n, team: 'sentinel', spawn: world.sentinelSpawn[i], world, scene });
    b.ent = { kind: 'bot', name: n, team: 'sentinel', ref: b, weapon: b.weapon, hp: 100, alive: true, surrendered: false, hasArmor: false, money: 800, grenades: { frag: 0, smoke: 0, flash: 0 }, lastDamager: null, pos: b.pos };
    bots.push(b);
    state.entities.push(b.ent);
  });
  const vanguardBots = bots.filter(b => b.team === 'vanguard');
  const sentinelBots = bots.filter(b => b.team === 'sentinel');

  // tracer pool (thin lines that fade fast)
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 24; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(g, tracerMat.clone());
    line.visible = false;
    scene.add(line);
    state.tracers.push({ line, life: 0 });
  }
  function spawnTracer(a, b) {
    const t = state.tracers.find(x => x.life <= 0) || state.tracers[0];
    const p = t.line.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z);
    p.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.9;
    t.life = 0.09;
  }

  function feed(text) {
    state.feed.push({ text, t: state.now });
    if (state.feed.length > 6) state.feed.shift();
    hud.setFeed(state.feed);
  }
  function log(text) {
    state.timeline.push({ t: state.now - state.roundStartAt, text });
    hud.setTimeline(state.timeline);
  }

  function eyeOf(ent) {
    if (ent.kind === 'player') return ent.ctl.eye();
    return new THREE.Vector3(ent.pos.x, ent.pos.y + 1.55, ent.pos.z);
  }
  function headOf(ent) {
    return new THREE.Vector3(ent.pos.x, ent.pos.y + 1.62, ent.pos.z);
  }

  // ---- shooting ----
  function shoot(shooter, targetHint) {
    const w = shooter.weapon;
    if (!w.fire(state.now)) { if (w.mag === 0) audio.dryFire(); return; }
    const eye = eyeOf(shooter);
    const dir = aimDir(shooter, targetHint);
    // spread + recoil
    const moving = shooter.kind === 'player' ? shooter.ctl.moving : shooter.ref && shooter.ref.speed > 0.5;
    const spread = w.spreadFor(moving, false);
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
    if (shooter.kind === 'player') {
      playerCtl.look(0, -w.recoilP * 40); // kick the view up a touch
      audio.shot(w.def.kind);
      state.lastPlayerShot = state.now; // the viewmodel reads this for kick + flash
    } else {
      audio.enemyShot();
    }
    // muzzle = eye + dir * 0.5
    const muzzle = eye.clone().addScaledVector(dir, 0.5);
    // nearest world hit
    let bestT = w.def.range;
    for (const c of world.colliders) {
      const t = rayBox(eye, dir, c);
      if (t < bestT) bestT = t;
    }
    // nearest entity hit (head sphere, then body sphere)
    let hitEnt = null, hitHead = false, hitT = bestT;
    for (const e of state.entities) {
      if (e === shooter || !e.alive || e.surrendered) continue;
      if (e.team === shooter.team) continue;
      const th = raySphere(eye, dir, headOf(e), 0.26);
      const tb = raySphere(eye, dir, new THREE.Vector3(e.pos.x, e.pos.y + 0.95, e.pos.z), 0.5);
      const t = Math.min(th, tb);
      if (t < hitT) { hitT = t; hitEnt = e; hitHead = th <= tb; }
    }
    const end = eye.clone().addScaledVector(dir, hitT);
    spawnTracer(muzzle, end);
    if (hitEnt) {
      const dmg = hitHead ? w.def.headDamage : w.def.damage;
      damage(hitEnt, dmg, shooter, hitHead);
      if (shooter.kind === 'player') { if (hitHead) audio.headshot(); else audio.hit(); }
    }
    // gunfire alerts nearby bots
    for (const b of bots) {
      if (!b.alive || b.surrendered || b === shooter.ref) continue;
      if (b.pos.distanceTo(eye) < BOT.hearRange) {
        b.alertPos = eye.clone();
        if (b.state === 'HOLD') setBotState(b, 'SEARCHING');
      }
    }
  }

  function aimDir(shooter, targetHint) {
    if (shooter.kind === 'player') return shooter.ctl.dir();
    const b = shooter.ref;
    const t = targetHint || b.target;
    if (!t || !t.alive) return new THREE.Vector3(-Math.sin(b.yaw), 0, -Math.cos(b.yaw));
    const target = new THREE.Vector3(t.pos.x, t.pos.y + 1.2, t.pos.z);
    const eye = eyeOf(shooter);
    const d = target.clone().sub(eye).normalize();
    // bot aim error: worse against a moving, crouched target
    const err = BOT.aimError * (t.kind === 'player' && t.ctl.moving ? 1.6 : 1);
    d.x += (Math.random() - 0.5) * 2 * err;
    d.y += (Math.random() - 0.5) * 2 * err;
    d.z += (Math.random() - 0.5) * 2 * err;
    return d.normalize();
  }

  function damage(victim, amount, attacker, head) {
    if (!victim.alive) return;
    let dmg = amount;
    if (victim.hasArmor) dmg *= (1 - ARMOR_BLOCK);
    victim.hp -= dmg;
    victim.lastDamager = attacker;
    // hit reaction: a living bot staggers back for a beat when shot
    if (victim.kind === 'bot' && victim.ref && victim.hp > 0) {
      victim.ref.flinch = 0.18;
    }
    if (victim.kind === 'player') {
      audio.hurt();
      hud.flashDamage();
    }
    // SURRENDER: only the PLAYER's damage can break a bot, at 25 HP or less.
    if (victim.kind === 'bot' && victim.hp > 0 && victim.hp <= MAP.surrenderHP && attacker && attacker.kind === 'player') {
      surrenderBot(victim.ref);
      victim.surrendered = true;
      state.money += MAP.surrenderReward;
      playerEnt.money = state.money;
      feed(victim.name + ' surrendered  +$' + MAP.surrenderReward);
      log(victim.name + ' surrendered to ' + attacker.name);
      audio.surrender();
      hud.banner(victim.name + ' SURRENDERED  +$' + MAP.surrenderReward, 2.5);
      hud.moneyPopup('+$' + MAP.surrenderReward + '  SURRENDER');
      // chain reaction: nearby enemies fall back to their site
      for (const b of bots) {
        if (!b.alive || b.surrendered || b.team === victim.team) continue;
        if (b.pos.distanceTo(victim.pos) < BOT.fallBackRange) {
          b.fallbackPoint = b.team === 'sentinel'
            ? [world.sites[b.site || 'A'].center[0], world.sites[b.site || 'A'].center[1]]
            : [0, 12];
          setBotState(b, 'FALLING BACK');
        }
      }
      return;
    }
    if (victim.hp <= 0) {
      victim.hp = 0;
      victim.alive = false;
      if (victim.kind === 'bot') killBot(victim.ref);
      const killer = attacker ? attacker.name : 'world';
      feed(killer + ' ✕ ' + victim.name + (head ? '  (headshot)' : ''));
      log(killer + ' eliminated ' + victim.name + (head ? ' (headshot)' : ''));
      if (attacker && attacker.kind === 'player') {
        state.money += MAP.killReward;
        playerEnt.money = state.money;
        audio.kill();
      }
      if (victim.kind === 'player') {
        // death: hand the camera to a living Vanguard teammate
        const living = vanguardBots.filter(b => b.alive && !b.surrendered);
        state.spectator = living.length ? 0 : -1;
        hud.showSpectator(living.length ? living[0].name : null);
      }
      // the bomb drops if the carrier dies
      if (victim.ref && victim.ref.carrier) {
        victim.ref.carrier = false;
        state.bomb.state = 'dropped';
        state.bomb.pos = victim.pos.clone();
        log('The bomb was dropped');
      }
    }
  }

  // ---- grenades ----
  function explodeFrag(g) {
    audio.grenade();
    // visual: quick orange sphere
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(g.radius, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.5 })
    );
    mesh.position.copy(g.pos);
    scene.add(mesh);
    setTimeout(() => scene.remove(mesh), 350);
    for (const e of state.entities) {
      if (!e.alive || e.surrendered) continue;
      const d = e.pos.distanceTo(g.pos);
      if (d < g.radius) {
        const fall = 1 - (d / g.radius) * 0.6;
        damage(e, GRENADES.frag.damage * fall, null, false);
      }
    }
  }
  function popSmoke(g) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(g.radius, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xbfc4c9, transparent: true, opacity: 0.42 })
    );
    mesh.position.set(g.pos.x, g.pos.y + 0.8, g.pos.z);
    scene.add(mesh);
    state.smokes.push({ kind: 'smoke', pos: g.pos.clone(), radius: g.radius, mesh, life: g.life });
  }
  function popFlash(g) {
    // bots looking at the flash are blinded for 2s
    for (const b of bots) {
      if (!b.alive || b.surrendered) continue;
      const d = b.pos.distanceTo(g.pos);
      if (d > GRENADES.flash.radius) continue;
      const toFlash = g.pos.clone().sub(new THREE.Vector3(b.pos.x, b.pos.y + 1.5, b.pos.z)).normalize();
      const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      if (fx * toFlash.x + fz * toFlash.z > 0.2) {
        b.target = null;
        b.reactAt = state.now + 2;
        setBotState(b, 'SEARCHING');
      }
    }
    // the player gets a white flash if looking at it
    const pe = eyeOf(playerEnt);
    const d = pe.distanceTo(g.pos);
    if (d < GRENADES.flash.radius && playerEnt.alive) {
      const toFlash = g.pos.clone().sub(pe).normalize();
      const pd = playerCtl.dir();
      if (pd.dot(toFlash) > 0.3) hud.flashWhite(Math.max(0.4, 1 - d / GRENADES.flash.radius));
    }
    audio.flash();
  }

  function throwPlayerGrenade(kind) {
    if (playerEnt.grenades[kind] <= 0 || !playerEnt.alive) return;
    playerEnt.grenades[kind]--;
    const eye = eyeOf(playerEnt);
    state.grenades.push(throwGrenade(kind, eye, playerCtl.dir(), 13));
    audio.click();
  }

  // ---- rounds ----
  function startRound() {
    state.roundStartAt = state.now;
    state.timeline = [];
    state.feed = [];
    hud.setFeed([]); hud.setTimeline([]);
    state.bomb = { state: 'carried', site: null, pos: null, timer: 0, plantAt: 0, defuseAt: 0 };
    state.grenades = [];
    for (const s of state.smokes) scene.remove(s.mesh);
    state.smokes = [];
    state.spectator = -1;
    hud.showSpectator(null);
    // respawn everyone at their spawn, facing the fight:
    // Vanguard (player + bots) face north (-Z, toward the sites);
    // Sentinels face south (+Z, toward the Vanguard approach).
    playerCtl.spawnAt(0, 20, 0);
    playerEnt.hp = MAP.playerHP; playerEnt.alive = true; playerEnt.surrendered = false;
    playerEnt.weapon = createWeapon(playerEnt.hasRifle ? 'rifle' : playerEnt.sidearm ? 'sidearm' : 'starter');
    playerEnt.weapon.setReserve(playerEnt.hasRifle ? 90 : playerEnt.sidearm ? 36 : 36);
    playerEnt.grenades = { frag: playerEnt.grenades.frag, smoke: playerEnt.grenades.smoke, flash: playerEnt.grenades.flash };
    vanguardBots.forEach((b, i) => {
      reviveBot(b, world.vanguardSpawn[i + 1], 0);
      b.ent.hp = 100; b.ent.alive = true; b.ent.surrendered = false;
      b.ent.weapon = b.weapon;
      b.ent.hasArmor = b.hasArmor;
      b.money = b.money;
    });
    sentinelBots.forEach((b, i) => {
      reviveBot(b, world.sentinelSpawn[i], Math.PI);
      b.ent.hp = 100; b.ent.alive = true; b.ent.surrendered = false;
      b.ent.weapon = b.weapon;
      b.ent.hasArmor = b.hasArmor;
    });
    // Sentinel holds
    const holdKeys = ['aTower', 'aDoor', 'midArch'];
    sentinelBots.forEach((b, i) => {
      b.holdKey = holdKeys[i % holdKeys.length];
      b.holdPos = world.holds[b.holdKey].pos;
      b.holdLook = world.holds[b.holdKey].look;
      b.site = i === 0 ? 'A' : i === 1 ? 'B' : null;
      setBotState(b, 'HOLD');
    });
    // Vanguard: pick a site, one carries the bomb, all advance on it
    const site = Math.random() < 0.5 ? 'A' : 'B';
    vanguardBots.forEach((b, i) => {
      b.site = site;
      b.carrier = i === 0;
      if (i === 0) log('Rook carries the bomb — site ' + site);
      setBotState(b, 'ADVANCE');
    });
    state.phase = 'buy';
    state.timer = MAP.buyTime;
    hud.setObjective(site, 'Attack');
    log('Round ' + state.round + ' — attack site ' + site);
    hud.banner('ROUND ' + state.round + ' — ATTACK SITE ' + site, 2.5);
    // bots auto-buy
    for (const b of bots) autoBuy(b);
    hud.refreshBuy(state.money, playerEnt);
    hud.showBuy();
  }

  function autoBuy(b) {
    // bots spend simply: rifle when they can afford it, then armor, then a frag
    if (!b.hasRifle && b.money >= WEAPONS.rifle.price) {
      b.money -= WEAPONS.rifle.price;
      b.hasRifle = true;
      b.weapon = createWeapon('rifle');
      b.ent.weapon = b.weapon;
    } else if (b.hasRifle) {
      b.weapon.refill();
    }
    if (!b.hasArmor && b.money >= ARMOR_PRICE) { b.money -= ARMOR_PRICE; b.hasArmor = true; b.ent.hasArmor = true; }
    if (b.money >= GRENADES.frag.price) { b.money -= GRENADES.frag.price; b.ent.grenades.frag = 1; b.grenades.frag = 1; }
  }

  function buy(item) {
    if (state.phase !== 'buy') return false;
    const prices = {
      rifle: WEAPONS.rifle.price, sidearm: WEAPONS.sidearm.price,
      frag: GRENADES.frag.price, smoke: GRENADES.smoke.price, flash: GRENADES.flash.price,
      armor: ARMOR_PRICE,
    };
    if (!(item in prices) || state.money < prices[item]) return false;
    state.money -= prices[item];
    playerEnt.money = state.money;
    if (item === 'rifle') { playerEnt.hasRifle = true; playerEnt.weapon = createWeapon('rifle'); }
    if (item === 'sidearm') { playerEnt.sidearm = true; playerEnt.weapon = createWeapon('sidearm'); }
    if (item === 'armor') playerEnt.hasArmor = true;
    if (item in GRENADES) playerEnt.grenades[item]++;
    audio.buy();
    hud.refreshBuy(state.money, playerEnt);
    return true;
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.timer = 4;
    if (winner === 'vanguard') {
      state.scoreV++;
      state.money += MAP.roundWin;
      state.lossStreak = 0;
      for (const b of vanguardBots) b.money += MAP.roundWin;
      audio.roundWin();
    } else {
      state.scoreS++;
      const bonus = Math.min(MAP.roundLossMax, MAP.roundLossBase + state.lossStreak * MAP.roundLossStep);
      state.money += bonus;
      state.lossStreak++;
      for (const b of vanguardBots) b.money += bonus;
      audio.roundLose();
    }
    playerEnt.money = state.money;
    log('Round ' + state.round + ' — ' + (winner === 'vanguard' ? 'Vanguard' : 'Sentinels') + ' win (' + reason + ')');
    hud.banner((winner === 'vanguard' ? 'VANGUARD WINS' : 'SENTINELS WIN') + ' — ' + reason, 3.5);
    hud.setScore(state.scoreV, state.scoreS);
  }

  function nextRound() {
    if (state.scoreV >= MAP.winRounds || state.scoreS >= MAP.winRounds) {
      state.phase = 'matchEnd';
      const vWon = state.scoreV >= MAP.winRounds;
      if (vWon) audio.matchWin();
      hud.showMatchEnd(vWon, state.scoreV, state.scoreS);
      log('Match over — ' + (vWon ? 'Vanguard' : 'Sentinels') + ' take DUSTLINE');
      return;
    }
    state.round++;
    // keep rifle/armor across rounds; reset per-round grenades
    playerEnt.hasRifle = playerEnt.hasRifle;
    startRound();
  }

  // ---- bomb ----
  function siteAt(pos) {
    for (const [key, s] of Object.entries(world.sites)) {
      const dx = pos.x - s.center[0], dz = pos.z - s.center[1];
      if (dx * dx + dz * dz < s.radius * s.radius) return key;
    }
    return null;
  }

  // The planted bomb's countdown. Planting and defusing are driven by the
  // bots in step() (they stand in the site / at the bomb); this only ticks.
  function updateBomb(dt) {
    const b = state.bomb;
    if (b.state !== 'planted') return;
    b.timer -= dt;
    if (Math.floor(b.timer * 2) !== Math.floor((b.timer + dt) * 2)) audio.bombTick();
    if (b.timer <= 0) {
      // explosion: Vanguard wins; anyone in the site dies
      for (const e of state.entities) {
        if (e.alive && b.pos && e.pos.distanceTo(b.pos) < 9) damage(e, 999, null, false);
      }
      endRound('vanguard', 'bomb detonated');
    }
  }

  // ---- player planting (hold E in a site) ----
  function updatePlayerPlant(dt, input) {
    const b = state.bomb;
    if (b.state !== 'carried' && b.state !== 'dropped') return;
    if (!playerEnt.alive) return;
    const site = siteAt(playerCtl.pos);
    const hasBomb = b.state === 'carried' || b.state === 'dropped';
    if (site && hasBomb && input.plant) {
      b.plantAt += dt;
      if (Math.floor(b.plantAt * 2) !== Math.floor((b.plantAt - dt) * 2)) audio.plantBeep();
      hud.setPlantProgress(b.plantAt / MAP.plantTime);
      if (b.plantAt >= MAP.plantTime) {
        b.state = 'planted';
        b.site = site;
        b.pos = playerCtl.pos.clone();
        b.timer = MAP.bombTimer;
        state.money += MAP.plantReward;
        playerEnt.money = state.money;
        log('Dust planted the bomb at site ' + site + ' (+$' + MAP.plantReward + ')');
        hud.setObjective(site, 'Defend');
        hud.banner('BOMB PLANTED AT ' + site, 3);
        hud.setPlantProgress(0);
        audio.plantDone();
      }
    } else {
      b.plantAt = 0;
      hud.setPlantProgress(0);
    }
  }

  // ---- fixed step ----
  function step(dt, input) {
    state.now += dt;
    if (state.phase === 'menu' || state.phase === 'matchEnd') return;

    // tracers fade
    for (const t of state.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    // smoke clouds age
    for (let i = state.smokes.length - 1; i >= 0; i--) {
      const s = state.smokes[i];
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, Math.min(0.42, s.life / 3));
      if (s.life <= 0) { scene.remove(s.mesh); state.smokes.splice(i, 1); }
    }
    // grenades
    for (let i = state.grenades.length - 1; i >= 0; i--) {
      const g = state.grenades[i];
      if (stepGrenade(g, dt, world.colliders, (x, z, y) => groundAt(x, z, y, world.colliders))) {
        if (g.kind === 'frag') explodeFrag(g);
        else if (g.kind === 'smoke') popSmoke(g);
        else popFlash(g);
        state.grenades.splice(i, 1);
      }
    }

    if (state.phase === 'buy') {
      state.timer -= dt;
      hud.refresh(state, playerEnt);
      if (state.timer <= 0) {
        state.phase = 'play';
        state.timer = MAP.roundTime;
        state.roundStartAt = state.now;
        hud.hideBuy();
        log('Round ' + state.round + ' live');
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) nextRound();
      return;
    }
    if (state.phase !== 'play') return;

    state.timer -= dt;
    // player movement + firing
    if (playerEnt.alive) {
      playerCtl.update(dt, input, world.colliders);
      playerEnt.weapon.update(state.now, dt);
      if (input.fire) shoot(playerEnt, null);
      if (input.reload) {
        if (playerEnt.weapon.startReload(state.now)) audio.reload();
      }
      if (input.grenade) {
        throwPlayerGrenade(input.grenade);
        input.grenade = null;
      }
      if (input.weaponKey) {
        if (input.weaponKey === '1' && playerEnt.hasRifle) playerEnt.weapon = createWeapon('rifle');
        if (input.weaponKey === '2') playerEnt.weapon = createWeapon('sidearm');
        input.weaponKey = null;
      }
      updatePlayerPlant(dt, input);
    }

    // bots
    const ctx = {
      now: state.now,
      enemies: state.entities,
      colliders: world.colliders,
      smokes: state.smokes,
      world,
      audio,
      bombPlanted: state.bomb.state === 'planted',
      plantSite: state.bomb.site,
      siteClear: false,
      onFire: (bot, target) => shoot(bot.ent, target),
    };
    // site clear for the carrier's site
    for (const bot of vanguardBots) {
      if (bot.carrier && bot.site) {
        const s = world.sites[bot.site];
        ctx.siteClear = sentinelBots.every(x => !x.alive || x.surrendered ||
          Math.hypot(x.pos.x - s.center[0], x.pos.z - s.center[1]) > s.radius + 6);
      }
    }
    for (const b of bots) {
      b.weapon.update(state.now, dt);
      updateBot(b, dt, ctx);
      // a bot that reaches the planted bomb defuses
      if (state.bomb.state === 'planted' && b.team === 'sentinel' && b.alive && !b.surrendered) {
        if (b.pos.distanceTo(state.bomb.pos) < 2.2) {
          setBotState(b, 'DEFUSING');
          b.defuseAt += dt;
          if (Math.floor(b.defuseAt * 2) !== Math.floor((b.defuseAt - dt) * 2)) audio.defuseBeep();
          if (b.defuseAt >= MAP.defuseTime) { endRound('sentinel', 'bomb defused'); return; }
        } else b.defuseAt = 0;
      }
      // Vanguard carrier plants when the site is clear
      if ((state.bomb.state === 'carried' || state.bomb.state === 'dropped') && b.team === 'vanguard' && b.carrier && b.alive && !b.surrendered) {
        const site = siteAt(b.pos);
        if (site && ctx.siteClear) {
          state.bomb.state = 'planted';
          state.bomb.site = site;
          state.bomb.pos = b.pos.clone();
          state.bomb.timer = MAP.bombTimer;
          log('Bomb planted at site ' + site + ' by ' + b.name);
          hud.setObjective(site, 'Defend');
          hud.banner('BOMB PLANTED AT ' + site, 3);
          audio.plantDone();
        }
      }
    }

    updateBomb(dt);

    // round end: elimination / timer
    const vAlive = state.entities.some(e => e.team === 'vanguard' && e.alive && !e.surrendered);
    const sAlive = state.entities.some(e => e.team === 'sentinel' && e.alive && !e.surrendered);
    const bombLive = state.bomb.state === 'planted';
    if (!vAlive && !bombLive) endRound('sentinel', 'Vanguard eliminated');
    else if (!sAlive && !bombLive) endRound('vanguard', 'Sentinels eliminated');
    else if (!sAlive && bombLive) {
      // all defenders dead while the bomb ticks: Vanguard wins on detonation,
      // unless the timer already ended the round; nothing to do here.
    }
    if (state.timer <= 0 && state.phase === 'play') {
      if (bombLive) { /* bomb timer decides */ }
      else endRound('sentinel', 'time expired');
    }

    hud.refresh(state, playerEnt);
  }

  function startMatch() {
    state.round = 1;
    state.scoreV = 0; state.scoreS = 0;
    state.money = MAP.startMoney;
    playerEnt.money = MAP.startMoney;
    playerEnt.hasRifle = false;
    playerEnt.sidearm = false;
    playerEnt.hasArmor = false;
    playerEnt.grenades = { frag: 1, smoke: 0, flash: 0 };
    state.lossStreak = 0;
    for (const b of bots) {
      b.money = 800; b.hasRifle = false; b.hasArmor = false;
      b.weapon = createWeapon('starter'); b.ent.weapon = b.weapon;
      b.ent.hasArmor = false; b.ent.grenades = { frag: 0, smoke: 0, flash: 0 };
    }
    hud.setScore(0, 0);
    startRound();
  }

  // spectator camera: the eye of the bot being watched
  function spectatorEye(out) {
    const living = vanguardBots.filter(b => b.alive && !b.surrendered);
    if (!living.length || state.spectator < 0) return null;
    const b = living[state.spectator % living.length];
    out.set(b.pos.x, b.pos.y + 1.55, b.pos.z);
    return { eye: out, yaw: b.yaw, name: b.name };
  }
  function cycleSpectator() {
    const living = vanguardBots.filter(b => b.alive && !b.surrendered);
    if (!living.length) return;
    state.spectator = (state.spectator + 1) % living.length;
    hud.showSpectator(living[state.spectator].name);
  }

  // ---- debug hook (used only by the screenshot script, ?shot=surrender) ----
  // Stages the signature moment through the REAL code path: a Sentinel is
  // placed in front of the player and wounded by the player to 20 HP, so
  // the real surrender check in damage() fires. Nothing here is faked.
  function debugSurrender() {
    const target = sentinelBots.find(b => b.alive && !b.surrendered);
    if (!target || !playerEnt.alive) return false;
    const dir = playerCtl.dir();
    const px = playerCtl.pos.x, pz = playerCtl.pos.z;
    // the surrendered bot, 6 m ahead, big enough to read the kneel + flag
    target.pos.set(px + dir.x * 6, 0, pz + dir.z * 6);
    target.pos.y = groundAt(target.pos.x, target.pos.z, 0, world.colliders);
    target.group.position.copy(target.pos);
    target.yaw = Math.atan2(-(px - target.pos.x), -(pz - target.pos.z));
    target.group.rotation.y = target.yaw;
    // teammates behind the player, out of the shot, so the surrendered
    // bot is the only figure in frame
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    vanguardBots.forEach((b, i) => {
      if (!b.alive || b.surrendered) return;
      const side = i === 0 ? -1 : 1;
      b.pos.set(px - dir.x * 3 + right.x * side * 4, 0, pz - dir.z * 3 + right.z * side * 4);
      b.pos.y = groundAt(b.pos.x, b.pos.z, 0, world.colliders);
      b.group.position.copy(b.pos);
      b.yaw = Math.atan2(-(target.pos.x - b.pos.x), -(target.pos.z - b.pos.z));
      b.group.rotation.y = b.yaw;
      setBotState(b, 'HOLD');
    });
    // wound it to exactly 20 HP through the real damage path (armor-aware)
    const block = target.ent.hasArmor ? (1 - ARMOR_BLOCK) : 1;
    damage(target.ent, (target.ent.hp - 20) / block, playerEnt, false);
    return true;
  }

  // Ends the round as a Vanguard win through the REAL damage path, so the
  // round-end banner and the score update exactly as they do in play.
  function debugWinRound() {
    for (const b of sentinelBots) {
      if (b.alive && !b.surrendered) damage(b.ent, 999, playerEnt, false);
    }
  }

  return {
    state, playerEnt, bots, playerCtl,
    step, startMatch, startRound, buy, cycleSpectator,
    spectatorEye, debugSurrender, debugWinRound,
    get phase() { return state.phase; },
  };
}
