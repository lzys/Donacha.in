// ============================================================================
//  GAZE REPLY — CONFIG
//  Everything you are likely to want to change lives here.
// ============================================================================

/** How long gaze must stay on one panel before it is selected (ms). */
export const DWELL_MS = 2000;

/** After a selection, all gaze is ignored for this long (ms). */
export const COOLDOWN_MS = 1500;

/** How long the "You chose…" confirmation screen stays up (ms). */
export const CONFIRM_MS = 2500;

/** Speak the chosen answer aloud with the browser's speech synthesis. */
export const SPEAK_ANSWERS = true;

/** Show the small input/debug line under the panels. */
export const SHOW_DEBUG_LINE = true;

export interface Answer {
  /** One emoji, drawn large above the label. */
  emoji: string;
  /** Up to ~6 words. This is also what is spoken aloud. */
  label: string;
}

export interface Question {
  prompt: string;
  /** Exactly three answers, shown left → right. */
  answers: [Answer, Answer, Answer];
}

/**
 * The questions to ask, in order. After a selection the app moves to the next
 * question and wraps around at the end. With a single entry, the same
 * question is asked again.
 */
export const QUESTIONS: Question[] = [
  {
    prompt: 'What would you like to drink?',
    answers: [
      { emoji: '💧', label: 'Water' },
      { emoji: '🧃', label: 'Juice' },
      { emoji: '☕', label: 'Something warm' },
    ],
  },
];

// ----------------------------------------------------------------------------
//  Layout. The content is placed in front of wherever the user's head points
//  when the XR session starts. Meta VR Glasses have a ~70° x 66° field of
//  view, so everything below stays within roughly ±25° horizontally and
//  ±20° vertically of the view centre.
// ----------------------------------------------------------------------------

/** Distance from the eyes to the panels (metres). */
export const VIEW_DISTANCE_M = 1.3;

/** Width/height of each square answer panel (metres). 0.30 m ≈ 13° at 1.3 m. */
export const PANEL_SIZE_M = 0.3;

/** Gap between panels (metres). 0.14 m ≈ 6° at 1.3 m. */
export const PANEL_GAP_M = 0.14;
