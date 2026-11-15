// main.ts — DUSTLINE's entrypoint for make.fun threejs-fps-02.
// Run: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`
// It copies game/ and screenshots/ into the output directory and writes
// dossier.json with buildDossier from vendor/makefun-threejs.ts.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
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

import { buildDossier } from './vendor/makefun-threejs.ts';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(out, { recursive: true });
cpSync(join(root, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);

const d = JSON.parse(new TextDecoder().decode(dossier));
console.log('dossier written: ' + join(out, 'dossier.json'));
console.log('  bytes: ' + dossier.length + ' (max 1572864)');
console.log('  text: ' + (d.text ? d.text.length : 0) + ' chars (max 163840)');
console.log('  images: ' + (d.screenshots ? d.screenshots.length : 0));
console.log('  game files: ' + (d.game ? d.game.files : 0) + ', ' + (d.game ? d.game.bytes : 0) + ' bytes');
