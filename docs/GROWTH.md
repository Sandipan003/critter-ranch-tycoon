# Growing Critter Ranch Tycoon

## Where the game stands (Play Console, 2 Nov 2026)
| Number | Value | What it means |
|---|---|---|
| Store listing visitors (since launch) | 17 | Almost nobody finds the game yet |
| Store listing conversion | 70.6% | Excellent: most people who see the page install |
| DAU/MAU (daily ÷ monthly players) | 20–24% | About twice the peers' median (~10%): players come back |
| Players' country | 100% India | Hindi listing and Indian ad targeting pay off first |
| Ratings | none yet | Hurts search ranking and the listing |

**The game and the listing work; the problem is visibility.** Everything below brings more people
to the store page. Do the free steps first, then spend.

## 1. This week in Play Console (free, about 30 minutes)
1. **Main store listing**: paste the new name, short and full description from
   [STORE_LISTING.md](STORE_LISTING.md). The name `Critter Ranch: Idle Pet Tycoon` adds the words people
   search for (*idle, pet, tycoon*); search reads the name more than anything else.
2. **Hindi translation**: Manage translations → add Hindi (hi-IN) with the texts in STORE_LISTING.md.
3. **Screenshots**: replace the old five with the eight new captioned ones in
   `store-assets/screenshots/`, **in file-name order**. The first three show up in search results.
4. **Tags**: Idle, Simulation, Casual, Arcade (+ a tycoon/management tag if offered).
5. **Release v1.1.1** (`builds/critter-ranch-tycoon-1.1.1-release.aab`). It adds:
   - Google Play's own rating card, shown to returning players at happy moments (after a VIP order or a
     new world), and "⭐ Rate the game" in Settings. Rewards for ratings are against Play policy, so
     there are none.
   - **📣 Invite friends** (left side): Android's share sheet with the Play link, and coins for the first
     share each day. The link is tagged `utm_source=friend_invite`, so these installs show up in
     Play Console → Statistics / acquisition reports.
6. **Reply to every review** (Ratings and reviews). Answered reviews are more convincing, and people
   often raise their star rating after a reply.

## 2. Google Ads: use the Rs 20,000 offer
The offer on the dashboard is the fastest way to get real players. Open it from Play Console
(the "Grow your app with Rs 20,000 on Google Ads" card) and **read its terms first**: these offers
usually require a first amount of your own spend within a time limit before the credit is added.

Setup (Google Ads → New campaign → App promotion → Android → Critter Ranch Tycoon):
- **Goal:** app installs (volume of installs).
- **Locations:** India first: your players are there and installs are cheap. Add Indonesia,
  the Philippines or Brazil later if it works.
- **Languages:** English and Hindi.
- **Budget:** about Rs 500–700 per day, so the credit lasts 4–6 weeks. Don't change the campaign during
  its first 7–10 days: it is learning who installs.
- **Assets** (the more, the better Google can mix them):
  - Images: the 8 screenshots and `store-assets/feature-graphic-1024x500.png`.
  - Video: a 15–30 s portrait gameplay clip (see section 3); video ads usually bring more installs
    than images alone.
  - Headlines (30 max):
    ```
    Catch Cute Critters!
    Build Your Idle Pet Ranch
    Heal Pets, Earn Coins
    Relaxing Idle Tycoon Game
    Fill VIP Orders, Win Big
    ```
  - Descriptions (90 max):
    ```
    Catch adorable monsters, sell them to happy customers and grow the cutest ranch!
    A one-thumb idle tycoon: catch, sell, upgrade and explore endless worlds.
    Heal hurt critters at your Doctor Deck and sell ice cream to happy customers.
    Beat giant bosses, spin the Lucky Wheel and build your ranch empire. Free to play!
    A cosy 3D idle game with new pets, worlds and upgrades to unlock every day.
    ```
- **Link Google Ads to AdMob** (AdMob → Settings → Linked services). Later you can switch the goal to
  players who watch ads, so the campaign pays for itself.
- **Watch:** cost per install (Google Ads) against what each player earns in ads (AdMob → Reports →
  ARPDAU). While a player earns more than they cost, scale up.

## 3. Free traffic: short videos
Arcade-idle games spread through satisfying clips. Post 3–4 a week on YouTube Shorts and Instagram
Reels (Moj and Josh work well in India too). Keep each one 10–25 s, portrait, with the hook in the
first second:
- a giant stack of capsules sliding onto the belt, coins flying back
- a boss fight from full health to "Boss caught!"
- a VIP truck order filled at the last second, with the x4 payday
- the ranch growing from an empty deck to the full ranch (fast-forward)
- healing critters at the Doctor Deck

Put the Play link in the bio or pinned comment, tagged per channel, so Play Console shows which
one works:
```
https://play.google.com/store/apps/details?id=com.critterranch.tycoon&referrer=utm_source%3Dyoutube%26utm_medium%3Dshorts
https://play.google.com/store/apps/details?id=com.critterranch.tycoon&referrer=utm_source%3Dinstagram%26utm_medium%3Dreels
https://play.google.com/store/apps/details?id=com.critterranch.tycoon&referrer=utm_source%3Dwhatsapp%26utm_medium%3Dgroups
```
Upload the best clip to YouTube and add it as the **promo video** of the store listing too: it plays at
the top of the page.

## 4. Later, once traffic grows
- **Store listing experiments** (Grow users → Store listing experiments): A/B test the icon and the
  first screenshot when you have about 100+ visitors a day; with fewer, a test takes too long.
- **Promotional content** (Grow users → Promotional content): announce each content update as an event,
  for example a "Doctor Deck update", if your app is eligible. Events can appear on Play's
  Games home and in search.
- **Keep updating every 2–4 weeks**: fresh releases with new content keep players and help ranking.
  Write the release notes for players (what's new and fun), not as a changelog.
- **Android vitals** (Monitor and improve): keep the crash and ANR rates low; Play ranks
  games with bad vitals lower.
