# Soboscuba

A recreation of [sobosuba](https://store.steampowered.com/app/1946560/sobosuba/) for mobile: a squishy physics merge puzzle that runs on **iPhone/iPad** and **PC** (Windows, macOS, Linux).

Squishy numbered sobos float in through both side walls and wait on a bar near the top of the field.
Pick one, drag the way you want it to fly, and let go.
Two equal sobos that touch merge into the next number (1 + 1 = 2, 2 + 2 = 4, and on up).
A bumper sits in each side wall.
If the pile ever shoves both bumpers all the way out at the same time, the game is over.

The rules, sizes, physics constants and colours follow the original game closely.
They were taken from the original's own code and checked against it running headless in the Godot engine (see `docs/original-spec.md`).

## How to play

| Action | Touch (iOS) | PC |
|---|---|---|
| Aim | Touch a sobo on the bar and drag | Left click a sobo on the bar and drag |
| Launch | Let go | Release the button |
| Cancel a shot | Drag back to the sobo | Right click |
| Pause | ☰ button (top left) | ☰ button, <kbd>Esc</kbd> or <kbd>P</kbd> |
| Mute | Pause menu | <kbd>M</kbd> |
| Next unlocked theme | Awards & themes | <kbd>K</kbd> |
| Dark or light mode | Awards & themes | <kbd>L</kbd> |

- The shot goes the way you drag, and a longer drag shoots harder (full power at 220 px).
- New sobos have a faint number. Sobos made by a merge have a solid one, and only those count toward your score.
- Your score is the total of every merge-made sobo still in play, so it grows as you build big sobos.
- Bigger sobos join the spawn pool as you merge: a 2 after your first merge into 2, a 4 after three merges into 4, and so on.
- A side stops spawning while sobos block its opening. The bar along the top of the frame shows each side's clear distance.
- If both sides are blocked and the bar is empty for 3 seconds, both sides spawn at once.
- The gauges in the side walls show how far each bumper is pushed, and turn red when one is pushed all the way.
- A phone gets a tall field and a big screen gets the original's wider one, chosen when a game starts.
- Your game saves automatically. Leave and come back, and **Continue** picks up where you left off. A lost game cannot be resumed.
- On a phone, play upright. Turning it sideways pauses the game until you turn it back.

## Achievements and colour themes

All 30 of the original's achievements are here, from "score 0" to "chain from 512 to 4096" and "praise the suncle".
Each one you earn gives one theme unlock.
All 28 of the original's colour themes are included. Dark mode, the default, and light mode are free, and the other 26 each cost one unlock.
Pick them under **Awards & themes** on the title screen or pause menu.

Sound and vibration can be switched off in the pause menu.
Vibration uses the native haptics engine in the iOS app.
Safari on iPhone doesn't allow web pages to vibrate, so the home-screen version has sound only.

## Run it on PC

There is nothing to install or build.

- **Quickest:** double-click `www/index.html`. It opens in your browser and plays.
- **Local server** (recommended, and it lets your phone connect too). Requires [Node.js](https://nodejs.org):
  ```sh
  npm start            # serves www/ on http://localhost:8080
  ```
  The terminal also prints a `http://192.168.x.x:8080` address. Open that on an iPhone on the same Wi-Fi to play there.
- **As a desktop app:** when the game is served over HTTPS (see GitHub Pages below), Chrome or Edge offer **Install app** in the address bar. You then get a standalone window that works offline.
- **One file:** `npm run build:single` writes `dist/soboscuba.html`, the whole game in one file you can copy anywhere.

## Run it on iOS

### Option A: home-screen web app (free, no Mac needed)

1. Host the game over HTTPS. The included GitHub Actions workflow does this for you:
   - On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
   - Push to `main`. The *Deploy to GitHub Pages* workflow publishes `www/` to `https://<your-user>.github.io/<repo>/`.
2. On the iPhone, open that URL in **Safari**, tap **Share → Add to Home Screen**.
3. Launch it from the home screen. It runs full-screen with no browser bars, respects the notch and home indicator, and works offline after the first load.

### Option B: native iOS app with Capacitor (App Store or TestFlight)

This wraps the same web game in a native iOS app. It needs a Mac with Xcode, and an Apple Developer account to put it on the App Store or TestFlight.

```sh
npm install          # includes @capacitor/haptics for native vibration
npx cap add ios      # creates the ios/ Xcode project (first time only)
npx cap sync ios     # copies www/ into the app; run again after every change
npx cap open ios     # opens Xcode, then press Run
```

In Xcode, set your signing team under **Signing & Capabilities**. To lock the app to portrait, untick the landscape orientations in the target's **General** settings. Use `www/icons/icon-1024.png` as the App Store icon.

## Project layout

```
www/                  the game (this folder is what gets deployed)
  index.html          page shell, menus, iOS/PWA meta tags
  css/style.css       menu styling
  js/physics.js       soft-body engine: suba rings, skin and area springs, mass balls, contacts, merges
  js/mode.js          classic rules: spawning, the bar, aiming, bumpers, score, save state
  js/achievements.js  the 30 achievements
  js/styles.js        the 28 colour themes (generated by tools/gen-styles.py)
  js/render.js        camera and all canvas drawing
  js/audio.js         generated sound effects (WebAudio, no audio files)
  js/game.js          app shell: menus, themes, save and resume, input, main loop
  sw.js               offline cache for the installed app
  manifest.webmanifest
  fonts/ icons/
docs/
  original-spec.md    the original game's rules and constants, with sources
  rebuild-plan.md     how this version is built
tests/
  node/               headless rule and physics tests
  e2e/                browser tests that play with real mouse and touch input
tools/
  serve.js            zero-dependency dev server (npm start)
  build-single.js     one-file bundle (npm run build:single)
  gen-styles.py       regenerates js/styles.js from the spec (npm run styles)
  make_icons.py       regenerates the icons (needs Pillow)
capacitor.config.json native iOS wrapper settings
.github/workflows/pages.yml  GitHub Pages deploy
```

## Tests

```sh
npm test             # everything
npm run test:node    # rules and physics, no browser
npm run test:e2e     # browser tests (needs Playwright and Chromium)
```

See `tests/README.md` for what each test checks.

## How the physics works

As in the original, each sobo is a ring of small circles called subas, 12 px in radius, 16 px apart.
Every physics tick (60 per second, 4 substeps each):

1. **Gravity** of 150 px/s² and light damping move every suba.
2. **Skin.** Each pair of neighbouring subas is joined by a spring that only pulls when stretched, so a ring can crumple but not tear.
3. **Area pressure** pushes the ring back toward its rest area when squashed.
4. **A hidden mass ball** at each sobo's centre carries most of its weight and is tied to the ring by a spring, which gives the slow, heavy wobble.
5. **Contacts** between subas of different sobos, and with the walls and bumpers, are frictionless and do not bounce.

Sobos on the bar are held up by a spring toward the bar line and nudged toward the middle.
A merge builds the new ring from both old outlines and sends out a shockwave that kicks nearby sobos.
The bumpers are springs that the pile can push 32 px into the wall.

A crowded field of about 500 subas simulates in roughly 3 ms per tick on a laptop.

## Credits

Inspired by *sobosuba* by keepeetron. Soboscuba is an independent fan recreation with its own code.
Fonts: souba score and souba text by keepee (CC0 public domain, see `www/fonts/SOUBA-FONTS.txt`), Audiowide and Nunito (SIL Open Font License).
