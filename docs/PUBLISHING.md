# Publishing Critter Ranch Tycoon on Google Play (with AdMob)

Follow these steps in order. Steps marked **(you)** need your own Google accounts, so only you can do them.

---

## 0. What you need

| Thing | Where | Cost |
|---|---|---|
| Google Play Developer account **(you)** | https://play.google.com/console | $25, one time |
| AdMob account **(you)** | https://apps.admob.com | free |
| A public web page for the privacy policy | GitHub Pages, Google Sites, or your own site | free |
| An Android phone for testing | — | — |

---

## 1. Decide the final name and package ID (permanent!)

The package ID is `com.critterranch.tycoon`. **You can never change it once the app is on Play.**
To use your own ID (for example `com.yourname.critterranch`), change it in all of these places **before your first upload**:

- `capacitor.config.json` → `appId`
- `android/app/build.gradle` → `namespace` and `applicationId`
- `android/app/src/main/res/values/strings.xml` → `package_name`, `custom_url_scheme`
- Move `android/app/src/main/java/com/critterranch/tycoon/MainActivity.java` to the matching folder, and update its `package` line

To change the game title, edit `GAME_NAME` in `src/config.js`, `appName` in `capacitor.config.json`, `app_name` and `title_activity_main` in `strings.xml`, and the `<title>` in `index.html`.

---

## 2. Set up AdMob **(you)**

1. In AdMob go to **Apps → Add app → Android**. Choose "No" for "Is the app listed on a supported app store?" (you'll link it after release).
2. Copy the **App ID**. It looks like `ca-app-pub-1234567890123456~1234567890`.
   Paste it into `android/app/src/main/res/values/strings.xml`:
   ```xml
   <string name="admob_app_id">ca-app-pub-YOUR_APP_ID</string>
   ```
3. Create **ad units** inside that app:
   - **Rewarded**: used for free coins, x2 income, 100% catch, free upgrades and x3 offline earnings
   - **Interstitial**: shown at most once every 4 minutes, after every 3rd unlock
   - **Banner** (optional; turned off by default so it never covers gameplay)
4. Paste the ad unit IDs into `src/config.js` (`rewardedId`, `interstitialId`, optional `bannerId`). Test mode switches itself:
   `testMode` is `import.meta.env.MODE !== 'release'`, so **only `npm run android:release` uses your real ads**.
   The browser, `npm run android:debug` and anything run from Android Studio use Google's test ads, and Settings shows "· test ads".
   ⚠️ **Never tap your own live ads.** AdMob bans accounts for that. If you install the Play Store version on your own phone,
   add it as a test device first (AdMob → Settings → Test devices).
5. **Privacy & messaging → GDPR → Create message.** Publish a consent message for the EEA/UK. The game already shows Google's consent form (UMP) on first launch, and a "Privacy options" button in Settings when it's required. Without a published message, EU users get only limited ads.
6. **app-ads.txt**: AdMob → Apps → app-ads.txt shows a line like
   `google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0`.
   It's already in `website/app-ads.txt`, which is served from your Vercel site (step 5). Enter that same site as the "Website" in your Play Store listing.

---

## 3. Create your upload key (once)

```bash
zsh scripts/make-keystore.sh
```

This creates `android/upload-key.jks` and `android/keystore.properties`. Both are git-ignored.
**Back them up (password manager + cloud drive).** If you lose them you must ask Google to reset the upload key.

---

## 4. Build the release bundle

```bash
npm install
npm run android:release
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`. This is the file you upload to Play.
It builds the web part in `release` mode (real ads) and signs with `android/keystore.properties`.
Afterwards run `npm run android:sync` so the Android project goes back to test ads for Android Studio runs.

For every new upload, increase `versionCode` (1 → 2 → 3 …) and update `versionName` in `android/app/build.gradle`.

To test on your phone first:

```bash
npm run android:debug
```

Then install `android/app/build/outputs/apk/debug/app-debug.apk`: enable USB debugging, connect the phone, and run `adb install -r` with that path. Or open the project in Android Studio with `npm run android:open` and press ▶.

---

## 5. Host the privacy policy (Vercel)

`website/` is a tiny static site: a home page, `/privacy-policy` and `/app-ads.txt`. Deploy it to Vercel's free tier:
```bash
cd website
npx vercel login      # once, with your own Vercel account
npx vercel --prod     # prints https://<project>.vercel.app
```
- **Privacy policy URL** (Play Console → App content, and the AdMob GDPR message): `https://<project>.vercel.app/privacy-policy`
- **Website** in the Play Store listing: `https://<project>.vercel.app`. AdMob reads `app-ads.txt` from there.

**Live now** (Vercel project `critter-ranch-tycoon`):
- Website: https://critter-ranch-tycoon.vercel.app
- Privacy policy: https://critter-ranch-tycoon.vercel.app/privacy-policy
- app-ads.txt: https://critter-ranch-tycoon.vercel.app/app-ads.txt

After editing anything in `website/`, run `npx vercel --prod` again. `website/.env.local` holds a Vercel token; it is gitignored and never uploaded.

---

## 6. Play Console setup **(you)**

**Create app** → App name, default language, **Game**, **Free**.

### App content (left menu → Policy → App content)
- **Privacy policy**: your hosted URL
- **Ads**: "Yes, my app contains ads"
- **App access**: "All functionality is available without special access"
- **Content rating**: fill in the IARC questionnaire. Cartoon catching, no violence or gore, no user chat, no gambling. It usually comes out as Everyone / PEGI 3.
- **Target audience**: choose **13+**. If you include under-13s, Google's Families policy applies: only certified ad networks, child-directed ad settings, and an extra review.
- **Advertising ID**: "Yes", used for "Advertising or marketing" (AdMob needs it)
- **Data safety**. Typical answers for an AdMob-only game; check them against Google's AdMob data-disclosure page:
  - Data collected and shared: **Device or other IDs**, **App interactions**, **Diagnostics / crash logs**, **Approximate location** (from IP), all used for *Advertising or marketing* and *Analytics*
  - Data is encrypted in transit: **Yes**
  - Users can request deletion: game data is local only (uninstall deletes it)

### Store listing (Grow → Store presence → Main store listing)
- **App icon**: `store-assets/icon-512.png`
- **Feature graphic**: `store-assets/feature-graphic-1024x500.png`
- **Phone screenshots**: at least 2, ideally 4–8. Take them on your phone while playing (portrait 1080×1920 or larger).
- **Short description** (≤80 chars):
  > Catch cute critters, sell them to customers and grow the coziest ranch!
- **Full description**:
  > Welcome to Critter Ranch Tycoon! 🐧🔥🌱
  >
  > Stand on your lookout, throw capture capsules and catch adorable wild critters, from tiny Lv.1 Bloops to giant Lv.5 Mossgolems. Stack them up, carry them to your conveyor belt and watch customers line up to buy them!
  >
  > 💰 Earn coins and unlock new areas of your ranch
  > 🐧 Build habitats where giant critters produce coins, even while you're away
  > 🧑‍🌾 Hire helpers who catch and deliver critters for you
  > ⚡ Upgrade your backpack, throw speed, capture power and prices
  > 🌲 Discover the Wild Grove and its rare high-level critters
  > 🎁 Watch optional videos for free coins, double income and 100% catch boosts
  >
  > Relaxing one-thumb controls, satisfying stacks and endless upgrades. How big can your ranch grow?

### Testing → Production
- **New personal developer accounts** must run a **closed test with at least 12 testers opted in for 14 days in a row** before production access is unlocked. Create a closed testing track, upload the AAB, add testers' Gmail addresses (friends or family), and share the opt-in link.
- Use **Internal testing** for quick checks; it's available immediately.
- Keep **Play App Signing** on (the default). Google holds the final signing key; you sign uploads with your upload key.
- After 14 days, apply for production in the Dashboard. Then create a production release with the same AAB (or a newer versionCode) and roll it out.

---

## 7. After launch
- In AdMob, **link the app to its Play Store listing** (Apps → App settings → Add app store details). Ads fill much better once linked and app-ads.txt is verified.
- Watch **AdMob → Reports** for eCPM and fill rate. Rewarded ads earn the most here.
- Tune `BAL` and `UPGRADES` in `src/config.js` (rewards, costs, cooldowns). Then bump `versionCode`, run `npm run android:release` and upload.
