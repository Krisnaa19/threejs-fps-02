// palette.js — DUSTLINE's chosen look and all tuned numbers.
// One job: constants. No imports, no state, no three.js here.

// ---- look: a dusty dusk palette (warm sand, teal shade, signal orange) ----
export const PALETTE = {
  sky: 0x2e3a4a,        // dusk blue-grey sky
  fog: 0x3a3f46,        // haze that softens the far walls
  ground: 0x8a6f4d,     // packed sand
  groundLine: 0x6e5638, // lane markings
  wall: 0xb59a6e,       // sun-baked plaster
  wallDark: 0x7d6a4a,   // shaded plaster
  crate: 0x9c7a45,      // wooden crates
  metal: 0x5b6670,      // corrugated metal
  tower: 0x4f7d8a,      // water tower (teal, site A landmark)
  warehouse: 0x8a4a3a,  // warehouse brick (site B landmark)
  accent: 0xff7a1a,     // signal orange: objectives, crosshair, buy highlights
  vanguard: 0x3f8f5f,   // attacker green
  sentinel: 0x4a6fa5,   // defender blue
  white: 0xf5efe2,
  shadow: 0x1c1a16,
};

export const MAP = {
  halfX: 32,            // ground spans x -32..32
  halfZ: 24,            // ground spans z -24..24
  wallHeight: 3.2,
  roundTime: 100,       // seconds per round
  buyTime: 12,          // seconds of buy phase
  plantTime: 3.0,       // seconds to plant
  defuseTime: 5.0,      // seconds to defuse
  bombTimer: 35,        // seconds from plant to explosion
  winRounds: 5,         // first to 5 rounds takes the match
  playerHP: 100,
  botHP: 100,
  surrenderHP: 25,      // a bot at or below this HP surrenders to the PLAYER
  surrenderReward: 300,
  killReward: 300,
  plantReward: 300,
  roundWin: 3250,
  roundLossBase: 1400,
  roundLossStep: 500,
  roundLossMax: 3400,
  startMoney: 800,
};

// ---- weapons ----
export const WEAPONS = {
  rifle: {
    name: 'DR-7', kind: 'rifle', price: 2700, damage: 26, headDamage: 52,
    mag: 30, reserve: 90, rate: 0.1, auto: true, reload: 2.2,
    spread: 0.011, moveSpread: 0.030, recoil: 0.014, range: 90,
  },
  sidearm: {
    name: 'P-9', kind: 'sidearm', price: 500, damage: 20, headDamage: 40,
    mag: 12, reserve: 36, rate: 0.22, auto: false, reload: 1.6,
    spread: 0.014, moveSpread: 0.028, recoil: 0.010, range: 50,
  },
  starter: {
    name: 'P-9', kind: 'sidearm', price: 0, damage: 20, headDamage: 40,
    mag: 12, reserve: 36, rate: 0.22, auto: false, reload: 1.6,
    spread: 0.014, moveSpread: 0.028, recoil: 0.010, range: 50,
  },
};

export const GRENADES = {
  frag:  { name: 'Frag',  price: 300, radius: 7, damage: 90 },
  smoke: { name: 'Smoke', price: 300, radius: 5, life: 14 },
  flash: { name: 'Flash', price: 200, radius: 18 },
};

export const ARMOR_PRICE = 650;
export const ARMOR_BLOCK = 0.30; // armor absorbs 30% of incoming damage

// ---- movement ----
export const MOVE = {
  walk: 4.6,            // m/s
  sprint: 6.4,
  crouch: 2.4,
  accel: 42,            // ground acceleration
  airAccel: 8,
  friction: 10,
  jump: 5.2,
  gravity: 14,
  eyeStand: 1.62,
  eyeCrouch: 1.05,
  radius: 0.38,         // player/bot capsule radius
  height: 1.72,
  crouchHeight: 1.10,
};

// ---- bot tuning ----
export const BOT = {
  react: 0.45,          // seconds before a bot fires after spotting you
  aimError: 0.028,      // radians of aim error (bigger = easier)
  burst: 4,             // shots per burst
  burstGap: 0.55,       // seconds between bursts
  hearRange: 25,        // metres: gunfire heard this far alerts bots
  seeRange: 26,         // metres: sight range — short enough that a bot
                         // closes to a real fighting distance instead of
                         // duelling across the whole map and never moving
  fov: 1.9,             // radians of vision cone
  walkSpeed: 3.4,
  runSpeed: 5.0,
  fallBackRange: 12,    // surrender makes nearby enemies fall back this far
};

// ---- sites (map landmarks) ----
export const SITES = {
  A: { name: 'A', label: 'Water Tower', center: [-22, -14], radius: 5.5 },
  B: { name: 'B', label: 'Warehouse', center: [22, -14], radius: 5.5 },
};
