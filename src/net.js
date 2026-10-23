// The game needs the internet (ads pay for it). Opening it offline, or losing the connection while
// playing, shows a full-screen "Internet is off" card that blocks the game until the phone is back
// online: it checks again by itself every few seconds, and on "Try again".
// navigator.onLine notices airplane mode and switched-off Wi-Fi / mobile data at once; a tiny request
// also catches Wi-Fi without internet. Two independent hosts, so one being down isn't an outage.

const PROBES = ['https://www.gstatic.com/generate_204', 'https://critter-ranch-tycoon.vercel.app/app-ads.txt'];
const RETRY_SEC = 4; // while blocked
const WATCH_SEC = 45; // while playing

async function reachable(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    await fetch(`${url}?t=${Date.now()}`, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

const $ = (s) => document.getElementById(s);

export const Net = {
  blocked: false,
  checking: false,
  waiters: [],
  onChange: () => {}, // (online) the game pauses while blocked

  async check(ms = 6000) {
    if (navigator.onLine === false) return false;
    for (const url of PROBES) if (await reachable(url, ms)) return true;
    return false;
  },

  start() {
    $('btn-net-retry').addEventListener('click', () => this.retry(true));
    window.addEventListener('offline', () => this.setBlocked(true));
    window.addEventListener('online', () => { if (this.blocked) this.retry(); });
    setInterval(() => { if (!document.hidden && !this.blocked) this.verify(); }, WATCH_SEC * 1000);
  },

  // At start-up: resolves once the phone is online; the block screen shows until then
  waitOnline() {
    return new Promise((resolve) => {
      this.check().then((ok) => {
        if (ok && !this.blocked) { resolve(); return; }
        this.waiters.push(resolve);
        this.setBlocked(true);
      });
    });
  },

  // The connection may have dropped (back from the background, the periodic check): block only if it
  // really did, and give one slow answer a second chance
  async verify() {
    if (this.blocked || this.checking) return;
    this.checking = true;
    let ok = await this.check();
    if (!ok && navigator.onLine !== false) ok = await this.check(8000);
    this.checking = false;
    if (!ok) this.setBlocked(true);
  },

  async retry(manual = false) {
    if (this.checking) return;
    this.checking = true;
    $('net-status').textContent = 'Checking…';
    const ok = await this.check(5000);
    this.checking = false;
    if (ok) { this.setBlocked(false); return; }
    $('net-status').textContent = manual ? 'Still no internet. Check Wi-Fi or mobile data.' : '';
  },

  setBlocked(on) {
    if (on === this.blocked) return;
    this.blocked = on;
    $('net-block').classList.toggle('show', on);
    $('net-status').textContent = '';
    clearInterval(this.retryTimer);
    if (on) this.retryTimer = setInterval(() => this.retry(), RETRY_SEC * 1000);
    else this.waiters.splice(0).forEach((r) => r());
    this.onChange(!on);
  },
};
