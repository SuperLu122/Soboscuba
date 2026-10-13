# Soboscuba

A recreation of [sobosuba](https://store.steampowered.com/app/1946560/sobosuba/) for mobile: a squishy physics merge puzzle that runs on **iPhone/iPad** and **PC** (Windows, macOS, Linux).

Pull back to fling soft-body numbered blobs into an underwater tank. Two equal blobs that touch merge into the next number (2 + 2 = 4 … up to 16k and beyond). Keep the pile below the dashed line. If any blob stays over it for 3 seconds, the tank is full and the game ends.

## How to play

| Action | Touch (iOS) | PC |
|---|---|---|
| Aim and fling | Drag back from anywhere, release | Click-drag back, release |
| Gentle drop | Tap | Click, or <kbd>Space</kbd> / <kbd>↓</kbd> / <kbd>Enter</kbd> |
| Pause | ⏸ button (top left) | ⏸ button, <kbd>Esc</kbd> or <kbd>P</kbd> |

- Pull further for a harder shot. Hard shots shove the pile around; soft shots place precisely.
- A dotted line previews where the shot will go.
- Merges within 1.4 s of each other build a combo multiplier.
- Blobs can merge in mid-air.
- Your game saves automatically. Leave and come back, and **Continue** picks up where you left off. Your best score is kept too.

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
npm install
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
2. **Shape matching** finds the best-fit rotation of each blob's rest circle and pulls the particles toward it. Bigger blobs are slightly softer, so they jiggle more.
3. **Collisions** resolve particle-vs-particle contacts between different blobs (with friction) and particle-vs-wall contacts. A uniform spatial hash keeps this fast.

Merged blobs start from their two parents' outline and inflate into a circle. A safety pass separates any ring that ends up inside another. A crowded tank (about 600 particles) simulates in roughly 1 ms per frame on a laptop.

## Credits

Inspired by *sobosuba* by keepeetron. Soboscuba is an independent fan recreation with its own code and art. Fonts: Lilita One and Nunito (SIL Open Font License).
