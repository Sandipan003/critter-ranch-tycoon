# Google Play store listing: Critter Ranch Tycoon

Copy these into **Play Console → Grow users → Store presence → Main store listing**.
The character limits are Play's. The counts are checked by `python3` (see the bottom of this file).

## App name (30 max)
```
Critter Ranch Tycoon
```

## Short description (80 max)
```
Catch cute critters, sell them on the conveyor belt and grow your ranch!
```

## Full description (4000 max)
```
Welcome to your very own critter ranch! 🐾

Stand on the balcony, throw capsules at the wild critters roaming the field, and stack your catches high on your back. Drop them onto the conveyor belt, where happy customers line up to buy them, then collect the coins and grow your ranch.

🎯 CATCH CRITTERS
Twenty cute species to catch, from tiny Bloops and Sproutles to the mighty Pyrodrake dragon. Higher-level critters are tougher to catch but sell for much more, and rare ★ Golden critters are worth five times as much!

📦 SELL ON THE CONVEYOR
Load your catches onto the belt and watch customers snap them up. Coins ride back to you on the belt. Unlock an express belt and a second shop counter to sell even faster.

🏡 BUILD YOUR RANCH
Unlock pens with giant critters that produce coins all day long. Feed them capsules for a bonus! Hire helpers who catch and deliver critters for you, buy new pastures and balcony wings to make your ranch bigger and bigger, and open the Wild Grove to find rare high-level critters.

🗺️ EXPLORE NEW WORLDS
Finish your ranch in the Sunny Meadow, then travel to the snowy Frosty Peaks, the fiery Ember Canyon, the Sunbaked Dunes, Twilight Woods, Candy Hills and beyond. The worlds never end: every one is a brand-new ranch with tougher critters, new pens and much bigger rewards, and the Golden Crown awaits the best ranchers!

⬆️ UPGRADE EVERYTHING
Bigger backpack, faster throws, stronger capsules, quicker running, better prices, well-fed pens and trained helpers. Some upgrades never max out, so there is always something to spend your coins on.

🏥 DOCTOR DECK
Some wild critters are hurt! Bring them to your clinic, where the doctor nurses them back to health on cosy beds. Healed critters are worth triple coins.

🍦 SNACK STAND & 🚚 VIP TRUCKS
Your snack stand sells ice cream to the customers waiting in line. Every few minutes a VIP truck pulls up with a special order: fill it in time for a giant payday!

🎡 LUCKY WHEEL
Spin the Lucky Wheel for free coins, boosts and the golden jackpot.

👑 BOSSES, EVENTS & MISSIONS
Giant boss critters storm the field: hit them with capsules before they escape for a huge reward! Surprise events like Critter Stampede, Golden Hour and Rush Hour keep every session fresh. Complete missions, collect your daily reward streak, and fill your Critterdex to boost your coins forever.

😴 EARN WHILE YOU'RE AWAY
Your pens, helpers and snack stand keep working while you're away, so there are coins waiting when you come back.

✨ FEATURES
• Simple one-thumb controls: just move, and catching happens automatically
• Relaxing, satisfying arcade-idle gameplay
• Cute, colourful 3D world with animated characters
• Short sessions or long play, it's up to you
• Pick your own rancher name and avatar
• Runs smoothly on older phones with the Low graphics setting
• Daily rewards, missions, boss fights and surprise events
• Optional bonus rewards: watch a short ad for extra coins, double income or a guaranteed catch

Critter Ranch Tycoon is free to play and contains ads. Watching ads is always optional. An internet connection is required.
```

## Categorisation
- **App category:** Game → **Casual**
- **Tags (pick up to 5):** Idle, Casual, Simulation, Arcade (not "Offline": since v1.0.9 the game needs the internet)

## Contact details
- **Email:** sarkarsandipan423@gmail.com
- **Website:** https://critter-ranch-tycoon.vercel.app
- **Privacy policy:** https://critter-ranch-tycoon.vercel.app/privacy-policy

## Graphics
| Asset | File | Play requirement |
|---|---|---|
| App icon | `store-assets/icon-512.png` | 512×512 PNG |
| Feature graphic | `store-assets/feature-graphic-1024x500.png` | 1024×500 |
| Phone screenshots | `store-assets/screenshots/01-catch.png` … `05-pen-ember.png` | 2–8 shots, 9:16; these are 1080×1920 |

The screenshots are in-game captures from the Pixel_8 emulator. To retake them, see the hand-over notes for the CDP/`wm size 1080x1920` method.

<!-- Character counts: python3 -c "import re;t=open('docs/STORE_LISTING.md').read();b=re.findall(r'```\n(.*?)```',t,re.S);print([len(x.strip()) for x in b])" -->
