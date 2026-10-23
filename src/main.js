import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Ads } from './ads.js';
import { preloadModels, MODEL_KEYS } from './world/assets.js';
import { SPECIES } from './world/models.js';
import { setWorld, worldSpecies } from './world/worlds.js';
import { loadState } from './save.js';
import { QUALITY } from './quality.js';
import { Net } from './net.js';

async function boot() {
  const bootEl = document.getElementById('boot');
  // no internet, no game: the "Internet is off" screen covers everything until the phone is online
  Net.start();
  const online = Net.waitOnline();
  // the world decides the theme, critters and prices; switching worlds reloads the page
  const world = setWorld(loadState().world);
  let travelled = false, resumed = false;
  try {
    travelled = !!sessionStorage.getItem('crt_travel');
    resumed = !!sessionStorage.getItem('crt_resume'); // reloaded after a lost graphics context
    sessionStorage.removeItem('crt_travel');
    sessionStorage.removeItem('crt_resume');
  } catch { /* storage unavailable */ }
  // people + this world's critters; models load while the fonts do, and anything not ready in time
  // uses the procedural builders
  const worldModels = new Set(worldSpecies(world).map((sp) => SPECIES[sp].model));
  const keys = MODEL_KEYS.filter((k) => k.startsWith('char-') || worldModels.has(k));
  const models = Promise.race([
    preloadModels((p) => { document.getElementById('boot-text').textContent = `${world.icon} ${world.name} · ${Math.round(p * 100)}%`; }, keys),
    new Promise((r) => setTimeout(r, 15000)),
  ]);
  // canvas text textures need the font ready before they are drawn
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.load('600 32px Fredoka')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fall back to system font */ }
  await models;
  await online; // so consent and the first ads load over a working connection

  const ui = new UI();
  const canvas = document.getElementById('c');
  const game = new Game(canvas, ui);
  // losing the connection mid-game freezes it behind the block screen; coming back online reloads ads
  Net.onChange = (on) => {
    game.setPause('net', !on);
    if (on) Ads.reconnect();
  };
  // If the phone takes the graphics context away (low GPU memory, driver reset), the canvas would stay
  // black or frozen: save and reload instead, which brings the player straight back into the game.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    game.contextLost = true;
    game.save();
    game.noSave = true;
    try { sessionStorage.setItem('crt_resume', '1'); } catch { /* storage unavailable */ }
    setTimeout(() => location.reload(), 400);
  });
  window.__game = game;
  window.__ads = Ads; // debug hook (inspect ad state over WebView devtools)
  window.__quality = QUALITY; // debug hook: detected GPU and the Low decision
  // start consent + ad loading during the title screen, so the first video is ready when it's offered
  Ads.init();
  const lastSeen = game.state.lastSeen;
  game.run();
  bootEl.remove();

  // Bottom banner: once the player knows the game, and not on phones under 2 GB of RAM (an ad banner
  // is a second web view in the same process; deviceMemory reports 3 GB phones as 2, 1.x GB as 1).
  // The game view shrinks to sit above it, with a small gap so drags near the bottom don't tap the ad.
  const lowMemory = (navigator.deviceMemory || 4) < 2;
  Ads.onBannerSize = (h) => {
    document.documentElement.style.setProperty('--ad-h', h > 0 ? `${h + 6}px` : '0px');
    game.resize();
  };
  const banner = () => { if (!lowMemory && game.state.tutorialDone) Ads.showBanner(); };
  game.onTutorialDone = banner;

  const start = () => {
    game.play();
    banner();
    if (travelled) ui.arrived(world);
    else if (game.state.stats.caught > 0) game.checkOffline(lastSeen);
    // the daily reward greets returning players (new players see it from their second day)
    if (game.state.tutorialDone && game.progress.daily().available) ui.later(() => ui.openDaily());
  };
  // arriving from the world map goes straight into the game
  if (travelled || resumed) { ui.skipTitle(); start(); } else ui.title(start);

  // Leaving the app (home button, app switcher, screen off, a call) pauses everything and saves.
  // Coming back shows a pause screen; the game only continues when the player taps Continue,
  // and then pays out what the pens and helpers earned meanwhile. Both the page visibility and
  // Capacitor's pause/resume events are used, because some phones only report one of them.
  let awayAt = 0;
  const leave = () => {
    if (awayAt || Ads.showing) return; // an ad on top of the game is handled by ads.js
    awayAt = Date.now();
    game.setPause('away', true);
    game.save();
  };
  const comeBack = () => {
    if (!awayAt || Ads.showing) return;
    const since = awayAt;
    awayAt = 0;
    Net.verify(); // Wi-Fi or data may have been switched off meanwhile
    if (!game.started) { game.setPause('away', false); return; } // still on the title screen
    ui.showPause(() => {
      game.setPause('menu', false); // the pause menu may have been open when the player left
      game.setPause('away', false);
      game.checkOffline(since);
    });
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? leave() : comeBack()));
  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    App.addListener('pause', leave);
    App.addListener('resume', comeBack);
    // back button: close a popup, otherwise open the pause menu (Continue / Exit game)
    App.addListener('backButton', () => {
      if (Net.blocked) App.minimizeApp();
      else if (ui.pauseShown) ui.resumeFromPause();
      else if (document.querySelector('.modal-wrap')) ui.back();
      else if (!game.started) App.minimizeApp();
      else {
        game.setPause('menu', true);
        ui.showPause(() => game.setPause('menu', false), () => { game.save(); App.exitApp(); });
      }
    });
  }
}

boot();
