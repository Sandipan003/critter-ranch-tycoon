import { formatNum } from './world/textures.js';
import { UPGRADES, GAME_NAME, VERSION, NEWS, ADS, BAL } from './config.js';
import { Ads } from './ads.js';
import { WORLD, worldsUpTo, levelRange, worldById } from './world/worlds.js';
import { SPECIES } from './world/models.js';
import { DAILY } from './systems/progress.js';
import { PRIZES } from './systems/wheel.js';
import { Growth } from './growth.js';

const $ = (s) => document.querySelector(s);

// How a new feature works, shown the first time it appears (see UI.intro)
const INTROS = {
  snack: {
    icon: '🍦', title: 'Snack Stand is open!', lines: [
      ['🧍', 'Customers walk up to the stand and line up for ice cream'],
      ['💰', 'Every snack pays coins: they ride the belt to your 💰 pad'],
      ['⬆️', 'Snack Menu and Fast Service upgrades make it earn more'],
      ['▶', 'Snack Rush (right side): x3 snack coins for 2 minutes'],
    ],
  },
  clinic: {
    icon: '🏥', title: 'Doctor Deck is open!', lines: [
      ['🩹', 'Some wild critters are hurt now: you catch them in white capsules'],
      ['🩺', 'Carry them to the 🩺 pad: the doctor heals them on the beds'],
      ['💖', 'Healed critters pay x3 coins on the clinic\'s 💰 pad'],
      ['🧑', 'Pet owners bring their sick pets to the fence and pay a fee too'],
      ['⬆️', 'Doctor Skill and Clinic Fees upgrades · ▶ Heal all at once'],
    ],
  },
  vip: {
    icon: '🚚', title: 'A VIP truck is here!', lines: [
      ['📋', 'It wants the critters shown at the top of the screen'],
      ['📦', 'Sell critters on the belt as usual: the truck grabs the ones it wants'],
      ['⏱️', 'Fill the order before the timer runs out'],
      ['💰', `The VIP pays x${BAL.vipMul}, and x2 more with a video!`],
    ],
  },
};

function fmtTime(s) {
  s = Math.ceil(s);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

export class UI {
  constructor() {
    this.coinsShown = 0;
    this.coinsTarget = 0;
    this.toastTimer = 0;
    this.upgradesOpen = false;
    this.adTick = 0;
    this.waiting = []; // popups queued behind the one on screen
  }

  bind(game) {
    this.game = game;
    const press = (el, fn) => el.addEventListener('click', (e) => { e.stopPropagation(); game.audio.click(); fn(); });
    press($('#btn-free'), () => game.rewardFor('free'));
    press($('#btn-income'), () => { if (game.boosts.income <= 0) game.rewardFor('income'); });
    press($('#btn-golden'), () => { if (game.boosts.golden <= 0) game.rewardFor('golden'); });
    press($('#btn-snack'), () => { if (game.boosts.snack <= 0) game.rewardFor('snack'); });
    press($('#btn-heal'), () => { if (game.clinic?.patients) game.rewardFor('heal'); });
    press($('#btn-settings'), () => this.openSettings());
    press($('#world-badge'), () => this.openWorldMap());
    press($('#profile'), () => this.openSettings());
    press($('#btn-missions'), () => this.openMissions());
    press($('#btn-daily'), () => this.openDaily());
    press($('#btn-dex'), () => this.openDex());
    press($('#btn-wheel'), () => this.openWheel());
    press($('#btn-share'), () => this.openInvite());
    $('#tip').addEventListener('click', (e) => { e.stopPropagation(); this.hideTip(); });
    this.setProfile(game.state.profile);
    $('#world-badge').textContent = `${WORLD.icon} ${WORLD.name}`;
    // HUD buttons shouldn't start the joystick
    document.querySelectorAll('.hud-btn, .modal, #pause').forEach((el) => el.addEventListener('pointerdown', (e) => e.stopPropagation()));
  }

  // ── pause screen ─────────────────────────────────────────
  // `onExit` adds an "Exit game" button (Android back button)
  showPause(onResume, onExit = null) {
    const el = $('#pause');
    el.classList.add('show');
    $('#btn-exit').classList.toggle('show', !!onExit);
    $('#btn-resume').onclick = () => { this.hidePause(); this.game.audio.unlock(); this.game.audio.click(); onResume(); };
    $('#btn-exit').onclick = () => onExit && onExit();
    this.onPauseResume = onResume;
  }

  get pauseShown() { return $('#pause').classList.contains('show'); }
  hidePause() { $('#pause').classList.remove('show'); }
  // back button on the pause screen = Continue
  resumeFromPause() { if (this.pauseShown) $('#btn-resume').click(); }

  // ── title ────────────────────────────────────────────────
  title(onPlay) {
    const t = $('#title');
    $('#title-name').textContent = GAME_NAME;
    t.classList.add('show');
    $('#btn-play').onclick = () => {
      t.classList.remove('show');
      t.classList.add('hide');
      setTimeout(() => t.remove(), 600);
      onPlay();
    };
  }

  skipTitle() { $('#title')?.remove(); }

  setProfile(p) {
    $('#avatar-ico').textContent = p.avatar;
    $('#pname').textContent = p.name;
  }

  // ── worlds ───────────────────────────────────────────────
  openWorldMap() {
    const g = this.game;
    const s = g.state;
    // every world reached so far plus the next locked one; the list never ends
    const cards = worldsUpTo(Math.max(3, s.maxWorld + 1)).map((w) => {
      const here = w.id === WORLD.id;
      const open = w.id <= s.maxWorld;
      const prev = worldById(w.id - 1);
      const status = here ? '<div class="w-here">You are here</div>'
        : open ? `<button class="btn go" data-world="${w.id}">✈️ Travel</button>`
          : `<div class="w-lock">🔒 Unlock 🗺️ ${w.name}<br>in ${prev.icon} ${prev.name}</div>`;
      const coins = here ? s.coins : s.worlds[w.id]?.coins;
      const wallet = open && coins !== undefined ? ` · <span class="coin-ico sm"></span>${formatNum(coins)}` : '';
      return `<div class="world-card ${w.theme}${open ? '' : ' locked'}">
        <div class="w-ico">${open ? w.icon : '❔'}</div>
        <div class="w-info"><div class="w-name">${w.name}</div><div class="w-sub">Critters ${levelRange(w)} · rewards x${formatNum(w.valueMul)}${wallet}</div></div>
        ${status}</div>`;
    }).join('');
    const w = this.modal(`<div class="modal-head"><span>🗺️ World map</span><button class="x">✕</button></div>
      <div class="world-list">${cards}</div>
      ${s.crown ? '<div class="w-crown">👑 Golden Ranch: all income x2</div>' : '<div class="w-tip">Each world is its own ranch: its coins, pens, pastures, helpers and upgrades stay there and wait for you. Your ranch level travels with you.</div>'}`, 'worlds');
    w.querySelector('.x').onclick = () => this.closeModal();
    w.querySelectorAll('[data-world]').forEach((b) => b.onclick = () => { g.audio.click(); this.closeModal(); g.travel(+b.dataset.world); });
  }

  // a world's travel tile was bought
  worldUnlocked(world) {
    const g = this.game;
    const w = this.modal(`<div class="modal-head center"><span>New world unlocked!</span></div>
      <div class="w-big">${world.icon}</div>
      <div class="w-title">${world.name}</div>
      <div class="off-txt">Build a brand-new ranch from scratch: tougher critters ${levelRange(world)}, new pens and much bigger rewards.<br>This ranch and its coins stay here; come back any time from the World map.</div>
      <button class="btn wide big" id="w-go">✈️ Travel now</button>
      <button class="btn wide plain" id="w-later">Later</button>`, 'world-new');
    w.querySelector('#w-go').onclick = () => { g.audio.click(); this.closeModal(); g.travel(world.id); };
    w.querySelector('#w-later').onclick = () => { this.closeModal(); setTimeout(() => Growth.maybeReview(g), 800); };
  }

  crowned() {
    const w = this.modal(`<div class="modal-head center"><span>You did it!</span></div>
      <div class="w-big">👑</div>
      <div class="w-title">Golden Ranch</div>
      <div class="off-txt">Every world is complete. All income is now doubled, in every world, for good.</div>
      <button class="btn wide big" id="w-ok">Awesome!</button>`, 'world-new');
    w.querySelector('#w-ok').onclick = () => { this.closeModal(); setTimeout(() => Growth.maybeReview(this.game), 800); };
  }

  travelling(world) {
    const el = document.createElement('div');
    el.className = 'travel-screen';
    el.innerHTML = `<div class="t-ico">${world.icon}</div><div class="t-name">${world.name}</div><div class="t-sub">Travelling…</div>`;
    document.body.appendChild(el);
  }

  arrived(world) {
    this.celebrate(`${world.icon} ${world.name}`);
    setTimeout(() => this.toast(`New critters ${levelRange(world)} to catch!`), 1200);
  }

  // ── HUD values ───────────────────────────────────────────
  setCoins(n, instant = false) {
    this.coinsTarget = n;
    if (instant) {
      this.coinsShown = n;
      $('#coins').textContent = formatNum(n);
    }
    if (n > this.coinsShown) {
      const pill = $('#coin-pill');
      pill.classList.remove('bump');
      void pill.offsetWidth;
      pill.classList.add('bump');
    }
  }

  setLevel(level, pct) {
    $('#lvl').textContent = level;
    $('#xp-fill').style.width = `${Math.min(100, pct * 100)}%`;
  }

  hint(text) {
    const el = $('#hint');
    if (!text) { el.classList.remove('show'); return; }
    if (el.textContent !== text) el.textContent = text;
    el.classList.add('show');
  }

  toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    this.toastTimer = 2.6;
  }

  celebrate(text) {
    const el = document.createElement('div');
    el.className = 'celebrate';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  tick(dt) {
    const g = this.game;
    // animated coin counter
    if (this.coinsShown !== this.coinsTarget) {
      const d = this.coinsTarget - this.coinsShown;
      const step = Math.sign(d) * Math.max(1, Math.abs(d) * Math.min(1, dt * 10));
      this.coinsShown = Math.abs(step) >= Math.abs(d) ? this.coinsTarget : this.coinsShown + step;
      $('#coins').textContent = formatNum(this.coinsShown);
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) $('#toast').classList.remove('show');
    }
    if (this.tipTimer > 0) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) this.hideTip();
    }
    this.adTick -= dt;
    if (this.adTick > 0) return;
    this.adTick = 0.25;
    // rewarded buttons
    const free = $('#btn-free'), inc = $('#btn-income'), gold = $('#btn-golden');
    // keep ad perks out of the way until the player has learned the basic loop
    // only offer a video when one is actually loaded (cooldowns still show their timers)
    const avail = Ads.canRequest && g.state.tutorialDone && (g.state.stats.sold > 0 || g.state.stats.unlocks > 0);
    const ready = Ads.rewardedLoaded;
    const fcd = g.cooldownLeft('free');
    free.classList.toggle('cool', fcd > 0);
    free.style.display = avail && (ready || fcd > 0) ? 'flex' : 'none';
    $('#free-amt').textContent = fcd > 0 ? fmtTime(fcd) : `+${formatNum(g.freeCoinsAmount())}`;
    const icd = g.cooldownLeft('income');
    inc.style.display = avail && (ready || icd > 0 || g.boosts.income > 0) ? 'flex' : 'none';
    inc.classList.toggle('active', g.boosts.income > 0);
    inc.classList.toggle('cool', g.boosts.income <= 0 && icd > 0);
    $('#income-txt').textContent = g.boosts.income > 0 ? fmtTime(g.boosts.income) : icd > 0 ? fmtTime(icd) : 'x2 Coins';
    const gcd = g.cooldownLeft('golden');
    gold.style.display = avail && (ready || gcd > 0 || g.boosts.golden > 0) ? 'flex' : 'none';
    gold.classList.toggle('active', g.boosts.golden > 0);
    gold.classList.toggle('cool', g.boosts.golden <= 0 && gcd > 0);
    $('#golden-txt').textContent = g.boosts.golden > 0 ? fmtTime(g.boosts.golden) : gcd > 0 ? fmtTime(gcd) : '100% Catch';
    // Snack Rush once the stand is built; Heal all while three or more critters wait at the clinic
    const snack = $('#btn-snack'), heal = $('#btn-heal');
    const scd = g.cooldownLeft('snack');
    snack.style.display = avail && g.snack && (ready || scd > 0 || g.boosts.snack > 0) ? 'flex' : 'none';
    snack.classList.toggle('active', g.boosts.snack > 0);
    snack.classList.toggle('cool', g.boosts.snack <= 0 && scd > 0);
    $('#snack-txt').textContent = g.boosts.snack > 0 ? fmtTime(g.boosts.snack) : scd > 0 ? fmtTime(scd) : 'x3 Snacks';
    const sick = g.clinic ? g.clinic.patients : 0;
    heal.style.display = avail && ready && sick >= 3 && g.cooldownLeft('heal') <= 0 ? 'flex' : 'none';
    $('#heal-txt').textContent = `Heal ${sick}`;
    if (this.upgradesOpen) this.renderUpgrades();
    if (this.clinicOpen) this.renderClinic();
    // missions / daily / Critterdex buttons appear once the first critter is sold
    $('#left-btns').classList.toggle('show', !!g.state.tutorialDone);
    const missionsReady = g.progress.ready();
    const mb = $('#mission-badge');
    mb.textContent = missionsReady;
    mb.classList.toggle('show', missionsReady > 0);
    $('#daily-badge').classList.toggle('show', g.progress.daily().available);
    $('#wheel-badge').classList.toggle('show', g.wheel.freeReady());
    $('#share-badge').classList.toggle('show', g.shareReady());
    const chip = g.events.chip();
    const ce = $('#event-chip');
    ce.classList.toggle('show', !!chip);
    if (chip) {
      if (ce.textContent !== chip.text) ce.textContent = chip.text;
      ce.classList.toggle('boss', chip.boss);
    }
    // the VIP order sits under the event chip, or in its place
    const vip = g.vip.chip();
    const ve = $('#vip-chip');
    ve.classList.toggle('show', !!vip);
    ve.classList.toggle('solo', !chip);
    ve.classList.toggle('hurry', g.vip.state === 'open' && g.vip.left < 30);
    if (vip && ve.textContent !== vip) ve.textContent = vip;
  }

  // ── modals ───────────────────────────────────────────────
  modal(html, cls = '', passive = false) {
    this.clearModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap' + (passive ? ' passive' : '');
    wrap.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    wrap.querySelector('.modal').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('#modal-root').appendChild(wrap);
    if (!passive) {
      this.game.input.enabled = false;
      this.game.input.reset();
    }
    return wrap;
  }

  clearModal() {
    $('#modal-root').innerHTML = '';
    this.upgradesOpen = false;
    this.clinicOpen = false;
    this.backAction = null;
    if (this.game) {
      this.game.input.enabled = true;
      this.game.setPause('popup', false);
    }
  }

  // Android back button on a popup: its default answer (collect a reward), otherwise just close it
  back() {
    const f = this.backAction;
    if (f) f();
    else this.closeModal();
  }

  closeModal() {
    this.clearModal();
    const next = this.waiting.shift();
    if (next) setTimeout(() => this.later(next), 300);
  }

  // one popup at a time: a popup that arrives while another is open waits for it to close
  later(fn) {
    if (document.querySelector('#modal-root .modal-wrap:not(.passive)')) this.waiting.push(fn);
    else fn();
  }

  openUpgrades() {
    const w = this.modal(`<div class="modal-head"><span>⬆️ Upgrades</span><button class="x">✕</button></div><div class="up-list"></div>`, 'upgrades', true);
    w.querySelector('.x').onclick = () => this.closeModal();
    this.upgradesOpen = true;
    this.renderUpgrades(true);
  }

  closeUpgrades() { if (this.upgradesOpen) this.closeModal(); }

  renderUpgrades(force = false) {
    const g = this.game;
    const list = document.querySelector('.up-list');
    if (!list) return;
    const sig = JSON.stringify([g.state.coins >= 0 ? Math.floor(g.state.coins) : 0, g.state.upgrades, UPGRADES.map((u) => Math.ceil(g.cooldownLeft('up_' + u.id)))]);
    if (!force && sig === this.upSig) return;
    this.upSig = sig;
    // what the Snack Stand and the Doctor Deck will bring, before they are built
    const soon = UPGRADES.filter((u) => u.teaser && !g.isUnlocked(u.requires)).map((u) => `<div class="up-card locked">
        <div class="up-ico">${u.icon}</div>
        <div class="up-info"><div class="up-name">${u.name}</div><div class="up-desc">${u.desc}</div></div>
        <div class="up-lock">🔒 Build the<br>${u.teaser}</div></div>`).join('');
    list.innerHTML = UPGRADES.filter((u) => !u.requires || g.isUnlocked(u.requires)).map((u) => {
      const lv = g.state.upgrades[u.id];
      const maxed = lv >= u.max;
      const cost = g.upgradeCost(u);
      const cd = g.cooldownLeft('up_' + u.id);
      return `<div class="up-card">
        <div class="up-ico">${u.icon}</div>
        <div class="up-info"><div class="up-name">${u.name} <span class="up-lv">Lv.${lv + 1}</span></div><div class="up-desc">${u.desc}</div>
        <div class="up-bar"><div style="width:${u.max === Infinity ? (lv % 10) * 10 : (lv / u.max) * 100}%"></div></div></div>
        <div class="up-btns">
          ${maxed ? '<div class="up-max">MAX</div>' : `
          <button class="btn buy" data-id="${u.id}" ${g.state.coins < cost ? 'disabled' : ''}><span class="coin-ico sm"></span>${formatNum(cost)}</button>
          <button class="btn ad" data-ad="${u.id}" ${cd > 0 || !Ads.canRequest ? 'disabled' : ''}>${cd > 0 ? fmtTime(cd) : '▶ FREE'}</button>`}
        </div></div>`;
    }).join('') + soon;
    list.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { g.audio.click(); g.buyUpgrade(b.dataset.id); this.renderUpgrades(true); });
    list.querySelectorAll('[data-ad]').forEach((b) => b.onclick = async () => { g.audio.click(); await g.rewardFor('upgrade', b.dataset.ad); this.renderUpgrades(true); });
  }

  openSettings() {
    const g = this.game;
    const AVATARS = ['👩‍🦰', '🧑‍🌾', '🤠', '👩', '🧔', '👧', '👦', '🧙', '🦸', '🥷'];
    const p = g.state.profile, s = g.state.settings, st = g.state.stats;
    const running = `${s.quality === 'auto' ? 'Auto chose' : 'Running'} ${g.low ? 'Low' : 'High'}`;
    const w = this.modal(`<div class="modal-head"><span>⚙️ Settings</span><button class="x" aria-label="Close">✕</button></div>
      <div class="set-profile">
        <div class="avatar"><span id="set-av">${p.avatar}</span></div>
        <label class="set-name"><span>Rancher name</span>
          <input id="set-name" maxlength="14" value="${p.name.replace(/[<>&"]/g, '')}" autocomplete="off" spellcheck="false" enterkeyhint="done"></label>
      </div>
      <div class="avatar-pick" role="group" aria-label="Avatar">${AVATARS.map((a) => `<button data-av="${a}" class="${a === p.avatar ? 'on' : ''}" aria-pressed="${a === p.avatar}">${a}</button>`).join('')}</div>
      <div class="set-group">
        <div class="set-row stack">
          <div class="set-line"><span class="set-ico">🎨</span><span class="set-label">Graphics</span><span class="set-note" id="set-q-note">${running}</span></div>
          <div class="seg" role="radiogroup" aria-label="Graphics">${['auto', 'high', 'low'].map((q) => `<label><input type="radio" name="set-q" value="${q}" ${s.quality === q ? 'checked' : ''}><span>${{ auto: 'Auto', high: 'High', low: 'Low · smooth' }[q]}</span></label>`).join('')}</div>
        </div>
        <label class="set-row"><span class="set-ico">🔊</span><span class="set-label">Sound</span><input type="checkbox" role="switch" class="switch" id="set-sound" ${s.sound ? 'checked' : ''}></label>
        <label class="set-row"><span class="set-ico">📳</span><span class="set-label">Vibration</span><input type="checkbox" role="switch" class="switch" id="set-haptic" ${s.haptics ? 'checked' : ''}></label>
      </div>
      <div class="set-links">
        <button class="set-link" id="set-worlds"><b>🗺️</b>World map</button>
        <button class="set-link" id="set-how"><b>❓</b>How to play</button>
        <button class="set-link" id="set-news"><b>🎉</b>What's new</button>
      </div>
      <div class="set-stats"><b>${formatNum(st.caught)}</b> caught · <b>${formatNum(st.sold)}</b> sold · <b>${formatNum(st.earned)}</b> coins earned</div>
      <div class="set-foot">
        <button class="set-text" id="set-rate">⭐ Rate the game</button>
        ${Ads.privacyRequired ? '<button class="set-text" id="set-privacy">🔒 Privacy options</button>' : ''}
        <button class="set-text danger" id="set-reset">Reset progress</button>
      </div>
      <div class="ver">${GAME_NAME} v${VERSION}${ADS.testMode ? ' · test ads' : ''}</div>
      ${ADS.testMode ? `<div class="ver">Ads: video ${Ads.rewardedLoaded ? 'ready' : 'loading'} · banner ${Ads.bannerStatus}</div>` : ''}`, 'settings');
    w.querySelector('.x').onclick = () => this.closeModal();
    w.querySelector('#set-sound').onchange = (e) => { s.sound = e.target.checked; g.audio.enabled = e.target.checked; g.audio.click(); g.save(); };
    w.querySelector('#set-haptic').onchange = (e) => { s.haptics = e.target.checked; g.save(); g.haptic(); };
    w.querySelector('#set-privacy')?.addEventListener('click', () => Ads.showPrivacyOptions());
    w.querySelector('#set-rate').onclick = () => { g.audio.click(); Growth.openStore(); };
    w.querySelector('#set-worlds').onclick = () => { g.audio.click(); this.openWorldMap(); };
    w.querySelector('#set-how').onclick = () => { g.audio.click(); this.howToPlay(false); };
    w.querySelector('#set-news').onclick = () => { g.audio.click(); this.whatsNew(); };
    const name = w.querySelector('#set-name');
    name.addEventListener('keydown', (e) => e.stopPropagation()); // WASD shouldn't move the player while typing
    name.addEventListener('change', () => {
      const v = name.value.replace(/[<>&"]/g, '').trim().slice(0, 14);
      p.name = v || 'Rancher';
      name.value = p.name;
      this.setProfile(p);
      g.save();
    });
    w.querySelectorAll('[data-av]').forEach((b) => b.onclick = () => {
      g.audio.click();
      p.avatar = b.dataset.av;
      w.querySelector('#set-av').textContent = p.avatar;
      w.querySelectorAll('[data-av]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      this.setProfile(p);
      g.save();
    });
    w.querySelectorAll('input[name="set-q"]').forEach((r) => r.onchange = () => {
      g.audio.click();
      s.quality = r.value;
      g.save();
      w.querySelector('#set-q-note').textContent = 'Changes next time you open the game';
    });
    w.querySelector('#set-reset').onclick = () => this.confirmReset();
  }

  // In-game confirmation: window.confirm() is silently blocked (returns false) in some WebViews and browsers
  confirmReset() {
    const g = this.game;
    const w = this.modal(`<div class="modal-head center"><span>Reset progress?</span></div>
      <div class="off-ico">⚠️</div>
      <div class="off-txt">This erases every world, coin, unlock, upgrade and your ranch level. It can't be undone.</div>
      <button class="btn wide erase" id="reset-yes">Erase everything</button>
      <button class="btn wide plain" id="reset-no">Cancel</button>`, 'confirm');
    w.querySelector('#reset-no').onclick = () => this.openSettings();
    w.querySelector('#reset-yes').onclick = () => g.resetProgress();
  }

  offline(amount, sec) { this.later(() => this.offlineNow(amount, sec)); }

  offlineNow(amount, sec) {
    const g = this.game;
    const w = this.modal(`<div class="modal-head center"><span>Welcome back!</span></div>
      <div class="off-ico">🐧💤</div>
      <div class="off-txt">Your ranch earned while you were away (${fmtTime(sec)})</div>
      <div class="off-amt"><span class="coin-ico"></span>${formatNum(amount)}</div>
      <button class="btn wide ad big" id="off-ad">▶ Collect x3 <span class="coin-ico sm"></span>${formatNum(amount * 3)}</button>
      <button class="btn wide plain" id="off-take">Collect</button>`, 'offline');
    // the ranch stands still until the coins are collected (released in clearModal)
    g.setPause('popup', true);
    const take = () => { g.earn(amount); g.coinBurstToHud(amount); this.closeModal(); };
    this.backAction = take;
    w.querySelector('#off-take').onclick = take;
    w.querySelector('#off-ad').onclick = async () => {
      const ok = await g.rewardFor('offline', amount * 3);
      if (ok) { g.coinBurstToHud(amount * 3); this.closeModal(); }
    };
  }

  // ── Doctor Deck ──────────────────────────────────────────
  // a panel at the bottom (the player can still move) while standing on the clinic's 🩺 pad
  openClinic() {
    const w = this.modal(`<div class="modal-head"><span>🏥 Critter Clinic</span><button class="x">✕</button></div>
      <div class="cl-body"></div>`, 'clinic', true);
    w.querySelector('.x').onclick = () => this.closeModal();
    this.clinicOpen = true;
    this.renderClinic(true);
  }

  closeClinic() { if (this.clinicOpen) this.closeModal(); }

  renderClinic(force = false) {
    const g = this.game, c = g.clinic;
    const body = document.querySelector('.cl-body');
    if (!body || !c) return;
    const hurt = g.player.stack.items.filter((it) => it.hurt).length;
    const cd = g.cooldownLeft('heal');
    const sig = [c.queue.length + c.incoming, c.treating, hurt, c.healTime(), c.feeMul(), c.owners.length, Ads.canRequest, Math.ceil(cd)].join();
    if (!force && sig === this.clSig) return;
    this.clSig = sig;
    const note = hurt ? `Handing over ${hurt} hurt critter${hurt > 1 ? 's' : ''}…`
      : c.full ? 'The waiting room is full: heal them all now!'
        : `Bring hurt critters 🩹 (white capsules). Healed ones pay x${+c.feeMul().toFixed(2)}!${c.owners.length ? ' 🧑 Pet owners are waiting at the fence.' : ''}`;
    body.innerHTML = `<div class="cl-stats">
        <div><b>🤕 ${c.queue.length + c.incoming}/${BAL.clinicWaiting}</b>waiting</div>
        <div><b>🛏️ ${c.treating}/${c.beds.length}</b>in bed</div>
        <div><b>⏱️ ${c.healTime().toFixed(1)}s</b>per critter</div></div>
      <div class="cl-txt">${note}</div>
      ${c.patients ? `<button class="btn wide ad" id="cl-heal" ${cd > 0 || !Ads.canRequest ? 'disabled' : ''}>${cd > 0 ? fmtTime(cd) : `▶ Heal all ${c.patients} now`}</button>` : ''}`;
    body.querySelector('#cl-heal')?.addEventListener('click', async () => {
      g.audio.click();
      await g.rewardFor('heal');
      this.renderClinic(true);
    });
  }

  // ── VIP truck ────────────────────────────────────────────
  vipDone(amount, order) { this.later(() => this.vipDoneNow(amount, order)); }

  vipDoneNow(amount, order) {
    const g = this.game;
    const w = this.modal(`<div class="modal-head center"><span>🚚 VIP order filled!</span></div>
      <div class="off-ico">🤩</div>
      <div class="off-txt">${order.map((l) => `${SPECIES[l.sp].emoji} x${l.n}`).join(' · ')} delivered. The VIP pays x${BAL.vipMul}!</div>
      <div class="off-amt"><span class="coin-ico"></span>${formatNum(amount)}</div>
      <button class="btn wide ad big" id="vip-ad" ${Ads.canRequest ? '' : 'disabled'}>▶ Collect x2 <span class="coin-ico sm"></span>${formatNum(amount * 2)}</button>
      <button class="btn wide plain" id="vip-take">Collect</button>`, 'offline');
    g.setPause('popup', true);
    // a happy break in play: Play's rating card may follow (Growth decides, Play has the last word)
    const done = () => { this.closeModal(); setTimeout(() => Growth.maybeReview(g), 1200); };
    const take = () => { g.earn(amount); g.coinBurstToHud(amount); g.audio.unlockFx(); done(); };
    this.backAction = take;
    w.querySelector('#vip-take').onclick = take;
    w.querySelector('#vip-ad').onclick = async () => { if (await g.rewardFor('vip', amount * 2)) done(); };
  }

  // ── invite friends ───────────────────────────────────────
  openInvite() {
    const g = this.game;
    const reward = g.shareReady();
    const w = this.modal(`<div class="modal-head"><span>📣 Invite friends</span><button class="x" aria-label="Close">✕</button></div>
      <div class="w-big">🐾</div>
      <div class="off-txt">Ranching is more fun with friends! Share Critter Ranch Tycoon on WhatsApp, Instagram or anywhere you like.</div>
      <button class="btn wide big" id="inv-go">📣 Share now${reward ? ` <span class="coin-ico sm"></span>+${formatNum(g.freeCoinsAmount())}` : ''}</button>
      <div class="m-foot">${reward ? 'Your first share each day pays coins.' : 'Today\'s share bonus is collected: come back tomorrow for more!'}</div>`, 'invite');
    w.querySelector('.x').onclick = () => this.closeModal();
    w.querySelector('#inv-go').onclick = async () => {
      g.audio.click();
      if (await g.invite()) this.closeModal();
    };
  }

  // ── Lucky Wheel ──────────────────────────────────────────
  openWheel() {
    const g = this.game, W = g.wheel;
    const n = PRIZES.length, step = 360 / n;
    const segs = PRIZES.map((p, i) => {
      const txt = p.label || `+${formatNum(W.coins(p))}`;
      return `<div class="wseg${p.jackpot ? ' jack' : ''}" style="transform:rotate(${i * step + step / 2}deg)"><span>${p.icon}<br>${txt}</span></div>`;
    }).join('');
    const w = this.modal(`<div class="modal-head"><span>🎡 Lucky Wheel</span><button class="x">✕</button></div>
      <div class="wheel-box"><div class="wheel" id="wheel">${segs}</div><div class="wheel-hub">⭐</div><div class="wheel-ptr"></div></div>
      <div class="wheel-res" id="wheel-res">Spin to win coins and boosts!</div>
      <div id="wheel-btns"></div>
      <div class="m-foot">A free spin every ${BAL.wheelFreeHours} hours, and up to ${BAL.wheelAdSpins} more a day with a video</div>`, 'wheel-modal');
    const wheel = w.querySelector('#wheel'), res = w.querySelector('#wheel-res');
    let rot = 0, spinning = false;
    w.querySelector('.x').onclick = () => { if (!spinning) this.closeModal(); };
    const spin = (free) => {
      spinning = true;
      w.querySelectorAll('#wheel-btns button').forEach((b) => { b.disabled = true; });
      res.textContent = 'Good luck!';
      const i = W.spin(free);
      const center = i * step + step / 2;
      // land segment i under the pointer at the top, after five full turns
      rot += 360 * 5 + ((((-center - rot) % 360) + 360) % 360) + (Math.random() - 0.5) * (step - 12);
      wheel.style.transform = `rotate(${rot}deg)`;
      for (let k = 0; k < 14; k++) setTimeout(() => g.audio.click(), 120 + k * k * 18);
      setTimeout(() => {
        spinning = false;
        if (!w.isConnected) { W.award(i); return; }
        res.textContent = W.award(i);
        res.classList.add('win');
        if (PRIZES[i].jackpot) this.celebrate('👑 JACKPOT!');
        render();
      }, 4300);
    };
    const render = () => {
      const left = W.adsLeft(), wait = W.freeIn();
      const box = w.querySelector('#wheel-btns');
      box.innerHTML = W.freeReady() ? '<button class="btn wide big" id="wh-free">🎡 Spin FREE!</button>'
        : `<button class="btn wide ad big" id="wh-ad" ${left > 0 && Ads.canRequest ? '' : 'disabled'}>${left > 0 ? `▶ Spin again (${left} left today)` : 'No more spins today'}</button>
          <div class="m-foot">Free spin in ${Math.floor(wait / 3600)}h ${Math.floor((wait % 3600) / 60)}m</div>`;
      box.querySelector('#wh-free')?.addEventListener('click', () => { g.audio.click(); spin(true); });
      box.querySelector('#wh-ad')?.addEventListener('click', async () => {
        g.audio.click();
        if (await g.rewardFor('wheel')) spin(false);
      });
    };
    render();
  }

  // ── missions ─────────────────────────────────────────────
  openMissions() {
    const g = this.game, P = g.progress;
    const cards = g.state.missions.map((m, i) => {
      const done = m.have >= m.n;
      const reward = `<span class="coin-ico sm"></span>${formatNum(P.reward(m))}`;
      return `<div class="m-card ${done ? 'done' : ''}">
        <div class="m-ico">${P.icon(m)}</div>
        <div class="m-info"><div class="m-name">${P.text(m)}</div><div class="m-reward">Reward ${reward}</div>
          <div class="m-bar"><div style="width:${(m.have / m.n) * 100}%"></div></div></div>
        ${done ? `<div class="m-btns"><button class="btn" data-claim="${i}">Claim</button>
          <button class="btn ad" data-claim2="${i}" ${Ads.canRequest ? '' : 'disabled'}>▶ x2</button></div>`
          : `<div class="m-prog">${m.have}/${m.n}</div>`}
      </div>`;
    }).join('');
    const w = this.modal(`<div class="modal-head"><span>📜 Missions</span><button class="x">✕</button></div>
      <div class="m-list">${cards}</div>
      <div class="m-foot">Missions completed: ${g.state.missionsDone || 0} · each new mission is a little harder and pays more</div>`, 'missions');
    w.querySelector('.x').onclick = () => this.closeModal();
    w.querySelectorAll('[data-claim]').forEach((b) => b.onclick = () => {
      g.audio.click();
      const amt = P.claim(+b.dataset.claim);
      if (amt) { g.coinBurstToHud(amt); g.audio.unlockFx(); }
      this.openMissions();
    });
    w.querySelectorAll('[data-claim2]').forEach((b) => b.onclick = async () => {
      g.audio.click();
      await g.rewardFor('mission', +b.dataset.claim2);
      if (document.querySelector('.modal.missions')) this.openMissions();
    });
  }

  // ── daily reward ─────────────────────────────────────────
  openDaily() {
    const g = this.game, P = g.progress;
    const { available, day } = P.daily();
    const tiles = DAILY.map((_, i) => {
      const d = i + 1;
      const got = available ? d < day : d <= day;
      const today = available && d === day;
      return `<div class="d-day ${got ? 'got' : ''} ${today ? 'today' : ''} ${d === 7 ? 'big' : ''}">
        <div class="d-n">Day ${d}</div><div class="d-ico">${d === 7 ? '💰' : '<span class="coin-ico"></span>'}</div>
        <div class="d-amt">${formatNum(P.dailyAmount(d))}</div></div>`;
    }).join('');
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    const wait = Math.max(0, (tomorrow - Date.now()) / 1000);
    const w = this.modal(`<div class="modal-head"><span>📅 Daily reward</span><button class="x">✕</button></div>
      <div class="d-grid">${tiles}</div>
      ${available ? `<button class="btn wide big" id="d-claim">Claim Day ${day}</button>
        <button class="btn wide ad big" id="d-claim2" ${Ads.canRequest ? '' : 'disabled'}>▶ Claim x2 <span class="coin-ico sm"></span>${formatNum(P.dailyAmount(day) * 2)}</button>`
        : `<div class="m-foot">Come back in ${Math.floor(wait / 3600)}h ${Math.floor((wait % 3600) / 60)}m for Day ${(day % 7) + 1}!</div>`}
      <div class="m-foot">Come back every day: miss a day and the streak starts again from Day 1.</div>`, 'daily');
    g.setPause('popup', true); // nothing runs on behind a reward popup
    w.querySelector('.x').onclick = () => this.closeModal();
    w.querySelector('#d-claim')?.addEventListener('click', () => {
      g.audio.click();
      const amt = P.claimDaily();
      if (amt) { g.coinBurstToHud(amt); g.audio.unlockFx(); this.celebrate(`📅 Day ${day}: +${formatNum(amt)}`); }
      this.closeModal();
    });
    w.querySelector('#d-claim2')?.addEventListener('click', async () => {
      g.audio.click();
      if (await g.rewardFor('daily')) { this.celebrate(`📅 Day ${day}: x2!`); this.closeModal(); }
    });
  }

  // ── Critterdex ───────────────────────────────────────────
  openDex() {
    const g = this.game, P = g.progress;
    const dex = g.state.dex;
    const { total, found, golden } = P.dexCounts();
    const cards = Object.entries(SPECIES).map(([id, sp]) => {
      const e = dex[id];
      const home = worldById(sp.world || 1);
      if (!e?.n) return `<div class="dex-card unknown"><div class="dx-ico">${sp.emoji}</div><div class="dx-name">???</div><div class="dx-n">${home.icon} ${home.name.split(' ')[0]}</div></div>`;
      return `<div class="dex-card ${e.g ? 'gold' : ''}">${e.g ? '<div class="dx-star">★</div>' : ''}<div class="dx-ico">${sp.emoji}</div>
        <div class="dx-name">${sp.name}</div><div class="dx-n">x${formatNum(e.n)}</div></div>`;
    }).join('');
    const w = this.modal(`<div class="modal-head"><span>📖 Critterdex</span><button class="x">✕</button></div>
      <div class="dex-sum">Found ${found}/${total} · Golden ${golden}/${total} · <span>Coins +${Math.round(P.dexBonus * 100)}%</span></div>
      <div class="dex-grid">${cards}</div>
      <div class="m-foot">Every new critter adds +2% to all coins forever, its golden version +1% more. Travel to new worlds to find them all!</div>`, 'dex');
    w.querySelector('.x').onclick = () => this.closeModal();
  }

  // ── first-time guide ─────────────────────────────────────
  welcome(onGo) {
    const w = this.modal(`<div class="modal-head center"><span>Welcome to your ranch!</span></div>
      <div class="off-txt">Here's how you get rich:</div>
      <div class="welcome-loop"><div><b>🎯</b>Catch critters</div><span>➜</span><div><b>📦</b>Sell them</div><span>➜</span><div><b>🏡</b>Grow your ranch</div></div>
      <div class="off-txt">Follow the green arrow, and the steps at the top will show you what to do.</div>
      <button class="btn wide big" id="wel-go">Let's start!</button>`, 'welcome');
    w.querySelector('#wel-go').onclick = () => { this.game.audio.click(); this.closeModal(); onGo(); };
  }

  // the step card at the top while the tutorial runs (null hides it)
  tutCard(c) {
    const el = $('#tut');
    $('#tut-hand').classList.toggle('show', !!c?.hand);
    if (!c) { el.classList.remove('show'); this.tutKey = null; return; }
    const key = `${c.n}|${c.text}`;
    if (key === this.tutKey) return;
    const fresh = !this.tutKey || !this.tutKey.startsWith(`${c.n}|`);
    this.tutKey = key;
    $('#tut-step').textContent = `STEP ${c.n} OF ${c.total}`;
    $('#tut-dots').innerHTML = Array.from({ length: c.total }, (_, i) => `<i class="${i + 1 < c.n ? 'on' : i + 1 === c.n ? 'now' : ''}"></i>`).join('');
    $('#tut-ico').textContent = c.icon;
    $('#tut-title').textContent = c.title;
    $('#tut-text').textContent = c.text;
    if (fresh) { el.classList.remove('show'); void el.offsetWidth; }
    el.classList.add('show');
  }

  // everything else in one card: at the end of the tutorial, and from Settings
  howToPlay(first = false, onDone = null) {
    const w = this.modal(`<div class="modal-head ${first ? 'center' : ''}"><span>${first ? '🎉 You\'re a rancher now!' : '❓ How to play'}</span>${first ? '' : '<button class="x">✕</button>'}</div>
      <div class="how">
        <div><b>👣</b>Stand on the footprints to catch critters, then sell them at the 📦 belt</div>
        <div><b>🔓</b>Spend coins on green tiles: pens, helpers, pastures and more</div>
        <div><b>⬆️</b>Upgrades make you faster, stronger and richer</div>
        <div><b>📜</b>Missions, 📅 daily rewards and the 📖 Critterdex are on the left</div>
        <div><b>▶</b>Yellow video buttons on the right give free boosts</div>
        <div><b>👑</b>Watch out for boss critters and surprise events!</div>
        <div><b>🏥</b>Hurt critters 🩹 heal at the Doctor Deck for x3, and pet owners visit it too</div>
        <div><b>🍦</b>The Snack Stand sells ice cream to customers, 🚚 VIP trucks pay x4 and 🎡 the Lucky Wheel gives free prizes</div>
        <div><b>🗺️</b>Finish the last tile to travel to a new world</div>
      </div>
      <button class="btn wide big" id="how-ok">${first ? 'Start ranching!' : 'Got it'}</button>`, 'how-to');
    const done = () => { this.game.audio.click(); this.closeModal(); onDone?.(); };
    w.querySelector('#how-ok').onclick = done;
    w.querySelector('.x')?.addEventListener('click', done);
  }

  // the first time a feature appears: how it works, with the ranch paused behind the card
  intro(id) {
    const g = this.game, seen = g.state.intros || (g.state.intros = {});
    const it = INTROS[id];
    if (!it || seen[id]) return;
    seen[id] = true;
    g.save();
    this.later(() => {
      const w = this.modal(`<div class="modal-head center"><span>${it.title}</span></div>
        <div class="w-big">${it.icon}</div>
        <div class="how">${it.lines.map(([i, t]) => `<div><b>${i}</b>${t}</div>`).join('')}</div>
        <button class="btn wide big" id="intro-ok">Got it!</button>`, 'how-to');
      g.setPause('popup', true);
      w.querySelector('#intro-ok').onclick = () => { g.audio.click(); this.closeModal(); };
    });
  }

  // once per update, for players who already know the game
  whatsNew() {
    const g = this.game;
    g.state.news = NEWS;
    g.save();
    const w = this.modal(`<div class="modal-head center"><span>🎉 New on your ranch!</span></div>
      <div class="how">
        <div><b>🏥</b><span><strong>Doctor Deck</strong> (after the East Pasture): heal hurt critters 🩹 for x3 coins. Pet owners bring sick pets too!</span></div>
        <div><b>🍦</b><span><strong>Snack Stand</strong> (after the Express Belt): customers line up for ice cream, and the coins ride the belt to you</span></div>
        <div><b>🚚</b><span><strong>VIP trucks</strong>: fill their order in time for x${BAL.vipMul} coins</span></div>
        <div><b>🎡</b><span><strong>Lucky Wheel</strong> (left side): a free spin every ${BAL.wheelFreeHours} hours</span></div>
        <div><b>⬆️</b><span>4 new upgrades for the stand and the clinic</span></div>
      </div>
      <button class="btn wide big" id="news-ok">Let's go!</button>`, 'how-to');
    g.setPause('popup', true);
    w.querySelector('#news-ok').onclick = () => { g.audio.click(); this.closeModal(); };
  }

  tip(text) {
    $('#tip-text').textContent = text;
    $('#tip').classList.add('show');
    this.tipTimer = 7;
  }

  hideTip() { $('#tip').classList.remove('show'); this.tipTimer = 0; }
}
