import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GazeReplySystem } from './gaze-reply.js';
import { unlockSpeech } from './speech.js';

// Any click or key press (including the "Enter XR" click) unlocks speech.
const hint = document.getElementById('speech-hint');
const onFirstGesture = () => {
  unlockSpeech();
  if (hint) hint.hidden = true;
};
window.addEventListener('pointerdown', onFirstGesture, { once: true });
window.addEventListener('keydown', onFirstGesture, { once: true });

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(GazeReplySystem);
  if (import.meta.env.DEV) {
    // Handy for poking at state from the browser console during testing.
    (window as any).gazeReply = { world, system: world.getSystem(GazeReplySystem) };
  }

  // When installed as a PWA on the headset there is no 2D page to click, so
  // enter XR straight away (the app-icon tap is the user activation). This
  // only runs inside an installed PWA; a browser tab keeps its Enter XR button.
  const nav = navigator as Navigator & {
    xr?: { isSessionSupported?: (m: string) => Promise<boolean> };
  };
  if ('getDigitalGoodsService' in window && nav.xr?.isSessionSupported) {
    nav.xr
      .isSessionSupported('immersive-vr')
      .then((ok) => {
        if (ok) world.launchXR();
      })
      .catch(() => {});
  }
});
