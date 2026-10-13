# Soboscuba

A recreation of [sobosuba](https://store.steampowered.com/app/1946560/sobosuba/) for mobile: a squishy physics merge puzzle that runs on **iPhone/iPad** and **PC** (Windows, macOS, Linux).

Pull back to fling squishy numbered sobos into a black tank. Two equal sobos that touch merge into the next number (1 + 1 = 2, 2 + 2 = 4 … up to 16k and beyond). A grey pressure pad bulges out of each side wall, a third of the way down. When the pile presses a pad too hard, that pad's bar on the tank lid fills up. Left alone, the bar slowly drains. A full bar ends the game. Merging makes room.

The look follows the original: flat sobos with a blocky number font, a tank with cut bottom corners, the next sobos lined up beside the launcher, and (on a wide screen) the name and score standing on end either side of the tank.

## How to play

| Action | Touch (iOS) | PC |
|---|---|---|
| Aim and fling | Drag back from anywhere, release | Click-drag back, release |
| Gentle drop | Tap | Click, or <kbd>Space</kbd> / <kbd>↓</kbd> / <kbd>Enter</kbd> |
| Pause | ☰ button (top left) | ☰ button, <kbd>Esc</kbd> or <kbd>P</kbd> |

- Pull further for a harder shot. Hard shots shove the pile around; soft shots place precisely.
- A white arrow shows the shot's direction and power.
- Sobos fresh from the launcher have a tinted number. Sobos made by a merge have a black one.
- Merges within 1.4 s of each other build a combo multiplier.
- Sobos can merge in mid-air.
- Your game saves automatically. Leave and come back, and **Continue** picks up where you left off. Your best score is kept too.
- The first game shows a short animated tutorial.
- On a phone, play upright. Turning it sideways pauses the game until you turn it back.

## Achievements and colour themes

Thirteen achievements, shown in a pop-up as you earn them. The default theme is **Dark**: a near-black tank with deep, rich sobo colours. Five achievements unlock extra colour themes, which you pick under **Awards & themes** on the title screen or pause menu.

| Achievement | How to earn it | Unlocks |
|---|---|---|
| First squish | Merge two sobos | |
| Getting chunky | Make a 128 | |
| Big wobbler | Make a 512 | Sunset theme |
| Tank boss | Make a 2k | Ocean theme |
| Leviathan | Make an 8k | |
| Chain reaction | Combo ×3 | |
| Cascade | Combo ×5 | Candy theme |
| Bullseye | Merge a sobo with the first sobo it touches | |
| Bank shot | Bounce off a wall straight into a merge | |
| Close call | Ease off a pressure pad when its bar is nearly full | |
| Five figures | Score 10,000 | Neon theme |
| Deep diver | Score 25,000 | Paper theme |
| Abyssal | Score 100,000 | |

Sound and vibration can be switched off in the pause menu. Vibration uses the native haptics engine in the iOS app. Safari on iPhone doesn't allow web pages to vibrate, so the home-screen version has sound only.

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
  js/physics.js       soft-body engine: particle rings, shape matching, spatial hash
  js/audio.js         generated sound effects (WebAudio, no audio files)
  js/game.js          slingshot input, merging, scoring, rendering, save/resume
  sw.js               offline cache for the installed app
  manifest.webmanifest
  fonts/ icons/
tools/
  serve.js            zero-dependency dev server (npm start)
  build-single.js     one-file bundle (npm run build:single)
  make_icons.py       regenerates the icons (needs Pillow)
capacitor.config.json native iOS wrapper settings
.github/workflows/pages.yml  GitHub Pages deploy
```

## How the physics works

Like the original, each blob is a closed ring of small circular particles rather than one rigid circle. That is what makes the pile squish and wobble. Each frame runs 8 substeps:

1. **Verlet integration** moves every particle under gravity with light damping.
2. **A soft body** holds each ring together with three gentle forces:
   - **Shape matching** pulls weakly toward the blob's best-fit rest circle, so it slowly recovers its shape.
   - **Pressure** gently pushes the enclosed area back toward its rest size. It is deliberately weak, so a squashed blob gives a little volume and packs into the gaps around it with flat faces where it meets its neighbours.
   - **Smoothing** keeps the outline free of lumps.

   The result is jelly-like: blobs squash hard when they land, wobble back and forth before settling, sag into flat-bottomed shapes and mould into the gaps around them. Bigger blobs are softer.
3. **Collisions** resolve particle-vs-particle contacts between different blobs (with friction) and particle contacts with the walls, the cut corners and the pressure-pad domes. A uniform spatial hash keeps this fast.

A few extra rules make it feel like jelly rather than rubber:

- **Contact damping.** While touching something, a blob's rebound and spin are lightly damped, so shots land close to where they are aimed instead of bouncing and rolling away.
- **Pressure pads.** Each pad is a circular dome that particles collide with. The physics adds up how far particles push into it each frame. The game caps that reading and smooths it over half a second, so one hard hit doesn't count. A pad pressed past its limit fills its bar on the lid, and the pad sinks a few pixels into the wall under load.
- **Skin.** Neighbouring ring particles can't drift too far apart, so small blobs can't slip through a ring into a big one.
- **Merge tolerance.** Equal blobs wedged a hair apart still merge, because they look like they're touching.
- **Peanut start.** Merged blobs start from their two parents' outline and inflate into a circle. A safety pass separates any ring that does end up inside another.

A crowded tank (about 600 particles) simulates in roughly 2 ms per frame on a laptop.

## Credits

Inspired by *sobosuba* by keepeetron. Soboscuba is an independent fan recreation with its own code and art. Fonts: Audiowide and Nunito (SIL Open Font License).
