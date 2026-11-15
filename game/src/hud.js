// hud.js — DUSTLINE's heads-up display.
// One job: the DOM. It builds every HUD element, and sim.js calls its
// methods to show state. It keeps a cache of the last shown values so the
// per-step refresh() touches the DOM only when something changed.

export function createHud() {
  const root = document.getElementById('hud');
  const el = {};
  function div(id, cls, parent) {
    const d = document.createElement('div');
    d.id = id; if (cls) d.className = cls;
    (parent || root).appendChild(d);
    el[id] = d;
    return d;
  }

  // crosshair (centre dot + 4 ticks that spread with the weapon bloom)
  const ch = div('crosshair');
  ch.innerHTML = '<span class="dot"></span><span class="t up"></span><span class="t down"></span><span class="t left"></span><span class="t right"></span>';
  const hitm = div('hitmarker'); hitm.textContent = '✕';

  div('objective');
  div('timer');
  div('score');
  div('money');
  const hp = div('health'); hp.innerHTML = '<div class="bar"><div class="fill"></div></div><span class="num"></span>';
  const ammo = div('ammo'); ammo.innerHTML = '<span class="mag"></span><span class="res"></span>';
  div('weaponName');
  div('banner');
  const plant = div('plant'); plant.innerHTML = '<div class="bar"><div class="fill"></div></div><span>PLANTING…</span>';
  div('feed');
  div('timeline');
  div('spectate');
  const dmg = div('dmgFlash');
  const flash = div('whiteFlash');
  const moneyPop = div('moneyPop');
  const buy = div('buyMenu');
  buy.innerHTML = '<h2>BUY — press B to close</h2><div class="items"></div><div class="hint">Click an item or press its number. Money carries between rounds.</div>';
  const end = div('matchEnd');
  end.innerHTML = '<h1></h1><p class="sc"></p><p>Click to play again</p>';
  end.style.display = 'none';
  const menu = div('menu');
  menu.innerHTML = `
    <h1>DUSTLINE</h1>
    <p class="sub">A tactical round shooter — Vanguard attacks, Sentinels defend.</p>
    <div class="brief">
      <p><b>Objective:</b> plant the bomb at site <b>A (Water Tower)</b> or <b>B (Warehouse)</b>. First to 5 rounds wins.</p>
      <p><b>Move</b> WASD · <b>Look</b> mouse · <b>Fire</b> click · <b>Reload</b> R · <b>Crouch</b> Ctrl · <b>Jump</b> Space</p>
      <p><b>Buy</b> B · <b>Plant</b> hold E in a site · <b>Grenades</b> 3 frag, 4 smoke, 5 flash · <b>Spectate</b> Q after death</p>
      <p><b>SURRENDER:</b> wound an enemy bot to 25 HP or less and it drops its weapon, kneels and raises a white flag — +$300. It never fights again.</p>
    </div>
    <button id="playBtn">CLICK TO PLAY</button>`;
  menu.style.display = 'flex';

  let last = {};
  function setText(id, v) {
    if (last[id] !== v) { last[id] = v; el[id].textContent = v; }
  }

  let bannerTimer = null;
  function banner(text, seconds) {
    el.banner.textContent = text;
    el.banner.style.opacity = '1';
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.banner.style.opacity = '0'; }, (seconds || 2.5) * 1000);
  }

  return {
    el,
    setObjective(site, verb) {
      setText('objective', verb === 'Attack' ? 'ATTACK SITE ' + site : 'DEFEND SITE ' + site);
      el.objective.className = verb === 'Attack' ? 'attack' : 'defend';
    },
    setScore(v, s) { setText('score', 'VANGUARD ' + v + ' — ' + s + ' SENTINELS'); },
    setFeed(feed) {
      el.feed.innerHTML = feed.map(f => '<div>' + f.text + '</div>').join('');
    },
    setTimeline(tl) {
      el.timeline.innerHTML = tl.slice(-6).map(e => '<div><span>' + e.t.toFixed(0) + 's</span> ' + e.text + '</div>').join('');
    },
    banner,
    flashDamage() {
      el.dmgFlash.style.opacity = '0.55';
      setTimeout(() => { el.dmgFlash.style.opacity = '0'; }, 180);
    },
    flashWhite(strength) {
      el.whiteFlash.style.opacity = String(strength || 0.8);
      setTimeout(() => { el.whiteFlash.style.opacity = '0'; }, 600);
    },
    // floating "+$300" by the money display, so the surrender reward is
    // impossible to miss (it is the mechanic's tactical payoff)
    moneyPopup(text) {
      el.moneyPop.textContent = text;
      el.moneyPop.style.opacity = '1';
      el.moneyPop.style.transform = 'translateY(0)';
      setTimeout(() => {
        el.moneyPop.style.opacity = '0';
        el.moneyPop.style.transform = 'translateY(-14px)';
      }, 1800);
    },
    setPlantProgress(frac) {
      el.plant.style.display = frac > 0 ? 'block' : 'none';
      el.plant.querySelector('.fill').style.width = Math.round(frac * 100) + '%';
    },
    showSpectator(name) {
      el.spectate.textContent = name ? 'SPECTATING ' + name + '  (Q to cycle)' : '';
    },
    showMatchEnd(vWon, v, s) {
      el.matchEnd.querySelector('h1').textContent = vWon ? 'VANGUARD WINS THE MATCH' : 'SENTINELS WIN THE MATCH';
      el.matchEnd.querySelector('.sc').textContent = 'Vanguard ' + v + ' — ' + s + ' Sentinels';
      el.matchEnd.style.display = 'flex';
    },
    hideMatchEnd() { el.matchEnd.style.display = 'none'; },
    showMenu() { el.menu.style.display = 'flex'; },
    hideMenu() { el.menu.style.display = 'none'; },
    refreshBuy(money, playerEnt) {
      const items = [
        ['1', 'DR-7 Rifle', '$2700', 'rifle', playerEnt.hasRifle ? 'OWNED' : ''],
        ['2', 'P-9 Sidearm', '$500', 'sidearm', ''],
        ['3', 'Frag grenade', '$300', 'frag', '×' + playerEnt.grenades.frag],
        ['4', 'Smoke grenade', '$300', 'smoke', '×' + playerEnt.grenades.smoke],
        ['5', 'Flash grenade', '$200', 'flash', '×' + playerEnt.grenades.flash],
        ['6', 'Kevlar armor', '$650', 'armor', playerEnt.hasArmor ? 'OWNED' : ''],
      ];
      el.buyMenu.querySelector('.items').innerHTML = items.map(([k, name, price, id, owned]) =>
        '<button data-buy="' + id + '" class="' + (owned === 'OWNED' ? 'owned' : '') + '">' +
        '<b>' + k + '</b> ' + name + ' <span>' + price + '</span> <em>' + owned + '</em></button>'
      ).join('');
      el.buyMenu.querySelector('h2').textContent = 'BUY — $' + money + ' — press B to close';
    },
    showBuy() { el.buyMenu.style.display = 'block'; },
    hideBuy() { el.buyMenu.style.display = 'none'; },
    get buyVisible() { return el.buyMenu.style.display === 'block'; },
    // per-step refresh: only touches the DOM when a value changed
    refresh(state, playerEnt) {
      const bombPlanted = state.bomb.state === 'planted';
      const t = Math.max(0, Math.ceil(state.timer));
      // bomb timer is the single most important number once the bomb is
      // down: big, red, and pulsing, so the round status is unmistakable
      if (bombPlanted) {
        setText('timer', '💣 ' + state.bomb.timer.toFixed(0) + 's');
        el.timer.className = 'bomb';
      } else {
        setText('timer', state.phase === 'buy' ? 'BUY ' + t + 's' : t + 's');
        el.timer.className = '';
      }
      setText('money', '$' + state.money);
      const hp = Math.max(0, Math.round(playerEnt.hp));
      if (last.hp !== hp) {
        last.hp = hp;
        el.health.querySelector('.fill').style.width = hp + '%';
        el.health.querySelector('.fill').style.background = hp > 50 ? '#3f8f5f' : hp > 25 ? '#e0a030' : '#c0392b';
        el.health.querySelector('.num').textContent = hp;
      }
      const w = playerEnt.weapon;
      const ammoTxt = w.mag + ' / ' + w.reserve + (w.reloading ? '  …' : '');
      if (last.ammo !== ammoTxt) {
        last.ammo = ammoTxt;
        el.ammo.querySelector('.mag').textContent = w.mag;
        el.ammo.querySelector('.res').textContent = '/ ' + w.reserve + (w.reloading ? '  …' : '');
      }
      setText('weaponName', w.def.name + (playerEnt.hasArmor ? ' · ARMOR' : ''));
      // crosshair spread follows the weapon bloom
      const gap = 6 + w.bloom * 22;
      if (last.gap !== gap) {
        last.gap = gap;
        ch.style.setProperty('--gap', gap + 'px');
      }
      if (playerEnt.alive) el.hitmarker.style.opacity = '0';
    },
    hitmarker(head) {
      el.hitmarker.style.opacity = '1';
      el.hitmarker.style.color = head ? '#ff7a1a' : '#f5efe2';
      setTimeout(() => { el.hitmarker.style.opacity = '0'; }, 120);
    },
  };
}
