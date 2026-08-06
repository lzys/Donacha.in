# GazeLink Caregiver Lens

A glanceable Meta Ray-Ban Display (Meta Display Glasses) web app for a caregiver
assisting a non-verbal patient. A separate GazeLink system watches what the
patient looks at and pushes urgency-ranked question suggestions over a
WebSocket relay; this app shows one prompt at a time in the caregiver's lens
so they never have to break eye contact with the patient to check a phone.

Plain HTML/CSS/JS, no framework, no build step. Three files:

```
index.html
styles.css
app.js
```

## Run locally

Any static file server works. From this directory:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a desktop browser, or load it in the
MRBD Chrome simulator, at 600x600.

### D-pad controls (arrow keys + Enter in the simulator)

| Input | Action |
|---|---|
| `ArrowUp` / `ArrowDown` | Previous / next prompt |
| `Enter` (tap) | Mark the current prompt as asked, auto-advance |
| `Enter` (hold ~2s) | Toggle demo mode — mirrors "hold Select 2s" on-device |
| `ArrowLeft` (hold) or `b` | Reset to the first prompt |
| `d` | Toggle demo mode (simulator shortcut) |

## Demo mode

Demo mode needs no backend. Press `d` (or hold `Enter` ~2s) to start it: the
app cycles through 3 hardcoded prompt sets and one sample patient reply,
switching every 8 seconds, looping continuously. Press `d` again to stop —
the app returns to whatever the live relay connection is showing (or the
quiet "waiting for GazeLink…" state if nothing has connected yet).

## Pointing at a real relay

The relay URL is a single constant near the top of `app.js`:

```js
var CONFIG = {
  relayUrl: 'ws://localhost:3001/caregiver',
  ...
};
```

Change it to your relay's address (e.g. `wss://your-relay.example.com/caregiver`)
and reload. The app reconnects automatically with exponential backoff if the
connection drops, and shows the quiet waiting state instead of an error
screen whenever it has no connection and no data yet.

The relay is expected to send JSON text frames of two shapes:

```json
{"type":"prompts","items":[{"priority":1,"urgency":"high","text":"Are you thirsty?","why":"Looked at water glass 3x in 10s"}]}
```

```json
{"type":"reply","text":"Yes, please"}
```

`urgency` must be one of `high`, `medium`, `low`. A `reply` message triggers
a full-screen 6-second takeover showing the patient's reply, then the app
returns to the current prompt list automatically.

## Deploy to GitHub Pages

1. Push this directory to a GitHub repository (or a subdirectory of one).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   pick the branch, and set the folder to `/` (root) or `/gazelink-caregiver-lens`
   if this app lives in a subdirectory — GitHub Pages only serves one folder,
   so if it's a subdirectory you may want a dedicated `gh-pages` branch or a
   repo of its own with these three files at the root.
4. Save. GitHub publishes the app at `https://<username>.github.io/<repo>/`
   (plus the subpath if applicable) — that's your HTTPS URL for the glasses.

Any other static HTTPS host (Vercel, Netlify, S3 + CloudFront, etc.) works
the same way — there's no server-side code.

## Generate the View-on-Glasses QR code

Once the app is hosted at a public HTTPS URL, generate a QR code your phone
can scan to add it as a web app on the glasses. The deep link format is:

```
fb-viewapp://web_app_deep_link?appName=<app-name>&appUrl=<url-encoded-https-url>
```

Example, for `https://yourname.github.io/gazelink-caregiver-lens/`:

```
fb-viewapp://web_app_deep_link?appName=gazelink-caregiver-lens&appUrl=https%3A%2F%2Fyourname.github.io%2Fgazelink-caregiver-lens%2F
```

If you have the `meta-wearables-webapp` skills installed (this app was
scaffolded with them), generate the PNG locally with the bundled QR script —
nothing leaves your machine:

```bash
python3 .claude/skills/qr-code/scripts/qr_generator.py \
  --png qr-view-on-glasses.png \
  "fb-viewapp://web_app_deep_link?appName=gazelink-caregiver-lens&appUrl=https%3A%2F%2Fyourname.github.io%2Fgazelink-caregiver-lens%2F"
```

Scan the resulting PNG with your phone camera — it opens the Meta AI app and
adds the web app to the glasses automatically. This only needs to be done
once per hosting URL; re-scan only if the URL changes.

**Manual alternative** (no QR): open the Meta AI app → Devices → Display
Glasses settings → App connections → Web apps → Add a web app, and enter the
name and HTTPS URL by hand.
