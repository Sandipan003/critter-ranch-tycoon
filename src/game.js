import * as THREE from 'three';
import { Capacitor } from '@capacitor/core';
import { buildEnvironment, buildLights, buildPalisade, deckBox, addRail } from './world/environment.js';
import { L, DECK_Y } from './world/layout.js';
import { WORLD, worldUnlocks, worldById, worldSpecies } from './world/worlds.js';
import { arrowMesh, setShadowBlobTexture, SPECIES, buildCapsule, buildCoin, buildCoinStack, buildCritter } from './world/models.js';
import { shadowBlobTexture, textSpriteTexture, formatNum } from './world/textures.js';
import { Flyers, Particles, FloatText, Pops } from './systems/effects.js';
import { CritterSpawner, SPECIAL_MATS } from './systems/critters.js';
import { SellBelt } from './systems/belt.js';
import { DropZone, CoinPad, CapturePad, UnlockTile } from './systems/pads.js';
import { Pen } from './systems/pens.js';
import { Helper } from './systems/helpers.js';
import { Player } from './systems/player.js';
import { Progress } from './systems/progress.js';
import { FieldEvents } from './systems/events.js';
import { Tutorial } from './systems/tutorial.js';
import { Clinic } from './systems/clinic.js';
import { SnackStand } from './systems/snack.js';
import { VipTruck } from './systems/vip.js';
import { Wheel } from './systems/wheel.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Ads } from './ads.js';
import { loadState, saveState, clearState, freshUpgrades } from './save.js';
import { BAL, ADS, UPGRADES } from './config.js';
import { LOW } from './quality.js';

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.state = loadState();
    this.boosts = { income: 0, golden: 0, snack: 0 };
    this.audio = new Audio();
    this.audio.enabled = this.state.settings.sound;
    // why the game is paused: 'away' (app in background), 'menu', 'ad', 'popup' (a reward to claim),
    // 'net' (no internet)
    this.pauses = new Set();
    this.started = false;

    // Graphics: Low (Settings, or Auto on a weak phone / after slow frames, see quality.js) drops
    // antialiasing, shadows, high resolution, PBR shading and some scenery and effects, and caps the
    // frame rate at 30 when the phone can't keep 60, so old phones stay smooth
    this.low = LOW;
    const r = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = !this.low;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.minDpr = this.low ? 0.6 : 1;
    // never more than 60 fps (90/120 Hz screens would only burn battery); 30 on Low phones that
    // can't hold ~50 fps
    this.fpsCap = 60;
    this.lastFrame = 0;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, this.low ? 1 : 2);
    this.slowWindows = 0;
    this.dpr = this.maxDpr;
    r.setPixelRatio(this.dpr);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 220);
    this.camPos = new THREE.Vector3(0, 40, 40);
    this.camLook = new THREE.Vector3();
    this.tweens = { list: [], add(fn) { this.list.push(fn); } };

    setShadowBlobTexture(shadowBlobTexture());
    this.env = buildEnvironment(this.scene, { low: this.low });
    // scenery never moves: compute its matrices once instead of every frame
    for (const o of this.scene.children) {
      if (o.isLight) continue;
      o.traverse((c) => { c.updateMatrix(); c.matrixAutoUpdate = false; });
    }
    this.palisade = null;
    this.lights = buildLights(this.scene);
    if (this.low) this.lights.sun.castShadow = false;

    this.flyers = new Flyers(this.scene);
    this.particles = new Particles(this.scene);
    if (this.low) this.particles.amount = 0.5;
    this.floatText = new FloatText(this.scene);
    this.pops = new Pops();

    this.capturePad = new CapturePad(this.scene, L.capturePad);
    this.dropZone = new DropZone(this.scene, L.dropZone, '📦');
    this.coinPad = new CoinPad(this, L.coinPad);
    this.belt = new SellBelt(this);
    this.critters = new CritterSpawner(this);
    this.player = new Player(this);
    this.helpers = [];
    this.pens = {};
    this.tiles = {};
    this.upgradePad = null;
    this.onUpgradePad = false;
    this.clinic = null; // Doctor Deck, once bought
    this.onClinic = false;
    this.snack = null; // Snack Stand, once bought
    // this world's unlock chain (prices scaled, finale last)
    this.unlocks = worldUnlocks((sp) => [SPECIES[sp].emoji, `${SPECIES[sp].name} Pen`]);
    this.portal = null; // world-map pad, once this world's travel tile is bought
    this.onPortal = false;

    this.guideArrow = arrowMesh();
    this.scene.add(this.guideArrow);
    const ptr = new THREE.Mesh(new THREE.CircleGeometry(0.42, 3), new THREE.MeshBasicMaterial({ color: 0x3dff5a, transparent: true, opacity: 0.9, depthWrite: false }));
    ptr.rotation.x = -Math.PI / 2;
    ptr.renderOrder = 4;
    this.pointer = new THREE.Group();
    ptr.position.z = 1.5;
    ptr.rotation.z = Math.PI / 2;
    this.pointer.add(ptr);
    this.scene.add(this.pointer);

    this.input = new Input(canvas);
    // missions, daily reward, Critterdex (its bonus feeds into prices) and random field events
    this.progress = new Progress(this);
    this.events = new FieldEvents(this);
    this.vip = new VipTruck(this);
    this.wheel = new Wheel(this);
    this.clock = {
      last: performance.now(),
      getDelta() { const n = performance.now(), d = (n - this.last) / 1000; this.last = n; return d; },
    };
    this.frameTimes = [];
    this.saveTimer = 5;

    // restore progress
    for (const id of this.state.unlocked) this.applyUnlock(id, false);
    this.rebuildPalisade();
    this.refreshTiles();
    this.tutorial = new Tutorial(this);
    for (let i = 0; i < this.critters.maxCount; i++) this.critters.spawn(true);
    this.belt.prefill();

    Ads.onPause = () => this.setPause('ad', true);
    Ads.onResume = () => this.setPause('ad', false);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.prewarm();
    this.ui.bind(this);
    this.ui.setCoins(this.state.coins, true);
    this.ui.setLevel(this.state.level, this.xpProgress());
  }

  // Compile the shaders of things that only show up later (capsules, coins, golden and boss critters,
  // particles, floating text) while the game loads, so the first catch, coin or boss doesn't make a
  // slow phone freeze for a moment.
  prewarm() {
    const g = new THREE.Group();
    g.add(buildCapsule(1), buildCoin(), buildCoinStack(2));
    const sp = worldSpecies()[0];
    for (const m of SPECIAL_MATS) {
      const c = buildCritter(sp, 1);
      c.root.traverse((o) => { if (o.isSkinnedMesh) o.material = m; });
      g.add(c.root);
    }
    this.particles.burst(new THREE.Vector3(0, -20, 0), { count: 1, star: true });
    this.particles.burst(new THREE.Vector3(0, -20, 0), { count: 1 });
    this.floatText.spawn(new THREE.Vector3(0, -20, 0), '+1');
    this.scene.add(g);
    try { this.renderer.compile(this.scene, this.camera); } catch { /* compiled on first use instead */ }
    this.scene.remove(g);
    g.traverse((o) => { if (o.skeleton) o.skeleton.dispose(); });
  }

  // ── economy ──────────────────────────────────────────────
  isUnlocked(id) { return this.state.unlocked.includes(id); }
  openTiles() { return Object.values(this.tiles).filter((t) => !t.locked); }

  // Pen Feeding upgrade: +25% pen income per level
  penMul() { return 1 + (this.state.upgrades.pens || 0) * 0.25; }

  rebuildPalisade() {
    if (this.palisade) this.scene.remove(this.palisade);
    const opened = [...Object.keys(L.yards), ...Object.keys(L.balconies), 'clinic'].filter((id) => this.isUnlocked(id));
    this.palisade = buildPalisade(this.scene, opened);
  }

  // The Doctor Deck: a deck south of the East Pasture, through a gap in its fence, with the clinic
  buildClinic(animate) {
    const C = L.clinic, D = C.deck, Y = L.yards.yardE.deck;
    const deck = deckBox(D.x0, D.x1, D.z0, D.z1, DECK_Y, this.env.plank);
    this.scene.add(deck);
    this.player.addWalk({ x0: D.x0 + 0.5, x1: C.walkX1, z0: D.z0 + 0.5, z1: D.z1 - 0.5 });
    this.player.addWalk({ x0: C.gap[0] + 0.45, x1: C.gap[1] - 0.45, z0: Y.z1 - 1.2, z1: D.z0 + 0.9 });
    this.clinic = new Clinic(this, animate);
    if (animate) {
      this.rebuildPalisade();
      this.pops.pop(deck, 0.5, 1);
    }
  }

  // A balcony extension beside the original balcony, reached through a gap in the deck's north fence
  buildBalcony(id, animate) {
    const Bc = L.balconies[id], D = Bc.deck;
    const deck = deckBox(D.x0, D.x1, D.z0, D.z1, DECK_Y, this.env.plank);
    this.scene.add(deck);
    const outer = D.x0 < 0 ? D.x0 : D.x1;
    addRail(this.scene, D.x1 - D.x0, (D.x0 + D.x1) / 2, D.z0 + 0.1, 0);
    addRail(this.scene, D.z1 - D.z0, outer + (D.x0 < 0 ? 0.1 : -0.1), (D.z0 + D.z1) / 2, Math.PI / 2);
    this.player.addWalk({ x0: D.x0 + 0.5, x1: D.x1 - 0.5, z0: D.z0 + 0.55, z1: D.z1 - 0.4 });
    this.player.addWalk({ x0: Bc.gap[0] + 0.4, x1: Bc.gap[1] - 0.4, z0: D.z1 - 1.0, z1: L.deck.z0 + 1.0 });
    if (animate) {
      this.rebuildPalisade();
      this.pops.pop(deck, 0.5, 1);
      this.particles.burst(new THREE.Vector3((D.x0 + D.x1) / 2, 1, (D.z0 + D.z1) / 2), { color: 0x7dff6a, count: 26, star: true, speed: 6, size: 0.55 });
    }
  }

  // A pasture: new deck section through a gap in the fence, with a pen of this world's critter beyond it
  buildYard(id, animate) {
    const Y = L.yards[id], D = Y.deck;
    const deck = deckBox(D.x0, D.x1, D.z0, D.z1, DECK_Y, this.env.plank);
    this.scene.add(deck);
    this.player.addWalk({ x0: D.x0 + 0.55, x1: D.x1 - 0.55, z0: D.z0 + 0.5, z1: D.z1 - 0.5 });
    this.player.addWalk({ x0: Y.gap[0] + 0.45, x1: Y.gap[1] - 0.45, z0: L.deck.z1 - 1.2, z1: D.z0 + 0.9 });
    const pd = Y.pen;
    this.pens[pd.id] = new Pen(this, pd.id, { ...pd, species: WORLD.pens[pd.id], rate: pd.rate * WORLD.valueMul, facing: 0 });
    if (animate) {
      this.rebuildPalisade();
      this.pops.pop(deck, 0.5, 1);
      this.particles.burst(new THREE.Vector3((D.x0 + D.x1) / 2, 1, (D.z0 + D.z1) / 2), { color: 0x7dff6a, count: 30, star: true, speed: 7, size: 0.6 });
    }
  }

  incomeMul() {
    return (1 + this.state.upgrades.value * 0.15) * (1 + (this.state.level - 1) * 0.03)
      * (1 + this.progress.dexBonus) * (this.boosts.income > 0 ? 2 : 1) * (this.state.crown ? 2 : 1);
  }
  saleValue(base) { return Math.max(1, Math.round(base * this.incomeMul())); }
  earn(n) {
    this.state.coins += n;
    this.state.stats.earned += n;
    this.ui.setCoins(this.state.coins);
  }
  spend(n) {
    this.state.coins = Math.max(0, this.state.coins - n);
    this.ui.setCoins(this.state.coins);
  }
  xpForLevel(l) { return Math.round(20 * Math.pow(l, 1.5)); }
  xpProgress() { return this.state.xp / this.xpForLevel(this.state.level); }
  addXp(n) {
    this.state.xp += n;
    while (this.state.xp >= this.xpForLevel(this.state.level)) {
      this.state.xp -= this.xpForLevel(this.state.level);
      this.state.level++;
      this.ui.toast(`🎉 Ranch Level ${this.state.level}! Prices +3%`);
      this.audio.unlockFx();
    }
    this.ui.setLevel(this.state.level, this.xpProgress());
  }
  upgradeCost(u) { return Math.round(u.base * WORLD.costMul * Math.pow(u.mul, this.state.upgrades[u.id])); }

  onCapture(owner, item) {
    this.state.stats.caught++;
    if (owner === this.player) this.addXp(item.level);
    this.progress.onCatch(item);
  }

  haptic() {
    if (!this.state.settings.haptics || !Capacitor.isNativePlatform()) return;
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => {});
  }

  // Moves one capsule from an actor's stack onto the belt. Returns false when empty.
  dropToBelt(actor) {
    const it = actor.stack.pop();
    if (!it) return false;
    const from = new THREE.Vector3();
    it.mesh.getWorldPosition(from);
    this.flyers.fly(it.mesh, from, this.belt.mouthA, {
      dur: 0.32, height: 1.5,
      onDone: () => {
        it.mesh.visible = false;
        this.belt.addCapsule(it);
        this.state.stats.sold++;
      },
    });
    this.audio.drop();
    return true;
  }

  // ── unlocks ──────────────────────────────────────────────
  refreshTiles() {
    for (const def of this.unlocks) {
      if (this.isUnlocked(def.id)) continue;
      const tile = this.tiles[def.id];
      if (!def.requires || this.isUnlocked(def.requires)) {
        if (tile && !tile.locked) continue;
        if (tile) tile.dispose(); // locked preview becomes buyable
        this.tiles[def.id] = new UnlockTile(this, def, this.state.paid[def.id] || 0);
      } else if (!tile && def.preview !== false && this.tiles[def.requires] && !this.tiles[def.requires].locked) {
        // show what comes next (greyed out with a lock) so players see where the ranch can grow
        const req = this.unlocks.find((u) => u.id === def.requires);
        this.tiles[def.id] = new UnlockTile(this, def, 0, `${req.icon} ${req.label} first`);
      }
    }
  }

  applyUnlock(id, animate) {
    switch (id) {
      case 'upgrades': {
        const pad = new DropZone(this.scene, L.upgradePad, '⬆️');
        this.upgradePad = pad;
        const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSpriteTexture('⬆️ Upgrades', '#ffffff', 60), transparent: true, depthWrite: false }));
        lbl.scale.set(4.2, 1.05, 1);
        lbl.position.set(L.upgradePad[0], 2.0, L.upgradePad[1]);
        this.scene.add(lbl);
        if (animate) this.pops.pop(pad.mesh, 0.5, 1);
        break;
      }
      case 'penW':
      case 'penE':
        // same pen spots in every world; species and income come from the world
        this.pens[id] = new Pen(this, id, { ...L.pens[id], species: WORLD.pens[id], rate: L.pens[id].rate * WORLD.valueMul });
        break;
      case 'helper1':
        this.helpers.push(new Helper(this, L.helperPads[0]));
        break;
      case 'helper2':
        this.helpers.push(new Helper(this, L.helperPads[1]));
        break;
      case 'express':
        this.belt.setPickupCount(2);
        this.belt.speedMul = 1.6;
        if (animate) this.belt.prefill();
        break;
      case 'grove':
        if (animate) for (let i = 0; i < 6; i++) this.critters.spawn();
        break;
      case 'snack':
        this.snack = new SnackStand(this, animate);
        break;
      case 'clinic':
        this.buildClinic(animate);
        break;
      case 'yardE':
      case 'yardW':
        this.buildYard(id, animate);
        break;
      case 'balE':
      case 'balW':
        this.buildBalcony(id, animate);
        break;
      case 'helper3':
      case 'helper4': {
        // balcony helpers walk through the fence gap on their way to the belt
        const Bc = L.balconies[id === 'helper3' ? 'balE' : 'balW'];
        this.helpers.push(new Helper(this, Bc.pad, new THREE.Vector3((Bc.gap[0] + Bc.gap[1]) / 2, DECK_Y, L.deck.z0)));
        break;
      }
      case 'travel':
        this.state.maxWorld = Math.max(this.state.maxWorld, WORLD.finale.to);
        this.buildPortal(animate);
        break;
      case 'crown':
        this.state.crown = true;
        this.buildPortal(animate, true);
        break;
    }
  }

  // The finale tile becomes a pad: standing on it opens the world map (with a crown on top in the last world)
  buildPortal(animate, crown = false) {
    const pos = this.unlocks[this.unlocks.length - 1].tile;
    const pad = new DropZone(this.scene, pos, crown ? '👑' : '🗺️');
    const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSpriteTexture(crown ? '👑 Golden Ranch' : '🗺️ World map', '#ffffff', 60), transparent: true, depthWrite: false }));
    lbl.scale.set(4.2, 1.05, 1);
    lbl.position.set(pos[0], 2.0, pos[1]);
    this.scene.add(lbl);
    this.portal = pad;
    if (animate) this.pops.pop(pad.mesh, 0.5, 1);
  }

  // Switch worlds: park this world's progress, load (or start) the other one and rebuild the game
  travel(id) {
    const s = this.state;
    const dest = worldById(id);
    if (!dest || id === s.world || id > s.maxWorld) return;
    // coins still lying on pads come along, and the clinic's patients pay their normal price
    const pads = [this.coinPad, ...Object.values(this.pens).map((p) => p.coinPad), ...(this.clinic ? [this.clinic.coinPad] : [])];
    const loose = pads.reduce((a, p) => a + p.value, 0) + (this.clinic?.pendingValue() || 0);
    if (loose > 0) this.earn(loose);
    // each world is its own run: coins, unlocks and upgrades stay behind and wait for you
    s.worlds[s.world] = { coins: s.coins, unlocked: s.unlocked, paid: s.paid, upgrades: s.upgrades };
    const next = s.worlds[id] || { coins: 0, unlocked: [], paid: {}, upgrades: freshUpgrades() };
    delete s.worlds[id];
    s.coins = next.coins || 0;
    s.unlocked = next.unlocked;
    s.paid = next.paid;
    s.upgrades = { ...freshUpgrades(), ...next.upgrades };
    s.world = id;
    this.save();
    this.noSave = true; // nothing may overwrite the switched save before the reload
    try { sessionStorage.setItem('crt_travel', String(id)); } catch { /* storage unavailable */ }
    this.ui.travelling(dest);
    // the trip between worlds is a natural break for an interstitial (frequency-capped in ads.js)
    const t0 = Date.now();
    Ads.maybeInterstitial().finally(() => setTimeout(() => location.reload(), Math.max(0, 900 - (Date.now() - t0))));
  }

  unlock(id) {
    const tile = this.tiles[id];
    const def = this.unlocks.find((u) => u.id === id);
    if (tile) {
      this.particles.burst(tile.mesh.position.clone().setY(1), { color: 0x7dff6a, count: 28, star: true, speed: 6, size: 0.55 });
      this.particles.puff(tile.mesh.position.clone().setY(0.8), 0xffffff, 14);
      tile.dispose();
      delete this.tiles[id];
    }
    delete this.state.paid[id];
    this.state.unlocked.push(id);
    this.state.stats.unlocks++;
    this.applyUnlock(id, true);
    this.refreshTiles();
    this.audio.unlockFx();
    this.haptic();
    this.ui.celebrate(`${def.icon} ${def.label} unlocked!`);
    if (id === 'grove') this.ui.toast(WORLD.groveToast);
    if (id === 'travel') setTimeout(() => this.ui.worldUnlocked(worldById(WORLD.finale.to)), 1400);
    if (id === 'crown') setTimeout(() => this.ui.crowned(), 1400);
    if (id === 'express') this.ui.toast('⚡ Faster belt + a second shop counter!');
    const tips = {
      upgrades: '⬆️ Stand on the Upgrades pad any time to walk faster, carry more and earn more.',
      penW: '🐧 Pens make coins by themselves: collect them on the pen\'s 💰 pad. Drop critters on 🍖 to feed it for a bonus!',
      helper1: '🧑‍🌾 Your helper catches critters and sells them for you. Hire more to earn while you relax!',
      yardE: '🏡 Pastures make your ranch bigger: walk through the gap in the fence to reach the new pen.',
      balE: '🪵 A balcony wing: room for one more helper. Walk through the gap in the north fence.',
      snack: '🍦 Customers waiting in line now buy ice cream: the coins ride the belt to your 💰 pad.',
      clinic: '🏥 Some wild critters are hurt now 🩹. Bring them (white capsules) to the 🩺 pad: healed critters pay x3!',
    };
    if (tips[id]) this.tip(id, tips[id]);
    this.save();
    if (this.state.stats.unlocks % ADS.interstitialEveryUnlocks === 0) {
      setTimeout(() => Ads.maybeInterstitial(), 1600);
    }
  }

  buyUpgrade(id, free = false) {
    const u = UPGRADES.find((x) => x.id === id);
    const lv = this.state.upgrades[id];
    if (lv >= u.max) return false;
    if (!free) {
      const cost = this.upgradeCost(u);
      if (this.state.coins < cost) return false;
      this.spend(cost);
    }
    this.state.upgrades[id]++;
    this.progress.track('upgrade');
    this.audio.unlockFx();
    this.particles.burst(this.player.pos.clone().setY(1.5), { color: 0x7dff6a, count: 16, star: true, speed: 4, size: 0.4 });
    this.save();
    return true;
  }

  // ── rewarded ad perks ────────────────────────────────────
  cooldownLeft(key) { return Math.max(0, ((this.state.adCooldowns[key] || 0) - Date.now()) / 1000); }
  setCooldown(key, sec) { this.state.adCooldowns[key] = Date.now() + sec * 1000; }

  freeCoinsAmount() {
    // 40% of the cheapest open tile; the big world finale (travel / crown) only gets 12% per ad
    const finale = this.unlocks[this.unlocks.length - 1].id;
    const open = this.openTiles().map((t) => t.remaining * (t.def.id === finale ? 0.3 : 1));
    const next = open.length ? Math.min(...open) : 300 * WORLD.costMul;
    return Math.max(30, Math.round(next * 0.4 + this.state.level * 5));
  }

  async rewardFor(kind, extra) {
    // a double tap must not open two videos (the first may still be loading)
    if (Ads.showing || this.adBusy) return false;
    this.adBusy = true;
    if (!Ads.rewardedLoaded) this.ui.toast('Loading video…');
    let ok = false;
    try { ok = await Ads.showRewarded(); } finally { this.adBusy = false; }
    if (!ok) {
      this.ui.toast(Ads.lastFail === 'skipped' ? 'Watch the whole video to get the reward' : 'Ad not ready yet, try again in a moment');
      return false;
    }
    Ads.markRewardWatched();
    if (kind === 'free') {
      const amt = this.freeCoinsAmount();
      this.earn(amt);
      this.coinBurstToHud(amt);
      this.setCooldown('free', BAL.rewardCooldownSec);
    } else if (kind === 'income') {
      this.boosts.income = BAL.incomeBoostSec;
      this.setCooldown('income', BAL.incomeBoostSec + 60);
      this.ui.toast('💰 Double income for 2 minutes!');
    } else if (kind === 'golden') {
      this.boosts.golden = BAL.goldenThrowSec;
      this.setCooldown('golden', BAL.goldenThrowSec + 75);
      this.ui.toast('⚡ Golden Throw: 100% capture!');
    } else if (kind === 'upgrade') {
      this.buyUpgrade(extra, true);
      this.setCooldown('up_' + extra, 150);
    } else if (kind === 'offline') {
      this.earn(extra);
    } else if (kind === 'mission') {
      this.coinBurstToHud(this.progress.claim(extra, 2));
    } else if (kind === 'daily') {
      this.coinBurstToHud(this.progress.claimDaily(2));
    } else if (kind === 'heal') {
      const n = this.clinic ? this.clinic.healAll() : 0;
      this.ui.toast(`🩺 ${n} critter${n === 1 ? '' : 's'} healed: collect the coins at the clinic!`);
      this.setCooldown('heal', 60);
    } else if (kind === 'snack') {
      this.boosts.snack = BAL.snackRushSec;
      this.setCooldown('snack', BAL.snackRushSec + 60);
      this.ui.toast('🍦 Snack Rush: x3 snack sales for 2 minutes!');
    } else if (kind === 'vip') {
      this.earn(extra);
      this.coinBurstToHud(extra);
    }
    // 'wheel': the spin itself is the reward (ui.js)
    this.audio.unlockFx();
    this.save();
    return true;
  }

  coinBurstToHud(amount) {
    this.floatText.spawn(this.player.pos.clone().setY(3.2), `+${formatNum(amount)}`, '#ffe14a', 1.4);
    this.particles.burst(this.player.pos.clone().setY(2), { color: 0xffd23a, count: 20, star: true, speed: 5, size: 0.45 });
  }

  // ── offline earnings ─────────────────────────────────────
  offlineRate() {
    let r = 0;
    for (const pen of Object.values(this.pens)) r += (pen.def.rate * this.penMul()) / 5;
    r += this.helpers.length * 1.2 * WORLD.valueMul;
    if (this.snack) r += (BAL.snackValue * WORLD.valueMul * (1 + (this.state.upgrades.snack || 0) * 0.3)) / BAL.snackSec;
    return r * (1 + this.state.upgrades.value * 0.15) * (1 + this.progress.dexBonus) * (this.state.crown ? 2 : 1);
  }

  checkOffline(sinceMs) {
    const sec = Math.min(BAL.offlineCapHours * 3600, (Date.now() - sinceMs) / 1000);
    if (sec < 60) return;
    const amount = Math.floor(this.offlineRate() * sec * 0.5);
    if (amount < 5) return;
    this.ui.offline(amount, sec);
  }

  // ── main loop ────────────────────────────────────────────
  resize() {
    // the canvas may be shorter than the window when a banner ad sits below it
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true; // resizing clears the canvas: a paused game draws one still frame again
  }

  cameraRig(dt, snap = false) {
    const p = this.player.pos;
    const capture = this.capturePad.contains(p);
    const aspect = this.camera.aspect;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect);
    const width = capture ? 13 : 13.5;
    let dist = width / 2 / Math.tan(hfov / 2);
    dist = Math.min(dist, capture ? 40 : 44);
    const pitch = THREE.MathUtils.degToRad(capture ? 27 : 50);
    const look = capture
      ? new THREE.Vector3(p.x * 0.6, 0, p.z - 11.5)
      : new THREE.Vector3(p.x, 0, p.z - 0.5);
    const pos = look.clone().add(new THREE.Vector3(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist));
    const k = snap ? 1 : 1 - Math.exp(-dt * 4.5);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.scene.fog.near = dist * 1.15;
    this.scene.fog.far = dist * 3.2;
    this.lights.follow(new THREE.Vector3(this.camLook.x, 0, this.camLook.z - 3));
  }

  // The green arrow (and the pointer at the player's feet): the tutorial step's target for new
  // players, afterwards the next useful thing (sell, collect, an affordable unlock, catch)
  updateGuide(dt) {
    const g = this.state;
    const p = this.player;
    let target = null;
    if (this.tutorial.active) target = this.tutorial.update(dt);
    else {
      const affordable = this.openTiles().filter((t) => g.coins >= t.remaining).sort((a, b) => a.remaining - b.remaining)[0];
      // hurt critters go to the doctor first (unless the waiting line is full)
      const hurt = this.clinic && !this.clinic.full && p.stack.items.some((it) => it.hurt);
      if (hurt && (p.stack.full || !p.capturing)) target = this.clinic.pad.pos;
      else if (p.stack.count > 0 && (p.stack.full || !p.capturing)) target = this.dropZone.pos;
      else if (this.coinPad.value >= 6 && p.stack.count === 0) target = this.coinPad.pos;
      else if (affordable) target = affordable.def.tile;
      else if (p.stack.count === 0 && !p.capturing) target = this.capturePad.pos;
    }
    if (target && !target.isVector3) target = new THREE.Vector3(target[0], DECK_Y, target[1]);
    if (target && Math.hypot(target.x - p.pos.x, target.z - p.pos.z) < 1.3) target = null;
    this.guideArrow.visible = !!target;
    this.pointer.visible = !!target && Math.hypot(target.x - p.pos.x, target.z - p.pos.z) > 4;
    if (target) {
      this.guideArrow.position.set(target.x, 2.4 + Math.abs(Math.sin(performance.now() / 260)) * 0.6, target.z);
      this.guideArrow.rotation.y += dt * 2;
      this.pointer.position.set(p.pos.x, DECK_Y + 0.05, p.pos.z);
      this.pointer.rotation.y = Math.atan2(target.x - p.pos.x, target.z - p.pos.z);
    }
  }

  // one-time tip the first time something new happens
  tip(id, text) {
    const t = this.state.tips || (this.state.tips = {});
    if (t[id]) return;
    t[id] = true;
    this.ui.tip(text);
    this.save();
  }

  updateZones(dt) {
    const p = this.player;
    // belt input
    if (this.dropZone.contains(p.pos) && p.stack.count > 0) {
      this.dropZone.timer -= dt;
      if (this.dropZone.timer <= 0) {
        this.dropZone.timer = 0.09;
        this.dropToBelt(p);
      }
    }
    // coin pads (main + pens + clinic)
    const pads = [this.coinPad, ...Object.values(this.pens).map((x) => x.coinPad), ...(this.clinic ? [this.clinic.coinPad] : [])];
    for (const pad of pads) {
      if (pad.contains(p.pos) && pad.value > 0) {
        const amt = pad.collect((v) => v.copy(p.pos).setY(1.4));
        this.earn(amt);
        this.floatText.spawn(p.pos.clone().setY(3.2), `+${amt}`, '#ffe14a', 1.3);
        this.haptic();
      }
    }
    // unlock tiles
    for (const [id, tile] of Object.entries(this.tiles)) {
      if (tile.update(dt, p)) this.unlock(id);
      else if (tile.paid > 0) this.state.paid[id] = tile.paid;
    }
    // upgrade station
    if (this.upgradePad) {
      const on = this.upgradePad.contains(p.pos);
      if (on && !this.onUpgradePad && p.speed < 6) this.ui.openUpgrades();
      if (!on && this.onUpgradePad) this.ui.closeUpgrades();
      this.onUpgradePad = on;
    }
    // world map pad
    if (this.portal) {
      const on = this.portal.contains(p.pos);
      if (on && !this.onPortal && p.speed < 6) this.ui.openWorldMap();
      this.onPortal = on;
    }
    // clinic panel while standing on its 🩺 pad
    if (this.clinic) {
      const on = this.clinic.pad.contains(p.pos);
      if (on && !this.onClinic) this.ui.openClinic();
      if (!on && this.onClinic) this.ui.closeClinic();
      this.onClinic = on;
    }
  }

  update(dt) {
    for (const k of Object.keys(this.boosts)) this.boosts[k] = Math.max(0, this.boosts[k] - dt);
    const input = this.input.read();
    this.player.update(dt, input);
    this.events.update(dt);
    this.critters.update(dt);
    this.belt.update(dt);
    this.snack?.update(dt);
    this.clinic?.update(dt);
    this.vip.update(dt);
    for (const h of this.helpers) h.update(dt);
    const actors = [this.player, ...this.helpers];
    for (const pen of Object.values(this.pens)) pen.update(dt, actors);
    this.updateZones(dt);
    this.flyers.update(dt);
    this.particles.update(dt);
    this.floatText.update(dt);
    this.pops.update(dt);
    const tl = this.tweens.list;
    for (let i = tl.length - 1; i >= 0; i--) if (tl[i](dt)) tl.splice(i, 1);
    this.updateGuide(dt);
    this.ui.tick(dt);
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 5; this.save(); }
  }

  adaptQuality(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    // Low phone that can't keep ~50 fps at 0.75 resolution: a steady 30 fps feels smoother than a
    // jumpy 35–45, and halves the work (cooler phone, longer battery)
    if (this.low && this.fpsCap !== 30 && avg > 1 / 48 && this.dpr <= 0.75) {
      this.fpsCap = 30;
      return;
    }
    if (this.fpsCap === 30 && avg < 1 / 27) return; // holding the 30 fps cap
    if (avg > 1 / 45 && this.dpr > (this.low && this.fpsCap !== 30 ? 0.75 : this.minDpr)) {
      this.dpr = Math.max(this.minDpr, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
    } else if (avg > 1 / 30 && !this.low && this.state.settings.quality === 'auto') {
      // still under 30 fps at the lowest resolution: switch shadows off now, and start in low mode next time
      if (++this.slowWindows >= 2) {
        this.low = true;
        this.lights.sun.castShadow = false;
        this.minDpr = 0.75;
        this.state.settings.autoLow = true;
        this.save();
        this.ui.toast('Switched to smooth graphics for your phone');
      }
    } else if (avg < 1 / 58 && this.dpr < this.maxDpr) {
      this.dpr = Math.min(this.maxDpr, this.dpr + 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
    }
  }

  play() {
    this.started = true;
    this.audio.unlock();
    this.tutorial.begin();
  }

  // Nothing moves while any pause reason is set: the app is in the background, the pause menu is open
  // or an ad is showing. Unpausing restarts the frame clock so no time is skipped.
  get paused() { return this.pauses.size > 0; }
  setPause(reason, on) {
    const was = this.paused;
    if (on) this.pauses.add(reason);
    else this.pauses.delete(reason);
    if (was === this.paused) return;
    this.input.reset();
    this.dirty = true;
    if (this.paused) this.audio.suspend();
    else {
      this.audio.resume();
      this.clock.getDelta();
    }
  }

  run() {
    this.cameraRig(0, true);
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (now - this.lastFrame < 1000 / this.fpsCap - 3) return; // frame-rate cap
      this.lastFrame = now;
      const dt = Math.min(0.05, this.clock.getDelta());
      if (this.contextLost) return;
      // paused (a popup, the pause menu, no internet): nothing moves, but the ranch stays visible
      // behind it, so redraw the still scene whenever the canvas was cleared (e.g. the banner resized it)
      if (this.paused) {
        if (this.dirty) {
          this.dirty = false;
          try { this.renderer.render(this.scene, this.camera); } catch { /* next frame */ }
        }
        return;
      }
      // an error in one frame is logged and skipped instead of freezing the game
      try {
        if (this.started) this.update(dt);
        this.cameraRig(dt);
        this.renderer.render(this.scene, this.camera);
        this.adaptQuality(dt);
      } catch (err) {
        this.errors = (this.errors || 0) + 1;
        if (this.errors <= 5) console.error('frame error', err);
      }
    };
    loop(performance.now());
  }

  save() { if (!this.noSave) saveState(this.state); }

  resetProgress() {
    this.noSave = true; // nothing may write the old state back before the reload
    clearState();
    try { sessionStorage.removeItem('crt_travel'); } catch { /* storage unavailable */ }
    location.reload();
  }

  // test helper: advance the simulation without requestAnimationFrame
  step(seconds, fps = 30) {
    const dt = 1 / fps;
    for (let t = 0; t < seconds; t += dt) {
      this.update(dt);
      this.cameraRig(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
