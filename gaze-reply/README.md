# Gaze Reply

An assistive communication prototype for someone who cannot speak or use their
hands. It shows one question and three large answer panels. The user answers by
**looking at a panel and holding their gaze on it for 2 seconds**. No pinch,
controller or voice is needed. The chosen answer is spoken aloud and confirmed
on screen.

Built with Meta's [Immersive Web SDK (IWSDK)](https://github.com/facebook/immersive-web-sdk)
`1.0.0-rc.2` for WebXR on **Meta VR Glasses**. It also works with mouse hover
in a normal desktop browser.

> Prototype only. It is not a medical device. Always keep another way for
> the user to communicate.

---

## Run it (one command)

Requires Node.js 20.19+ or 22.12+.

```bash
cd gaze-reply
npm install        # first time only
npm start          # = npm run dev
```

`npm start` runs IWSDK's managed dev server at **https://localhost:8081/** and
opens a Chromium window. That window comes with IWER, IWSDK's built-in WebXR
emulator. It downloads its own Chromium on first run. You can also open
`https://localhost:8081/` in your own Chrome. The certificate is a local
development certificate, so accept the warning.

`npm run dev:runtime` starts plain Vite without the managed browser.
`npm run dev:down` stops the managed server.

## Test the dwell selection

### A. Desktop, mouse hover (no XR at all)

1. Open https://localhost:8081/. **Click once** on the dark background. Browsers
   only allow speech after one click or key press.
2. Move the mouse onto **Water 💧** and keep it still. The border turns yellow
   and the yellow bar at the bottom fills over 2 s.
3. Move off before the bar is full. The bar resets and nothing is selected.
4. Hold on **Juice 🧃** for 2 s. You hear "Juice" and see a green
   **✓ You chose** card for 2.5 s.
5. The question comes back with the panels **dimmed for 1.5 s**. Leave the mouse
   where it is: nothing fills during that time. Once the panels brighten, a new
   2 s dwell can start.

### B. IWSDK emulator with Meta VR Glasses gaze simulation

`iwsdk.config.json` sets the emulator device to `metaVRGlasses`. That profile
has the Glasses' narrower field of view and an emulated eye-gaze input source.

1. Open https://localhost:8081/ and click **Enter XR** (top centre).
2. In the emulator toolbar, open the **input mode** menu and choose
   **Gaze + Hands**. The mouse cursor now *is* her gaze. Right-drag to turn
   the head.
3. Rest the cursor on a panel for 2 s **without pinching**. It fills and
   selects exactly as on desktop.
4. Read the debug line under the panels. It should show `sources: … GAZE`,
   `gaze pose NN/s`, `gaze hover events NN/s` and `last hover: #n via gaze`.
5. Set gaze to **Off** in the menu. `GAZE` disappears from the source list,
   and hand or controller rays take over hover (the fallback).

**About the Immersive Web Emulator Chrome extension:** the stand-alone extension
(last updated Feb 2025, IWER 2.0.1) **has no gaze simulation**. Gaze
simulation now ships inside the IWER runtime that IWSDK injects itself (IWER
2.5, `metaVRGlasses` profile). Use the built-in emulator above, and **disable
the Chrome extension for localhost** so two emulators don't compete for
`navigator.xr`. With the extension you can still test dwell with a controller
ray, but not with gaze.

### C. Automated check

With the dev server running, `npm run test:e2e` runs both scenarios above
headless with Playwright and prints 18 PASS/FAIL checks. Screenshots go to
`test-results/`. The checks cover dwell fill, early-leave reset, selection at
2 s, the 2.5 s confirmation, the 1.5 s cooldown ignoring a lingering pointer,
and **pinch-free selection by emulated gaze in XR**. Set `CHROMIUM_PATH` if
Playwright has no browser installed.

### D. On a real headset

1. Run `npm run dev:status`. Open the `network` URL (for example
   `https://192.168.x.x:8081/`) in the headset browser on the same Wi-Fi.
   Accept the certificate warning.
2. **A caregiver presses Enter XR.** The browser requires one user gesture to
   start an immersive session. The installed-PWA build below skips this step.
3. The content appears centred on wherever her head points when XR starts.
   Press **R** on a keyboard to re-centre (desktop only).
4. Check the debug line (see below) to confirm real eye gaze is arriving.

On a Quest without eye tracking, `dev.targetDevicePreview.gazeSimulation:
"head"` adds a **head-directed** test gaze source (dev server only). This
checks the plumbing, not eye-tracking accuracy.

## The debug line

The small grey text under the panels (in-world, so it is visible in XR too):

| Field | Meaning |
|---|---|
| `XR off · input: mouse/desktop` | Flat browser; mouse hover drives dwell |
| `XR on · sources: GAZE hand-l …` | WebXR input sources the runtime reports. `GAZE` = an `XRInputSource` with `targetRayMode === "gaze"` |
| `gaze pose N/s` | Frames per second in which `XRFrame.getPose(gaze.targetRaySpace)` returned a pose. **Continuous gaze gives roughly the frame rate here, with no pinch** |
| `gaze hover events N/s` | Pointer events from the gaze ray reaching the panels |
| `last hover: #2 via gaze` | Which panel was last entered, and by which pointer (`gaze`, `mouse`, `hand/controller ray`) |
| `speech: ready / needs a click first / error (…)` | Web Speech API state |

IWSDK also logs `[iwsdk][gaze] …` lines to the console. Examples: `'gaze-tracking'
was NOT granted`, `no XRInputSource with targetRayMode === "gaze"`, `eye pose
is valid — real gaze data is flowing`, and `mapping XRTargetRaySpace onto the
head pose`. The last one means the runtime is giving head direction, not real
eye gaze. Connect remote DevTools (`chrome://inspect`) to read them on-device.

## Change the questions and timing

Everything is in **`src/config.ts`**:

```ts
export const DWELL_MS = 2000;     // gaze-hold time to select
export const COOLDOWN_MS = 1500;  // gaze ignored after the confirmation ends
export const CONFIRM_MS = 2500;   // "You chose…" screen duration
export const SPEAK_ANSWERS = true;
export const SHOW_DEBUG_LINE = true;

export const QUESTIONS = [
  {
    prompt: 'What would you like to drink?',
    answers: [
      { emoji: '💧', label: 'Water' },
      { emoji: '🧃', label: 'Juice' },
      { emoji: '☕', label: 'Something warm' },
    ],
  },
  // add more; the app moves to the next question after each answer
];
```

Layout (`VIEW_DISTANCE_M`, `PANEL_SIZE_M`, `PANEL_GAP_M`) is also there. The
defaults put panels about 13° wide with 6° gaps, and keep everything within
about ±25° horizontally and ±15° vertically. That is well inside the Glasses'
~70° × 66° field of view. Gaze targeting can be tuned in
`iwsdk.config.json → world.features.gaze`, for example `coneAngle`
(default 5°) or `showDebugReticle: true` to show a dot where gaze lands.

The cooldown starts **when the question returns** after the confirmation
screen. If it started at the moment of selection, it would expire unseen during
the 2.5 s confirmation and could not stop a lingering gaze.

## Package as a PWA later

IWSDK's scaffold ships a skill for this: `.claude/skills/iwsdk-pwa-packaging`.
In short:

1. **Auto-enter XR** — already done in `src/index.ts`. Inside an installed
   PWA the app calls `world.launchXR()` on launch, so nobody has to press
   Enter XR. It only runs when `getDigitalGoodsService` exists, i.e. on the
   headset as an installed app.
2. **Host it** on a public HTTPS origin (`npm run build` → deploy `dist/`, e.g.
   Vercel; see the `iwsdk-hosting` skill).
3. **Add `public/manifest.webmanifest`** plus 192/512 px PNG icons (including a
   maskable one). Link it from `index.html` with
   `<link rel="manifest" href="./manifest.webmanifest">`.
4. **Wrap it as a Trusted Web Activity APK** with Bubblewrap
   (`horizonOSAppMode: "immersive"`). Then set up Digital Asset Links, sideload,
   and optionally upload to the Horizon Store.

---

## Gaze input: can a web page get continuous gaze on Meta VR Glasses?

**Yes, according to Meta's current IWSDK documentation, source and emulator.**
Unlike Apple Vision Pro's `transient-pointer`, which reveals where you
looked only at the moment of a pinch, Meta VR Glasses expose eye gaze to WebXR
as a **persistent input source**:

- The page requests the `gaze-tracking` session feature (`eye-tracking` is a
  deprecated alias). The runtime then adds an `XRInputSource` with
  `targetRayMode === "gaze"`. Its `targetRaySpace` can be posed **every
  frame**.
- IWSDK's `GazePointer` raycasts from that pose every frame. It emits normal
  pointer enter/leave/move events and ECS `Hovered` tags **before and without
  any pinch**. Pinch only supplies "select" in IWSDK's default gaze-and-pinch
  model. This app ignores select and uses the hover stream for dwell.
- IWER's `XRGazeInput` is documented as *"a persistent, viewer-relative gaze
  source … it emits no select events."*

The docs also list the failure modes to watch for on a real device. The runtime
can refuse `gaze-tracking` (a permission or setting), expose no gaze source, or
map gaze onto head direction. **This was verified in Meta's emulator, not yet
on physical Meta VR Glasses.** The debug line and `[iwsdk][gaze]` logs are there
so you can confirm it on the device.

**If the device turns out to withhold continuous gaze from the web** (for
example, it only returns head direction, or only reveals gaze on pinch), then
pinch-free eye dwell is not possible on the web path. The native route is
**Unity + Meta XR Interaction SDK**: its gaze interaction (`HandGazeInteractor`
/ gaze-to-target, the model IWSDK mirrors) plus the Movement SDK's eye-tracking
data are available continuously to native apps with the eye-tracking
permission (check the current Unity docs for the Glasses before committing).
Build a dwell timer on the gaze hover in the same way. A head-gaze
dwell (point with the head, not the eyes) would still work on the web as a
fallback, if head movement is available to the user.

## Docs used

The Meta VR CLI (`metavr`) could not run in the build sandbox. Its binary
download and developers.meta.com were both blocked by the network policy. The
sources below were read instead, all current as of 2026-09:

- **Meta VR agentic skills** — `github.com/meta-quest/agentic-tools`:
  `hz-iwsdk-webxr` (IWSDK packages, `World.create`, input handling),
  `hz-immersive-designer` (gaze/dwell, FOV, text size, placement), and
  `metavr-cli` (docs-search workflow).
- **IWSDK repo** — `github.com/facebook/immersive-web-sdk` @ `f7ded47`
  (2026-09-24):
  `docs/concepts/xr-input/gaze.md` (Gaze and Pinch),
  `docs/guides/02-testing-experience.md` (IWER, `metaVRGlasses`, Gaze + Hands),
  `docs/guides/01a-project-manifest.md`, `docs/public/skill.md`
  ("`gaze` — continuous gaze ray"), `examples/gaze-pinch`, and the source of
  `packages/xr-input/src/pointer/gaze-pointer.ts`,
  `packages/core/src/input/input-system.ts` and `canvas-pointer-system.ts`.
- **IWSDK scaffold skills** installed by `npm create @iwsdk@latest`:
  `iwsdk-dev`, `iwsdk-pwa-packaging`.
- **IWER** 2.5.0 type definitions (`XRGazeInput`, `XRDevice.gaze`), and the
  Immersive Web Emulator extension repo (no gaze support).
