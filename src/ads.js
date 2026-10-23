import { Capacitor } from '@capacitor/core';
import { ADS, TEST_IDS } from './config.js';

// Thin wrapper around @capacitor-community/admob.
// In a desktop browser it shows a fake "test ad" so rewards can be tested.
const native = Capacitor.isNativePlatform();
let AdMob = null, RewardAdPluginEvents = null, InterstitialAdPluginEvents = null, BannerAdPluginEvents = null, AdmobConsentStatus = null, BannerAdPosition = null, BannerAdSize = null;

// the interstitial frequency cap must survive the reload that world travel does
const GAP_KEY = 'crt_last_interstitial';
const readLast = () => { try { return Number(localStorage.getItem(GAP_KEY)) || 0; } catch { return 0; } };
const writeLast = (t) => { try { localStorage.setItem(GAP_KEY, String(t)); } catch { /* storage unavailable */ } };

const ids = {
  get rewarded() { return ADS.testMode ? TEST_IDS.rewarded : ADS.rewardedId; },
  get interstitial() { return ADS.testMode ? TEST_IDS.interstitial : ADS.interstitialId; },
  get banner() { return ADS.testMode ? TEST_IDS.banner : ADS.bannerId; },
};

export const Ads = {
  ready: false,
  canRequest: false,
  rewardedLoaded: false,
  interstitialLoaded: false,
  privacyRequired: false,
  showing: false,
  lastInterstitial: readLast(),
  onPause: () => {},
  onResume: () => {},
  onBannerSize: () => {}, // (height in CSS px) the game makes room for the banner
  bannerOn: false,
  bannerStatus: 'off', // shown in Settings: off | loading | showing | waiting for an ad (code)
  bannerFails: 0,

  // Safe to call more than once; everything that needs the SDK awaits the same promise.
  init() {
    if (!this.initPromise) this.initPromise = this.setup();
    return this.initPromise;
  },

  async setup() {
    if (!native) { this.ready = true; this.canRequest = true; this.rewardedLoaded = true; return; }
    try {
      const mod = await import('@capacitor-community/admob');
      ({ AdMob, RewardAdPluginEvents, InterstitialAdPluginEvents, BannerAdPluginEvents, AdmobConsentStatus, BannerAdPosition, BannerAdSize } = mod);
      // Google UMP consent (required for EEA/UK users). If the check itself fails (offline, or no
      // GDPR message published in AdMob yet) ads are still requested and Google serves limited ads
      // where consent is required, instead of the game showing no ads at all.
      let info = null;
      try {
        info = await AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
          info = await AdMob.showConsentForm();
        }
      } catch (e) {
        console.warn('AdMob consent check failed', e);
      }
      // PrivacyOptionsRequirementStatus isn't exported by the plugin, so compare the raw value
      this.privacyRequired = info?.privacyOptionsRequirementStatus === 'REQUIRED';
      this.canRequest = info ? info.canRequestAds : true;
      if (!this.canRequest) return;
      await AdMob.initialize();
      this.ready = true;
      AdMob.addListener(RewardAdPluginEvents.Loaded, () => { this.rewardedLoaded = true; });
      AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
        this.rewardedLoaded = false;
        setTimeout(() => this.loadRewarded(), 30000);
      });
      AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => { this.interstitialLoaded = true; });
      AdMob.addListener(BannerAdPluginEvents.SizeChanged, (s) => this.onBannerSize(s?.height || 0));
      AdMob.addListener(BannerAdPluginEvents.Loaded, () => { this.bannerStatus = 'showing'; this.bannerFails = 0; });
      // The plugin throws the banner away when a load (or one of AdMob's refreshes) fails, e.g. no
      // ad available yet for a new ad unit or a network blip: ask again after a while (20 s, 40 s, …
      // up to 5 minutes) so the banner comes back instead of staying gone for the whole session.
      AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (err) => {
        this.bannerOn = false;
        this.bannerFails++;
        this.bannerStatus = `waiting for an ad (${err?.code ?? '?'})`;
        clearTimeout(this.bannerRetry);
        this.bannerRetry = setTimeout(() => this.showBanner(), Math.min(300, 20 * 2 ** (this.bannerFails - 1)) * 1000);
      });
      this.loadRewarded();
      this.loadInterstitial();
    } catch (e) {
      console.warn('AdMob init failed', e);
    }
  },

  async loadRewarded() {
    if (!native || !this.ready || this.rewardedLoading) return;
    this.rewardedLoading = true;
    try {
      await AdMob.prepareRewardVideoAd({ adId: ids.rewarded, isTesting: ADS.testMode });
      this.rewardedLoaded = true;
    } catch {
      this.rewardedLoaded = false;
    } finally {
      this.rewardedLoading = false;
    }
  },

  async loadInterstitial() {
    if (!native || !this.ready || this.interstitialLoading) return;
    this.interstitialLoading = true;
    try {
      await AdMob.prepareInterstitial({ adId: ids.interstitial, isTesting: ADS.testMode });
      this.interstitialLoaded = true;
    } catch {
      this.interstitialLoaded = false;
      setTimeout(() => this.loadInterstitial(), 45000);
    } finally {
      this.interstitialLoading = false;
    }
  },

  // Back online after the connection dropped: ask again right away for whatever failed to load
  // meanwhile, instead of waiting for the retry timers
  reconnect() {
    if (!native || !this.ready) return;
    if (!this.rewardedLoaded) this.loadRewarded();
    if (!this.interstitialLoaded) this.loadInterstitial();
    if (this.wantBanner && !this.bannerOn) {
      clearTimeout(this.bannerRetry);
      this.bannerFails = 0;
      this.showBanner();
    }
  },

  // Resolves true only if the user earned the reward. On false, `lastFail` says why:
  // 'unavailable' (no ad to show) or 'skipped' (closed before the reward).
  async showRewarded() {
    this.lastFail = 'unavailable';
    if (this.showing) return false;
    if (!native) {
      const ok = await webFakeAd(true);
      if (!ok) this.lastFail = 'skipped';
      return ok;
    }
    // a tap right after launch can land while consent / SDK start-up is still running
    if (!this.ready && this.initPromise) await this.initPromise;
    if (!this.ready) return false;
    if (!this.rewardedLoaded) {
      await this.loadRewarded();
      if (!this.rewardedLoaded) return false;
    }
    this.showing = true;
    this.onPause();
    let earned = false;
    const handles = [];
    try {
      // the plugin resolves showRewardVideoAd only when the reward is earned; closing early
      // just fires Dismissed. The timeout guarantees the game never stays paused.
      let shown = false;
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 150000);
        const done = () => { clearTimeout(t); resolve(); };
        AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; }).then((h) => handles.push(h));
        AdMob.addListener(RewardAdPluginEvents.Showed, () => { shown = true; }).then((h) => handles.push(h));
        AdMob.addListener(RewardAdPluginEvents.Dismissed, done).then((h) => handles.push(h));
        AdMob.addListener(RewardAdPluginEvents.FailedToShow, done).then((h) => handles.push(h));
        AdMob.showRewardVideoAd().then((item) => { if (item) earned = true; }).catch(done);
      });
      if (!earned && shown) this.lastFail = 'skipped';
    } finally {
      handles.forEach((h) => h.remove());
      this.rewardedLoaded = false;
      this.showing = false;
      this.onResume();
      this.loadRewarded();
    }
    return earned;
  },

  // Shows an interstitial at a natural break if one is loaded and the frequency cap allows it.
  // Resolves when the ad is closed (or right away when none is shown).
  async maybeInterstitial() {
    const now = Date.now() / 1000;
    if (now - this.lastInterstitial < ADS.interstitialMinGapSec) return false;
    if (!native) return false;
    if (!this.ready || !this.interstitialLoaded || this.showing) return false;
    this.lastInterstitial = now;
    writeLast(now);
    this.showing = true;
    this.onPause();
    const handles = [];
    try {
      // showInterstitial() resolves as soon as the ad opens, so wait for it to be closed
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 120000);
        const done = () => { clearTimeout(t); resolve(); };
        AdMob.addListener(InterstitialAdPluginEvents.Dismissed, done).then((h) => handles.push(h));
        AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, done).then((h) => handles.push(h));
        AdMob.showInterstitial().catch(done);
      });
    } finally {
      handles.forEach((h) => h.remove());
      this.showing = false;
      this.interstitialLoaded = false;
      this.onResume();
      this.loadInterstitial();
    }
    return true;
  },

  // Bottom banner (adaptive width). Safe to call repeatedly; waits for consent / SDK start-up.
  async showBanner() {
    if (!native || !ADS.bannerEnabled) return;
    this.wantBanner = true;
    if (this.initPromise) await this.initPromise;
    if (!this.ready || this.bannerOn) return;
    if (!ADS.testMode && ADS.bannerId.includes('XXXX')) return; // no real banner unit configured yet
    this.bannerOn = true;
    this.bannerStatus = 'loading';
    try {
      await AdMob.showBanner({ adId: ids.banner, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: ADS.testMode });
    } catch (e) {
      this.bannerOn = false;
      this.bannerStatus = 'error';
      console.warn('AdMob banner failed', e);
    }
  },

  // Called from settings: lets users change their consent choice (GDPR requirement)
  async showPrivacyOptions() {
    if (!native || !AdMob) return;
    try { await AdMob.showPrivacyOptionsForm(); } catch { /* ignore */ }
  },

  markRewardWatched() {
    // don't fire an interstitial right after the user just watched a rewarded ad
    this.lastInterstitial = Math.max(this.lastInterstitial, Date.now() / 1000 - ADS.interstitialMinGapSec + 60);
    writeLast(this.lastInterstitial);
  },
};

function webFakeAd(rewarded) {
  return new Promise((resolve) => {
    Ads.showing = true;
    Ads.onPause();
    const el = document.createElement('div');
    el.className = 'fake-ad';
    let left = 3;
    el.innerHTML = `<div class="fake-ad-card"><div class="fake-ad-tag">TEST AD</div><div class="fake-ad-title">Rewarded video</div>
      <div class="fake-ad-sub">On Android this is a real AdMob ad.</div><div class="fake-ad-count">${left}</div>
      <button class="fake-ad-close">✕</button></div>`;
    document.body.appendChild(el);
    const count = el.querySelector('.fake-ad-count');
    const done = (ok) => {
      clearInterval(iv);
      el.remove();
      Ads.showing = false;
      Ads.onResume();
      resolve(ok);
    };
    const iv = setInterval(() => {
      left--;
      count.textContent = left > 0 ? left : '✓';
      if (left <= 0) done(rewarded);
    }, 1000);
    el.querySelector('.fake-ad-close').onclick = () => done(false);
  });
}
