# Say It With Your Eyes

A webcam challenge that raises awareness of people who communicate with
eye-gaze devices. Players spell a short message (like "I LOVE YOU") using only
their eyes on a two-step eye-gaze keyboard. When they finish or give up, a
reveal explains that for people living with ALS, locked-in syndrome, cerebral
palsy or high spinal cord injury this is how they speak, with a donate button
and a "challenge a friend" share link carrying their time.

- Face tracking: MediaPipe Face Landmarker, running in the browser. The model
  (`face_landmarker.task`) ships in this folder; the library and its wasm load
  from jsDelivr, pinned to `@mediapipe/tasks-vision@1.0.1`. No video leaves the
  device.
- Gaze: a 9-dot calibration fits a ridge regression from iris position inside
  each eye plus head direction to screen coordinates.
- No webcam: mouse mode, where hovering selects and clicking is refused.

## Configure

Edit `CONFIG` at the top of the script in `index.html`:

- `donateUrl`: where the Donate button goes. The button stays hidden until this is set.
- `shareUrl`: the public address of the game, used in share links.

The webcam needs HTTPS (GitHub Pages is fine) or `localhost`.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
