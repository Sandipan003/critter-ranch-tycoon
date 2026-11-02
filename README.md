# Critter Ranch Tycoon

A 3D arcade-idle "catch & sell" game for Android, inspired by the gameplay loop in the reference video.
The critters, name and art are original, so the game can be published without copying anyone's IP.

**Loop:** stand on the footprints → throw capsules at wild critters → they stack on your back →
drop them on the conveyor → customers buy them → coins ride back on the belt → collect coins →
unlock pens, helpers, faster belts and the far field → upgrade everything → travel to the next world.

**Worlds (endless):** 🌼 Sunny Meadow (critters Lv.1–5) → ❄️ Frosty Peaks (Lv.6–10, prices and rewards x6) →
🌋 Ember Canyon (Lv.11–15, x36) → then generated worlds forever: 🏜️ Sunbaked Dunes, 🌙 Twilight Woods, 🍭 Candy Hills,
then the cycle repeats as "Sunny Meadow II" and so on. Each new world is +5 critter levels and x5 prices and rewards, with lower
catch chance and faster critters (`makeWorld` in `src/world/worlds.js`). Each world is its own run from 0 coins, with its own
look, critters, coins, pens, helpers, unlock chain and upgrades; only ranch level, profile and stats carry over.
**Growing the ranch with coins:** two pastures (deck section + pen) and two balcony wings (each with an extra helper)
per world, shown as greyed 🔒 tiles until their requirement is bought. A world's last unlock (🗺️) opens the next one,
the World map (HUD badge or Settings) switches between unlocked worlds, and Ember Canyon's 👑 Golden Crown doubles
all income. Better Prices and Pen Feeding have no level cap, so coins always have a use. ★ Golden critters (3%) are
worth x5 but harder to catch. Plots are in `src/world/layout.js`.

**First-time guide (v1.0.3):** new players get:
- a welcome card
- six guided steps, each with a "Step X of 6" card and the green arrow: move (animated finger), catch, sell, collect coins, first unlock, first pen
- then a "You're a rancher now!" card that explains everything else (also under Settings → ❓ How to play)

Steps a player has already done are skipped. Ad buttons, events, the daily popup and the side buttons wait until the guide is finished. One-time 💡 tips appear the first time the backpack is full and on the first upgrades pad, pen, helper, pasture and balcony. Code: `src/systems/tutorial.js`.

**Things to chase (v1.0.2):**
- 📜 **Missions:** three goals at a time (catch, sell, a certain critter, feed pens, upgrades, golden, boss). Each claimed mission is replaced by a slightly harder one that pays more. Claim, or ▶ x2 with a rewarded ad.
- 📅 **Daily reward:** a 7-day streak (day 7 pays 12x). Missing a day restarts at Day 1. ▶ x2 with a rewarded ad.
- 📖 **Critterdex:** all 20 species. Each first catch gives +2% coins forever, each golden version +1% more.
- **Field events** every 2–3 minutes after the tutorial: 🦬 Stampede, ✨ Golden Hour, 🛒 Rush Hour (x2 sale price), 🍀 Lucky Throws.
  Every third one is a 👑 **boss critter**: huge, with a health bar, can dodge capsules in later worlds, runs away after 75 s, and pays about 100x a normal critter straight to you.
- **Pause:** leaving the app pauses and saves the game. Coming back shows a pause screen, and play continues on tap (then the offline earnings popup). On Android, the back button opens Continue / Exit game.
  Code: `src/systems/progress.js` (missions, daily, Critterdex), `src/systems/events.js` (events, bosses).

**More ways to earn (v1.0.9, customers and upgrades v1.1.0):**
- 🍦 **Snack Stand** (unlock after the Express Belt): snack customers walk up from the road and line up at the counter (3 at a time, 2 on Low).
  - Each one leaves with a cone, and the coins fly onto the belt and ride to the 💰 pad. It also earns offline.
  - Upgrades: Snack Menu (+30% coins per level) and Fast Service (10% faster per level). ▶ Snack Rush gives x3 snack sales for 2 minutes.
- 🏥 **Doctor Deck** (unlock on the East Pasture deck, through a gap in its south fence): once it's built, 22% of wild critters are hurt 🩹 and come back in white capsules with a red band.
  - Drop them on the 🩺 pad. The doctor treats three at a time on the beds, and each healed critter pays x3 on the clinic's coin pad.
  - Pet owners also walk up to the clinic's south fence with a sick pet (2 at a time, 1 on Low). The pet hops over to a bed, then back into their arms when it's healed, and the owner pays like a healed critter.
  - The waiting room holds 12. Upgrades: Doctor Skill (heals 12% faster per level) and Clinic Fees (+25% clinic coins per level).
  - ▶ Heal all treats everyone at once. It shows on the 🩺 pad's panel, and as a HUD button when 3 or more are waiting.
  - The green arrow points to the clinic while you carry hurt critters.
- 🚚 **VIP truck** (once the first helper is hired, every 3–5 minutes): it parks beside the belt with an order for two kinds of critters (for example 🐧 x6 + 🐺 x3) and 3 minutes on the clock.
  - It takes those critters off the belt before the shoppers, and helpers' catches count too.
  - A filled order pays x4 their price, ▶ x2 with a video. If time runs out it pays the normal price for what it got.
- 🎡 **Lucky Wheel** (left side): one free spin every 4 hours, plus up to 8 video spins a day. Prizes are coins (1–12x the 🎁 amount, 👑 jackpot), x2 income or 100% catch.
- New missions: heal hurt critters, sell snacks, fill a VIP order.
- **Explaining it:**
  - Players who already finished the guide get a one-time 🎉 "What's new" card when they open the updated game (`NEWS` in `src/config.js`; also under Settings).
  - The Snack Stand, the Doctor Deck and the first VIP truck each show a "how it works" card the first time they appear.
  - Before the stand or the clinic is built, the Upgrades panel shows their four upgrades greyed out ("🔒 Build the … first").
- **Low-end phones:** everything is available on Low. Fewer extra customers walk around there.
  - Customers, the vendor, the doctor, patients and pen giants far from the camera (or off screen) advance their animation only every 2nd–6th frame (`animLod` in `src/game.js`).
  - The clinic's beds are one mesh.
  - Measured on the emulator in Low mode with a software GPU: a steady 30 fps cap, about 90 draw calls by the Doctor Deck.
- Code: `src/systems/clinic.js`, `snack.js`, `vip.js`, `wheel.js`. Positions are in `L.clinic` / `L.snack` / `L.vip` in `src/world/layout.js`, and balance numbers in `BAL` in `src/config.js`.

**Internet required (v1.0.9):** without a connection the game shows a full-screen "Internet is off" card (with Try again) and doesn't start.
- How it checks: `navigator.onLine` plus a tiny request to `gstatic.com/generate_204`, with the Vercel site as a fallback.
- Losing the connection mid-game freezes it behind the same card. It goes away by itself once the phone is back online, and ads that failed meanwhile reload at once.
- Code: `src/net.js`.

**Reward popups freeze the ranch (v1.0.9):** the 💤 welcome-back coins, the daily reward and the VIP reward pause the game until you collect (`'popup'` pause). The Android back button on such a popup collects instead of throwing the coins away.

**Profile:** tap the avatar (or Settings) to change the rancher name and avatar.

**Low-end phones:** Settings → Graphics (Auto / High / Low). Auto picks Low on phones with ≤2 GB RAM, ≤2 cores or an
entry-level GPU (Mali-400/T/G31–G57, Adreno 3xx–5xx/610–613, PowerVR/IMG; see `src/quality.js`), and switches to Low by
itself after slow frames. Low turns off antialiasing and the shadow pass, uses Lambert instead of PBR shading, render
scale 1 (down to 0.6), less grass and trees, fewer critters, shoppers and particles, and animates far critters less often.
That is about half the draw calls and a third of the triangles. The frame rate is capped at 60 everywhere and drops to a
steady 30 on Low phones that can't hold about 50.

**Monetisation (Google AdMob):**
- Rewarded: 🎁 free coins, 💰 x2 income (2 min), ⚡ 100% catch (45 s), ▶ free upgrade level, x3 offline earnings, x2 mission reward, x2 daily reward, 🍦 Snack Rush, 🩺 Heal all, 🚚 x2 VIP reward, 🎡 extra wheel spins
- Interstitial: after every 3rd unlock and on world travel, at most once every 4 minutes (the cap survives the
  travel reload), never within a minute of a rewarded ad. The game pauses until the ad is closed.
- Ads start loading on the title screen, ad buttons only appear when a video is ready, and a reward is given only
  when AdMob reports it as earned (closing early shows "Watch the whole video to get the reward").
- Google UMP consent form for EU/UK users, and a "Privacy options" button in Settings
- Bottom banner (adaptive) once the tutorial is done, not on ≤2 GB RAM phones. The game view shrinks to sit above it with a 6px gap, so it never covers play.
- Real ad units are used only by `npm run android:release` (Vite `release` mode); every other build shows Google test ads

**Stability (v1.0.4):**
- Floating texts free their textures, and critters and customers that leave free their skeleton bone textures. Before this, graphics memory grew every minute until the phone killed the game.
- If Android kills the WebView renderer (low memory), `MainActivity` rebuilds the screen instead of letting the app crash.
- A lost WebGL context saves and reloads straight back into the game.
- An error in one frame is logged and skipped instead of freezing the game.
- The manifest requires OpenGL ES 3.0 (needed for WebGL 2), so Play doesn't offer the game to phones that can't run it.

## Tech
- **Three.js** (WebGL). The characters are rigged, animated glTF models: Kenney *Mini Characters* for people and Quaternius *Ultimate Monsters* for critters, both CC0 (see [CREDITS.md](CREDITS.md)). The world and props are built in code.
  If a model fails to load, the game falls back to the original procedural figure for it.
- **Capacitor 8** wraps the game as a native Android app.
- **@capacitor-community/admob** uses the official Google Mobile Ads SDK.
- **Vite** for building.

## Run it on your computer
```bash
npm install
npm run dev        # open the printed URL; use mouse-drag or WASD to move
```
In a desktop browser, ads are simulated with a "TEST AD" popup. On Android, real AdMob test ads play.

## Build for Android
```bash
npm run android:debug     # → android/app/build/outputs/apk/debug/app-debug.apk (install on your phone)
npm run android:release   # → android/app/build/outputs/bundle/release/app-release.aab (upload to Play)
npm run android:open      # open in Android Studio
```
Release signing needs a one-time `zsh scripts/make-keystore.sh`.

## Character models
The raw packs live in `assets-src/`. The game loads the converted files in `public/models/` (about 0.8 MB for all 21).
After changing a source file or the clip list, rebuild them:
```bash
npm run models     # scripts/build-models.mjs → public/models/*.glb
```
The converter bakes the palette texture into vertex colours (no textures, one shared material), merges each character into a single skinned mesh, keeps only the clips the game plays, and meshopt-compresses the result.
The species → model mapping is `SPECIES[*].model` in `src/world/models.js`. The player, helper and customer models are chosen in `src/systems/player.js`, `helpers.js` and `belt.js`.

**➡️ Full Play Store + AdMob steps: [docs/PUBLISHING.md](docs/PUBLISHING.md)**

## Where things are
| Path | What |
|---|---|
| `src/config.js` | **AdMob IDs**, test mode, balance numbers, upgrade costs |
| `src/world/layout.js` | Map layout and the base unlock order and prices |
| `src/world/worlds.js` | Worlds 1–3 plus the endless world generator: themes, critter tables, pen species, multipliers, difficulty |
| `src/world/models.js` | Characters and critters (rigged model, or procedural fallback), species list, props |
| `src/world/assets.js` | Model preloading, per-instance cloning, animation crossfades |
| `src/world/environment.js` | Ground, deck, fences, trees, lighting |
| `src/systems/` | Gameplay: catching, back stack, belt and customers, pens, helpers, pads, Doctor Deck, snack stand, VIP truck, Lucky Wheel |
| `src/ads.js` | AdMob wrapper (consent, rewarded, interstitial, banner) |
| `src/net.js` | Internet check and the "Internet is off" screen |
| `src/growth.js` + `android/.../GrowthPlugin.java` | 📣 Invite friends (share sheet, tagged Play link, coins for the first share a day), ⭐ Rate the game (Play page), Google Play's in-app review card after a VIP order or a new world (returning players, at most every 4 days) |
| `docs/GROWTH.md` | How to get more players: store listing, Hindi, screenshots, Google Ads, short videos |
| `src/ui.js`, `src/styles.css` | HUD, upgrade panel, settings, offline-earnings popup |
| `tools/brand.html` + `tools/brand.js`, `scripts/apply_brand.py` | Brand art: renders the logo, app icon, splash and feature graphic from the game's 3D critters (open `/tools/brand.html` on `npm run dev`, run `brand.exportAll()` with a local receiver on :5199 writing `brand-out/` + `public/brand/`), then sizes them into Android resources and `store-assets/` |
| `scripts/build-models.mjs`, `assets-src/`, `public/models/` | Character model pipeline: sources → game-ready GLBs |
| `CREDITS.md` | Asset sources and licences |
| `store-assets/` | 512px Play icon + 1024×500 feature graphic |
| `website/` | Public site on Vercel: privacy policy, `app-ads.txt`, home page (see docs/PUBLISHING.md §5) |
