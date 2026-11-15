// world.js — DUSTLINE's map: an original three-lane yard, built from boxes.
// One job: the map. It builds the meshes, the collision boxes, the spawn
// points, the bomb sites, the sniper perches and the bot waypoint graph.
// No game rules here; sim.js decides what the map means.

import * as THREE from 'three';
import { PALETTE, SITES } from './palette.js';

function boxMat(color, rough) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough ?? 0.9, metalness: 0.05 });
}

// A solid box: adds the mesh to the scene and records an AABB collider.
function solid(scene, colliders, x, y, z, w, h, d, color, rough) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat(color, rough));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h });
  return m;
}

export function buildWorld(scene) {
  const colliders = [];
  const P = PALETTE;

  // ---- sky, light, fog ----
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.fog, 55, 110);
  const sun = new THREE.DirectionalLight(0xffe0b3, 2.2);
  sun.position.set(28, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x8a7a66, 0.9));
  const hemi = new THREE.HemisphereLight(0x9db4c8, 0x6b543a, 0.55);
  scene.add(hemi);

  // ---- ground ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 48),
    new THREE.MeshStandardMaterial({ color: P.ground, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // lane markings (thin dark strips, visual only)
  const laneMat = new THREE.MeshStandardMaterial({ color: P.groundLine, roughness: 1 });
  for (const lx of [-24, 0, 24]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 44), laneMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(lx, 0.01, 0);
    scene.add(strip);
  }
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(48, 2.2), laneMat);
  cross.rotation.x = -Math.PI / 2;
  cross.position.set(0, 0.01, 0);
  scene.add(cross);

  // ---- perimeter walls ----
  solid(scene, colliders, 0, 0, -24, 64, 3.2, 1, P.wallDark);
  solid(scene, colliders, 0, 0, 24, 64, 3.2, 1, P.wallDark);
  solid(scene, colliders, -32, 0, 0, 1, 3.2, 48, P.wallDark);
  solid(scene, colliders, 32, 0, 0, 1, 3.2, 48, P.wallDark);

  // ---- site A: water tower (west) ----
  const tower = new THREE.Group();
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 3.4, 12),
    boxMat(P.tower, 0.6)
  );
  tank.position.y = 6.2; tank.castShadow = true;
  tower.add(tank);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.9, 1.4, 12),
    boxMat(P.metal, 0.5)
  );
  roof.position.y = 8.6; roof.castShadow = true;
  tower.add(roof);
  for (const [lx, lz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.8, 0.35), boxMat(P.metal, 0.6));
    leg.position.set(lx, 2.4, lz); leg.castShadow = true;
    tower.add(leg);
  }
  tower.position.set(-22, 0, -14);
  scene.add(tower);
  // tower legs + base block the site's centre
  colliders.push({ minX: -23.6, maxX: -20.4, minZ: -15.6, maxZ: -12.4, minY: 0, maxY: 4.8 });
  // site A marker ring + faint zone disc (visual): the bombsite reads at a
  // glance, even from the spawn. A is signal orange, B is teal, so the two
  // sites are instantly distinguishable.
  const ringA = new THREE.Mesh(
    new THREE.RingGeometry(4.6, 5.5, 32),
    new THREE.MeshBasicMaterial({ color: P.accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ringA.rotation.x = -Math.PI / 2; ringA.position.set(-22, 0.02, -14);
  scene.add(ringA);
  const zoneA = new THREE.Mesh(
    new THREE.CircleGeometry(4.6, 32),
    new THREE.MeshBasicMaterial({ color: P.accent, transparent: true, opacity: 0.10, side: THREE.DoubleSide })
  );
  zoneA.rotation.x = -Math.PI / 2; zoneA.position.set(-22, 0.015, -14);
  scene.add(zoneA);

  // ---- site B: warehouse (east) ----
  solid(scene, colliders, 22, 0, -19.5, 12, 4.5, 1.2, P.warehouse);          // back wall
  solid(scene, colliders, 16.5, 0, -14, 1.2, 4.5, 11, P.warehouse);         // west wall
  solid(scene, colliders, 27.5, 0, -14, 1.2, 4.5, 11, P.warehouse);         // east wall
  solid(scene, colliders, 22, 4.5, -14, 12, 0.5, 11, P.metal);              // roof slab
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 0.6), boxMat(P.metal, 0.5));
  doorFrame.position.set(22, 3.4, -8.6); doorFrame.castShadow = true;
  scene.add(doorFrame);
  const ringB = new THREE.Mesh(
    new THREE.RingGeometry(4.6, 5.5, 32),
    new THREE.MeshBasicMaterial({ color: P.tower, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ringB.rotation.x = -Math.PI / 2; ringB.position.set(22, 0.02, -14);
  scene.add(ringB);
  const zoneB = new THREE.Mesh(
    new THREE.CircleGeometry(4.6, 32),
    new THREE.MeshBasicMaterial({ color: P.tower, transparent: true, opacity: 0.10, side: THREE.DoubleSide })
  );
  zoneB.rotation.x = -Math.PI / 2; zoneB.position.set(22, 0.015, -14);
  scene.add(zoneB);

  // ---- centre plaza: low fountain wall + crates ----
  solid(scene, colliders, 0, 0, 0, 5, 0.9, 5, P.wall, 0.95);               // plaza block
  solid(scene, colliders, -8, 0, 6, 2.4, 1.2, 1.2, P.crate);
  solid(scene, colliders, 8, 0, -6, 2.4, 1.2, 1.2, P.crate);
  solid(scene, colliders, -12, 0, -4, 1.2, 1.2, 2.4, P.crate);
  solid(scene, colliders, 12, 0, 4, 1.2, 1.2, 2.4, P.crate);

  // ---- lane cover: crates and barriers so every lane has corners ----
  const cover = [
    [-24, 8, 2.4, 1.2, 1.2], [-24, -4, 1.2, 1.2, 2.4], [-20, -8, 2.4, 1.2, 1.2],
    [-10, 12, 2.4, 1.2, 1.2], [-6, -12, 1.2, 1.2, 2.4], [6, 12, 2.4, 1.2, 1.2],
    [0, -6, 2.4, 1.2, 1.2], [10, -12, 1.2, 1.2, 2.4], [20, 8, 2.4, 1.2, 1.2],
    [24, -4, 1.2, 1.2, 2.4], [16, 2, 2.4, 1.2, 1.2], [-16, 2, 2.4, 1.2, 1.2],
    [-28, -18, 2.4, 1.2, 1.2], [28, -18, 2.4, 1.2, 1.2],
  ];
  for (const [x, z, w, h, d] of cover) solid(scene, colliders, x, 0, z, w, h, d, P.crate);
  // stacked crates (taller cover on mid)
  solid(scene, colliders, -4, 0, 8, 1.2, 2.4, 1.2, P.crate);
  solid(scene, colliders, 4, 0, -8, 1.2, 2.4, 1.2, P.crate);

  // ---- sniper perches: one per flank, a 0.45 m step crate + a 0.9 m platform ----
  function perch(x, z) {
    solid(scene, colliders, x, 0, z + 1.1, 1.4, 0.45, 1.0, P.crate);   // step
    solid(scene, colliders, x, 0, z, 2.2, 0.9, 1.6, P.metal);          // platform
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 0.12), boxMat(P.metal, 0.5));
    rail.position.set(x, 1.15, z - 0.75); rail.castShadow = true;
    scene.add(rail);
  }
  perch(-24, 2);   // west perch, overlooks the A lane
  perch(24, 2);    // east perch, overlooks the B lane

  // ---- waypoint graph for bots (lanes + junctions) ----
  // NOTE: every key must be unique — an earlier draft had TWO entries named
  // sJunction ([0,12] and [0,-16]); the second silently overwrote the first,
  // so every route from the Vanguard spawn ran straight through the plaza
  // block and the bots wedged against it. The north junction is nJunction.
  const waypoints = {
    vSpawn: [0, 20], sJunction: [0, 12], wSouth: [-24, 12], wMid: [-24, 2],
    wNorth: [-24, -10], midSouth: [0, 6], plaza: [5, 0], midNorth: [0, -10],
    eSouth: [24, 12], eMid: [24, 2], eNorth: [24, -10],
    aSite: [-22, -14], aApproach: [-18, -8], bSite: [22, -14], bApproach: [18, -8],
    sSpawn: [0, -20], nJunction: [0, -16],
  };
  const edges = [
    ['vSpawn', 'sJunction'], ['sJunction', 'wSouth'], ['sJunction', 'midSouth'],
    ['sJunction', 'eSouth'], ['wSouth', 'wMid'], ['wMid', 'wNorth'],
    ['wNorth', 'aApproach'], ['aApproach', 'aSite'],
    ['midSouth', 'plaza'], ['plaza', 'midNorth'], ['midNorth', 'nJunction'],
    ['midNorth', 'aApproach'], ['midNorth', 'bApproach'],
    ['eSouth', 'eMid'], ['eMid', 'eNorth'], ['eNorth', 'bApproach'],
    ['bApproach', 'bSite'], ['sSpawn', 'nJunction'],
    ['nJunction', 'aApproach'], ['nJunction', 'bApproach'],
    ['wMid', 'plaza'], ['eMid', 'plaza'],
  ];

  // Sentinel hold angles (named positions defenders watch from)
  const holds = {
    aTower: { pos: [-19, -16], look: [-24, -6] },
    aDoor: { pos: [-15, -11], look: [-24, -14] },
    midArch: { pos: [0, -9], look: [0, 6] },
    bDoor: { pos: [15, -11], look: [24, -14] },
    bHouse: { pos: [20, -17], look: [24, -6] },
  };

  return {
    colliders,
    waypoints,
    edges,
    holds,
    sites: SITES,
    vanguardSpawn: [[-4, 20], [0, 21], [4, 20]],
    sentinelSpawn: [[-4, -20], [0, -21], [4, -20]],
    perches: [{ x: -24, z: 2 }, { x: 24, z: 2 }],
  };
}

// ---- collision: push a circle (x,z,radius) out of every AABB it overlaps ----
export function collideCircle(pos, radius, colliders) {
  for (const c of colliders) {
    if (pos.y >= c.maxY || pos.y + 1.72 <= c.minY) continue;
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = pos.x - c.minX, pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
}

// Ground height under (x,z): 0, or the top of a low box the entity stands on.
export function groundAt(x, z, y, colliders) {
  let g = 0;
  for (const c of colliders) {
    if (x >= c.minX - 0.1 && x <= c.maxX + 0.1 && z >= c.minZ - 0.1 && z <= c.maxZ + 0.1) {
      if (c.maxY <= 0.95 && c.maxY > g && y >= c.maxY - 0.6) g = c.maxY;
    }
  }
  return g;
}

// Breadth-first route over the waypoint graph; returns a list of [x,z].
export function findRoute(world, fromKey, toKey) {
  const { waypoints, edges } = world;
  if (!waypoints[fromKey] || !waypoints[toKey]) return [waypoints[toKey]];
  const adj = {};
  for (const [a, b] of edges) {
    (adj[a] = adj[a] || []).push(b);
    (adj[b] = adj[b] || []).push(a);
  }
  const prev = { [fromKey]: null };
  const q = [fromKey];
  while (q.length) {
    const n = q.shift();
    if (n === toKey) break;
    for (const m of adj[n] || []) {
      if (!(m in prev)) { prev[m] = n; q.push(m); }
    }
  }
  if (!(toKey in prev)) return [waypoints[toKey]];
  const path = [];
  let n = toKey;
  while (n) { path.unshift(waypoints[n]); n = prev[n]; }
  return path;
}

// Nearest waypoint key to a position.
export function nearestWaypoint(world, x, z) {
  let best = null, bd = Infinity;
  for (const [k, [wx, wz]] of Object.entries(world.waypoints)) {
    const d = (wx - x) ** 2 + (wz - z) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
