// Thin wrapper around the Web Speech API.
//
// Chrome only lets a page speak after the user has interacted with it once
// (a click or key press). Entering XR counts. For desktop mouse testing,
// index.html shows a "click to enable speech" hint until that happens.

let unlocked = false;
let lastError = '';

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Call from a user-gesture handler to satisfy the browser's activation rule. */
export function unlockSpeech() {
  if (unlocked || !supported()) return;
  unlocked = true;
  // Speaking an empty utterance inside the gesture primes the engine.
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export function speak(text: string) {
  if (!supported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.onerror = (e) => {
    lastError = e.error;
  };
  u.onstart = () => {
    lastError = '';
  };
  synth.speak(u);
}

export function speechStatus(): string {
  if (!supported()) return 'unavailable';
  if (lastError) return `error (${lastError})`;
  return unlocked ? 'ready' : 'needs a click first';
}
