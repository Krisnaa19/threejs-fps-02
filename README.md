# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Krisnaa19/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Krisnaa19/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**DUSTLINE** — a CS-style round shooter in three.js. Vanguard (you + 2 bots) attacks; Sentinels (3 bots) defend. Two bomb sites: **A is a water tower**, **B is a warehouse**. Three lanes connect the spawns to the sites. First to 5 rounds wins. Static files only — no build step, no network, no model calls.

## Signature mechanic: SURRENDER

A bot **you** wound to 25 HP or less surrenders: it drops its weapon, kneels, raises a **waving white flag**, shows a white ring on the ground, and stops fighting **permanently** — it never re-arms and never defuses. You are paid **$300** and the banner, kill feed, and a floating "+$300" popup all say so. Bot-vs-bot damage never triggers it. A surrendered bot's nearby enemies **fall back** and nearby allies may surrender too when morale is low. In the hero screenshot, Hale kneels under a white flag with the banner "Hale SURRENDERED +$300".

## A complete round, observed in a headless play test

This is a real round from the verification run (round 1 of a 2-round test, 130 s scripted, zero page errors), not a scripted demo:

1. **Buy (12 s):** the buy menu opens, objective reads "ATTACK SITE B", you start with $800. The menu lists the DR-7 rifle ($2,700), P-9 sidearm ($500), Frag/Smoke/Flash grenades, and armor ($650). Bots buy too — their loadouts change with their economy.
2. **Play:** Rook carries the bomb toward site B. Vex spots Onyx holding the B lane and kills him ("Vex ✕ Onyx"). Rook and Vex push mid, trading fire with Mira and Hale.
3. **Signature moment:** you wound Hale to ≤25 HP — he surrenders (white flag, kneel, ring, "+$300", "Hale SURRENDERED +$300" banner). His nearby ally falls back.
4. **Elimination:** Rook headshots Mira ("Rook ✕ Mira (headshot)"), Vex headshots Hale ("Vex ✕ Hale (headshot)"). All three Sentinels are dead.
5. **Round end:** "VANGUARD WINS — Sentinels eliminated", score 1–0. Round-win money ($3,250) and loss bonus are paid.
6. **Next round:** a 12 s buy phase opens for round 2, then play resumes. Round 2 ended the same way ("Rook ✕ Onyx (headshot)", "Rook ✕ Mira", "Vex ✕ Hale"), score 2–0.

A round can also end by **plant** (3 s plant, 35 s bomb timer, big pulsing red timer in the HUD), **defuse** (5 s), or the **100 s timer** (defenders win on timeout). After death you spectate: cycle through living teammates with a key, watch the kill feed and round timeline.

## Feature → code

| Feature | Where it lives |
|---|---|
| Fixed-step 60 Hz simulation, apart from rendering | `game/src/sim.js` (step), `game/src/main.js` (render loop) |
| Map: 3 lanes, sites A (water tower) / B (warehouse), perches | `game/src/world.js`, `game/src/palette.js` (SITES) |
| Player: WASD, mouse-look, crouch, jump, recoil, spread | `game/src/player.js`, `game/src/weapon.js` |
| Bots: HOLD/ADVANCE/SEARCHING/ENGAGING/DEFUSING/FALLING BACK/REPOSITIONING state machine, role-based (defenders hold named angles, rotate after contact; attackers group, trade kills, plant when a site is clear) | `game/src/bot.js` |
| Surrender (player-only, ≤25 HP, $300, permanent, flag + kneel + ring, chain reaction) | `game/src/sim.js` (damage), `game/src/bot.js` (surrenderBot) |
| Bot labels (name + status, redrawn only on state change) | `game/src/bot.js` (label sprites) |
| Economy + buy menu (rifles, sidearm, grenades, armor, loss bonus) | `game/src/sim.js`, `game/src/hud.js` |
| Bomb: plant / defuse / timer / explosion | `game/src/sim.js` |
| Grenades: frag, smoke (blocks sight), flash (white-out) | `game/src/weapon.js`, `game/src/sim.js` |
| Viewmodel gun with kick + recovery, muzzle flash, hit flinch | `game/src/main.js`, `game/src/bot.js` (flinch) |
| Spectator mode, kill feed, round timeline | `game/src/sim.js`, `game/src/hud.js` |
| Synthesised WebAudio sounds (shots, hits, reload, plant/defuse, surrender) | `game/src/audio.js` |
| Dossier (GAME FLOW comment block at the top of main.ts) | `main.ts` |

## Run it

```sh
cd game && python3 -m http.server 8090
```

Then open http://localhost:8090 — click to play. `WASD` move, mouse aim, `Shift` sprint, `Ctrl`/`C` crouch, `Space` jump, `R` reload, `1`/`2` weapons, `3`/`4`/`5` grenades, `G` throw, `B` buy menu, `E` plant/defuse, `Tab` scoreboard.

---

<sub>Entered on [make.fun](https://make.fun/?ref=k9ejmyk6&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
