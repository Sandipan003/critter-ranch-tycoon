# Credits & licences

Everything below is free for commercial use in this game (Google Play, with ads), with no attribution required.
We credit the authors anyway.

## 3D characters

### Kenney: Mini Characters 1.0
- **Used for:** the player, helpers and customers
- **Author:** Kenney (www.kenney.nl)
- **Source:** https://kenney.nl/assets/mini-characters (`kenney_mini-characters.zip`, 2.4 MB, downloaded 2026-10-15)
- **Licence:** Creative Commons Zero (CC0 1.0), public domain: https://creativecommons.org/publicdomain/zero/1.0/
  Copy: [`assets-src/kenney-mini-characters/License.txt`](assets-src/kenney-mini-characters/License.txt)
- **Files used:** `Models/GLB format/character-{female,male}-{a…f}.glb` and `Textures/colormap.png`

### Quaternius: Ultimate Monsters
- **Used for:** all 20 critter species, both wild and in the pens:

  | World | Species → model |
  |---|---|
  | 🌼 Sunny Meadow | Bloop → Blob/`Fish` · Sproutle → Blob/`Cactoro` · Zapchick → Blob/`Chicken` · Emberpup → Blob/`Dog` · Frostail → Blob/`Yeti` · Shadowolf → Big/`BlueDemon` · Rockhorn → Big/`Dino` · Mossgolem → Big/`MushroomKing` |
  | ❄️ Frosty Peaks | Frostcap → Blob/`Mushnub` · Puffling → Blob/`Birb` · Duskwing → Flying/`Glub` · Snowhop → Big/`Bunny` · Yetiburr → Big/`Yeti` · Frostwisp → Flying/`Ghost` |
  | 🌋 Ember Canyon | Cindercat → Blob/`Cat` · Buzzspark → Flying/`Armabee` · Magmatoad → Big/`Frog` · Impyre → Flying/`Demon` · Sunlord → Flying/`Alpaking` · Pyrodrake → Flying/`Dragon` |

- **Author:** Quaternius (https://quaternius.com)
- **Source (Sunny Meadow models):** https://quaternius.com/packs/ultimatemonsters.html, which links to a Google Drive folder.
  We downloaded those 8 glTF files plus `Atlas_Monsters.png` and `License.txt` on 2026-10-15. The files are dated 20–21 Nov 2023.
- **Source (Frosty Peaks and Ember Canyon models):** the same pack's models as published by Quaternius on Poly Pizza, each page
  marked **CC0 1.0** (downloaded 2026-10-16 as `.glb`, because the Drive folder had hit its daily download quota):
  [Mushnub](https://poly.pizza/m/LWKmS30Xxl), [Birb](https://poly.pizza/m/gZ2ExU9OAB), [Glub](https://poly.pizza/m/x59pqJscry),
  [Bunny](https://poly.pizza/m/irZjWFARyl), [Yeti](https://poly.pizza/m/ceRHrn8HHE), [Ghost](https://poly.pizza/m/Iip30bDHmu),
  [Cat](https://poly.pizza/m/2f54vbV0In), [Armabee](https://poly.pizza/m/42djT5zJnx), [Frog](https://poly.pizza/m/37wofOCOzG),
  [Demon](https://poly.pizza/m/Mo2ky6vkf8), [Alpaking](https://poly.pizza/m/AQ8zbFoDln), [Dragon](https://poly.pizza/m/3rUm1cN3yp).
- **Licence:** CC0 1.0 (public domain). The pack page lists it, and so does the bundled licence file:
  [`assets-src/quaternius-ultimate-monsters/License.txt`](assets-src/quaternius-ultimate-monsters/License.txt).
  (That file's header says "Ultimate Platformer Pack" because Quaternius reuses one licence text across packs. The licence itself is CC0.)
- **Note:** since 28 Aug 2026 Quaternius publishes *new* content under the "Quaternius Asset License v1.0".
  That licence also allows commercial games with no attribution, but it forbids re-sharing the raw asset files on their own.
  This pack was released and downloaded as CC0, so that restriction doesn't apply here. If you add newer Quaternius packs later,
  keep their raw files out of any public repository.

### What we changed
`npm run models` ([`scripts/build-models.mjs`](scripts/build-models.mjs)) converts the files in `assets-src/` into `public/models/*.glb`:
- bakes the palette textures (or flat material colours) into vertex colours
- drops the Bunny's held carrot
- recolours the player's hair red (`char-player`)
- brightens the monster palette
- merges each character into a single skinned mesh
- keeps and renames only the animation clips the game uses
- meshopt-compresses the result

## Code, fonts and tools
- **three.js** (MIT): rendering, GLTFLoader, SkeletonUtils. It also ships the meshoptimizer decoder (MIT).
- **Fredoka** font (SIL Open Font License 1.1), via `@fontsource/fredoka`
- **Capacitor** (MIT) and **@capacitor-community/admob** (MIT)
- **glTF Transform** (MIT) and **meshoptimizer** (MIT): build-time model conversion only, not shipped in the app

The critter names, game name and gameplay code are original to this project.
