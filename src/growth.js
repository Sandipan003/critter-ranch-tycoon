import { Capacitor, registerPlugin } from '@capacitor/core';

// Word of mouth (GrowthPlugin.java): inviting friends through the Android share sheet, the game's Play
// Store page, and Google Play's in-app review card at a happy moment.
// - The shared link carries utm tags, so those installs show up in Play Console under acquisition
//   reports → third-party referrers ("friend_invite").
// - Play decides whether the review card appears (a few times a year at most) and never says whether
//   the player rated. Rewards for rating aren't allowed, so there are none; sharing may be rewarded.
const native = Capacitor.isNativePlatform();
const Plugin = native ? registerPlugin('Growth') : null;
const APP_ID = 'com.critterranch.tycoon';
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${APP_ID}`;
const SHARE_URL = `${PLAY_URL}&referrer=${encodeURIComponent('utm_source=friend_invite&utm_medium=in_game')}`;
const DAY = 86400000;

export const Growth = {
  // the share sheet, Play Store or review card is in front: leaving the game for it isn't a real "away"
  busy: false,

  hold(sec) {
    this.busy = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.busy = false; }, sec * 1000);
  },

  // resolves true once the share sheet opened (or, in a browser, the link was shared or copied)
  async share(text) {
    const msg = `${text}\n${SHARE_URL}`;
    if (native) {
      this.hold(120);
      try { await Plugin.share({ text: msg, title: 'Invite friends' }); return true; } catch { this.busy = false; return false; }
    }
    try {
      if (navigator.share) await navigator.share({ text: msg });
      else await navigator.clipboard.writeText(msg);
      return true;
    } catch {
      return false;
    }
  },

  openStore() {
    if (!native) { window.open(PLAY_URL, '_blank'); return; }
    this.hold(120);
    Plugin.openStore({ id: APP_ID }).catch(() => { this.busy = false; });
  },

  // After a happy moment, for players who have come back and played a while; at most every 4 days
  // from here, and Play limits it further.
  maybeReview(game) {
    const s = game.state;
    const r = s.review || (s.review = { last: 0, n: 0 });
    if (!native || !s.tutorialDone || (s.sessions || 0) < 2 || s.stats.caught < 150) return;
    if (Date.now() - r.last < 4 * DAY || r.n >= 6) return;
    r.last = Date.now();
    r.n++;
    game.save();
    this.hold(45);
    Plugin.requestReview().catch(() => {}).finally(() => setTimeout(() => { this.busy = false; }, 1500));
  },
};
