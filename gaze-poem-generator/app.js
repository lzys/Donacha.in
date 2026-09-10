(function () {
  'use strict';

  // ==================== CONFIG ====================
  var CONFIG = {
    dwellMs: 1200,
    cooldownMs: 500,
    webgazerSrc: 'https://cdn.jsdelivr.net/npm/webgazer@2/dist/webgazer.min.js',
    clicksPerCalPoint: 5,
  };

  var soundEnabled = true;

  // ==================== POEM DATA ====================
  var STEPS = [
    {
      key: 'mood',
      prompt: 'How does today feel?',
      options: [
        { id: 'calm', emoji: '🕊️', label: 'Calm' },
        { id: 'joyful', emoji: '☀️', label: 'Joyful' },
        { id: 'longing', emoji: '🌙', label: 'Longing' },
        { id: 'melancholy', emoji: '🍂', label: 'Melancholy' },
      ],
    },
    {
      key: 'setting',
      prompt: 'Where does the poem happen?',
      options: [
        { id: 'sea', emoji: '🌊', label: 'The Sea', phrase: 'the restless sea' },
        { id: 'forest', emoji: '🌲', label: 'A Forest', phrase: 'a quiet forest' },
        { id: 'city', emoji: '🌆', label: 'The City', phrase: 'the city lights' },
        { id: 'garden', emoji: '🌸', label: 'A Garden', phrase: 'an old garden' },
      ],
    },
    {
      key: 'subject',
      prompt: 'What is the poem about?',
      options: [
        { id: 'moon', emoji: '🌕', label: 'The Moon', phrase: 'the moon' },
        { id: 'stranger', emoji: '🙂', label: "A Stranger's Smile", phrase: "a stranger's smile" },
        { id: 'hands', emoji: '🤲', label: "My Mother's Hands", phrase: "my mother's hands" },
        { id: 'home', emoji: '🏡', label: 'A Childhood Home', phrase: 'a childhood home' },
      ],
    },
    {
      key: 'motion',
      prompt: 'What is it doing?',
      options: [
        { id: 'drifting', emoji: '🍃', label: 'Drifting', phrase: 'drifting' },
        { id: 'burning', emoji: '🔥', label: 'Burning', phrase: 'burning' },
        { id: 'waiting', emoji: '⏳', label: 'Waiting', phrase: 'waiting' },
        { id: 'dancing', emoji: '💃', label: 'Dancing', phrase: 'dancing' },
      ],
    },
    {
      key: 'feeling',
      prompt: 'How should it end?',
      options: [
        { id: 'hope', emoji: '🌱', label: 'Hope', phrase: 'hope' },
        { id: 'peace', emoji: '🤍', label: 'Peace', phrase: 'peace' },
        { id: 'wonder', emoji: '✨', label: 'Wonder', phrase: 'wonder' },
        { id: 'ache', emoji: '💭', label: 'A Quiet Ache', phrase: 'a quiet ache' },
      ],
    },
  ];

  var TEMPLATES = {
    calm: [
      'In {setting}, I find myself {motion},\nthinking of {subject}.\nThe world grows still,\nand somewhere inside, {feeling} settles in.',
      '{Subject}, calm as {setting},\n{motion} without a sound.\nHere, in this quiet moment,\nI hold onto {feeling}.',
    ],
    joyful: [
      '{Subject} laughs like {setting} at dawn,\n{motion} through the light.\nEvery heartbeat sings —\nthis is what {feeling} feels like.',
      'I run toward {setting},\n{motion} with {subject} on my mind.\nThe day opens wide,\nand {feeling} spills over.',
    ],
    longing: [
      'I think of {subject},\nsomewhere beyond {setting}.\nStill {motion},\nstill reaching for {feeling}.',
      '{Setting} holds a memory of {subject},\nand I am {motion} back to it,\nchasing a feeling called {feeling}.',
    ],
    melancholy: [
      '{Setting} remembers {subject}\nthe way I do —\n{motion}, slowly,\ninto {feeling}.',
      'There is a silence where {subject} used to be,\nonly {setting} left, {motion}.\nI carry {feeling}\nlike an old coat in winter.',
    ],
  };

  var MOOD_TITLES = {
    calm: 'A Calm Poem',
    joyful: 'A Joyful Poem',
    longing: 'A Poem of Longing',
    melancholy: 'A Melancholy Poem',
  };

  // ==================== STATE ====================
  var state = {
    inputMode: null, // 'pointer' | 'webgazer'
    stepIndex: 0,
    selections: {},
    tiles: [], // currently rendered dwell-tracked tiles: {el, fill, dwell, action}
    lockUntil: 0,
  };

  var gaze = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };
  var lastFrameTime = null;
  var rafId = null;

  // ==================== DOM REFS ====================
  var el = {
    views: {
      intro: document.getElementById('view-intro'),
      calibration: document.getElementById('view-calibration'),
      step: document.getElementById('view-step'),
      poem: document.getElementById('view-poem'),
    },
    gazeCursor: document.getElementById('gaze-cursor'),
    liveRegion: document.getElementById('live-region'),
    dwellSlider: document.getElementById('dwell-slider'),
    dwellValue: document.getElementById('dwell-value'),
    soundToggle: document.getElementById('sound-toggle'),
    calibrationGrid: document.getElementById('calibration-grid'),
    calibrationProgressText: document.getElementById('calibration-progress-text'),
    skipCalibration: document.getElementById('skip-calibration'),
    stepDots: document.getElementById('step-dots'),
    stepPrompt: document.getElementById('step-prompt'),
    stepGrid: document.getElementById('step-grid'),
    poemTitle: document.getElementById('poem-title'),
    poemText: document.getElementById('poem-text'),
    poemActions: document.getElementById('poem-actions'),
  };

  var audioCtx = null;

  function ensureAudioCtx() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return;
    }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { /* Web Audio unavailable; sound stays silent */ }
  }

  // ==================== VIEW MANAGEMENT ====================
  function showView(name) {
    Object.keys(el.views).forEach(function (key) {
      el.views[key].classList.toggle('hidden', key !== name);
    });
  }

  function announce(text) {
    el.liveRegion.textContent = text;
  }

  // ==================== GAZE POINT SOURCES ====================
  function updateGazePoint(x, y) {
    gaze.x = x;
    gaze.y = y;
    gaze.active = true;
  }

  function setupPointerTracking() {
    window.addEventListener('pointermove', function (e) {
      updateGazePoint(e.clientX, e.clientY);
    });
  }

  function loadWebgazer(callback, onError) {
    if (window.webgazer) {
      callback();
      return;
    }
    var script = document.createElement('script');
    script.src = CONFIG.webgazerSrc;
    script.onload = callback;
    script.onerror = onError;
    document.head.appendChild(script);
  }

  function startWebgazer() {
    window.webgazer
      .setRegression('ridge')
      .setGazeListener(function (data) {
        if (data == null) return;
        updateGazePoint(data.x, data.y);
      })
      .saveDataAcrossSessions(false)
      .begin();
    window.webgazer.showVideoPreview(true);
    window.webgazer.showFaceOverlay(true);
    window.webgazer.showFaceFeedbackBox(true);
    window.webgazer.showPredictionPoints(false);
  }

  function stopWebgazer() {
    if (window.webgazer) {
      try { window.webgazer.end(); } catch (e) { /* ignore */ }
    }
  }

  // ==================== CALIBRATION ====================
  var CAL_POINTS = [
    [0.06, 0.08], [0.5, 0.08], [0.94, 0.08],
    [0.06, 0.5], [0.5, 0.5], [0.94, 0.5],
    [0.06, 0.92], [0.5, 0.92], [0.94, 0.92],
  ];

  function buildCalibration() {
    el.calibrationGrid.innerHTML = '';
    var doneCount = 0;

    function updateProgressText() {
      el.calibrationProgressText.textContent = doneCount + ' of ' + CAL_POINTS.length + ' points calibrated';
      if (doneCount >= CAL_POINTS.length) {
        el.calibrationProgressText.textContent = 'Calibration complete — starting…';
        setTimeout(function () { enterSteps(); }, 600);
      }
    }

    CAL_POINTS.forEach(function (pos) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'cal-dot';
      dot.style.left = (pos[0] * 100) + '%';
      dot.style.top = (pos[1] * 100) + '%';
      var clicks = 0;
      dot.textContent = CONFIG.clicksPerCalPoint;
      dot.addEventListener('click', function () {
        if (clicks >= CONFIG.clicksPerCalPoint) return;
        clicks += 1;
        dot.textContent = String(CONFIG.clicksPerCalPoint - clicks);
        if (clicks >= CONFIG.clicksPerCalPoint) {
          dot.classList.add('done');
          dot.textContent = '✓';
          doneCount += 1;
          updateProgressText();
        }
      });
      el.calibrationGrid.appendChild(dot);
    });

    updateProgressText();
  }

  // ==================== DWELL ENGINE ====================
  function clearTiles() {
    state.tiles = [];
  }

  function registerTile(el_, onSelect, opts) {
    var fill = document.createElement('div');
    fill.className = 'dwell-fill';
    el_.appendChild(fill);
    var tile = {
      el: el_,
      fill: fill,
      dwell: 0,
      threshold: (opts && opts.threshold) || CONFIG.dwellMs,
      onSelect: onSelect,
      done: false,
    };
    el_.addEventListener('click', function () {
      triggerSelect(tile);
    });
    state.tiles.push(tile);
    return tile;
  }

  function triggerSelect(tile) {
    if (tile.done) return;
    tile.done = true;
    state.tiles.forEach(function (t) { t.dwell = 0; t.fill.style.width = '0%'; });
    tile.el.classList.add('just-selected');
    state.lockUntil = performance.now() + CONFIG.cooldownMs;
    playSelectSound();
    tile.onSelect();
  }

  function playSelectSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      var now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) { /* ignore */ }
  }

  function dwellFrame(now) {
    if (lastFrameTime == null) lastFrameTime = now;
    var dt = now - lastFrameTime;
    lastFrameTime = now;

    // Position visual gaze cursor
    el.gazeCursor.style.transform = 'translate(' + gaze.x + 'px,' + gaze.y + 'px)';
    el.gazeCursor.classList.toggle('active', state.inputMode === 'webgazer');

    var locked = now < state.lockUntil;

    state.tiles.forEach(function (tile) {
      if (tile.done) return;
      var rect = tile.el.getBoundingClientRect();
      var hovered = !locked &&
        gaze.x >= rect.left && gaze.x <= rect.right &&
        gaze.y >= rect.top && gaze.y <= rect.bottom;

      if (hovered) {
        tile.dwell += dt;
        tile.el.classList.add('selecting');
        var pct = Math.min(100, (tile.dwell / tile.threshold) * 100);
        tile.fill.style.width = pct + '%';
        if (tile.dwell >= tile.threshold) {
          triggerSelect(tile);
        }
      } else {
        if (tile.dwell > 0) {
          tile.dwell = Math.max(0, tile.dwell - dt * 2);
          tile.fill.style.width = Math.min(100, (tile.dwell / tile.threshold) * 100) + '%';
        }
        tile.el.classList.remove('selecting');
      }
    });

    rafId = requestAnimationFrame(dwellFrame);
  }

  function startDwellLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    lastFrameTime = null;
    rafId = requestAnimationFrame(dwellFrame);
  }

  // ==================== STEP FLOW ====================
  function renderStepDots() {
    el.stepDots.innerHTML = '';
    STEPS.forEach(function (_, i) {
      var dot = document.createElement('span');
      dot.className = 'step-dot';
      if (i === state.stepIndex) dot.classList.add('active');
      else if (i < state.stepIndex) dot.classList.add('done');
      el.stepDots.appendChild(dot);
    });
  }

  function renderStep() {
    clearTiles();
    var step = STEPS[state.stepIndex];
    el.stepPrompt.textContent = step.prompt;
    renderStepDots();
    el.stepGrid.innerHTML = '';

    step.options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gaze-tile';
      btn.setAttribute('aria-label', opt.label);
      btn.innerHTML =
        '<span class="gaze-tile-emoji" aria-hidden="true">' + opt.emoji + '</span>' +
        '<span>' + opt.label + '</span>';
      el.stepGrid.appendChild(btn);
      registerTile(btn, function () {
        state.selections[step.key] = opt;
        announce('Selected: ' + opt.label);
        setTimeout(advanceStep, 300);
      });
    });

    if (state.stepIndex > 0) {
      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'gaze-tile back-tile';
      back.textContent = '← Go back';
      el.stepGrid.appendChild(back);
      registerTile(back, function () {
        state.stepIndex -= 1;
        renderStep();
      });
    }

    showView('step');
  }

  function advanceStep() {
    if (state.stepIndex < STEPS.length - 1) {
      state.stepIndex += 1;
      renderStep();
    } else {
      buildPoem();
    }
  }

  function enterSteps() {
    state.stepIndex = 0;
    state.selections = {};
    renderStep();
  }

  // ==================== POEM BUILDING ====================
  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function buildPoem() {
    var sel = state.selections;
    var mood = sel.mood.id;
    var variants = TEMPLATES[mood];
    var template = variants[Math.floor(Math.random() * variants.length)];

    var values = {
      setting: sel.setting.phrase,
      subject: sel.subject.phrase,
      motion: sel.motion.phrase,
      feeling: sel.feeling.phrase,
    };

    var text = template.replace(/\{(\w+)\}/g, function (_, key) {
      var lower = key.charAt(0).toLowerCase() + key.slice(1);
      var isCap = key.charAt(0) === key.charAt(0).toUpperCase() && key.charAt(0) !== key.charAt(0).toLowerCase();
      var value = values[lower] || '';
      return isCap ? capitalize(value) : value;
    });

    el.poemTitle.textContent = MOOD_TITLES[mood] || 'A Poem';
    el.poemText.textContent = text;
    announce('Your poem is ready.');
    renderPoemActions();
    showView('poem');
  }

  function renderPoemActions() {
    clearTiles();
    el.poemActions.innerHTML = '';

    var actions = [
      { emoji: '🔊', label: 'Read Aloud', run: readPoemAloud },
      { emoji: '📝', label: 'New Poem', run: enterSteps },
      { emoji: '🏠', label: 'Start Over', run: goToIntro },
    ];

    actions.forEach(function (action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gaze-tile';
      btn.innerHTML =
        '<span class="gaze-tile-emoji" aria-hidden="true">' + action.emoji + '</span>' +
        '<span>' + action.label + '</span>';
      el.poemActions.appendChild(btn);
      registerTile(btn, function () {
        action.run();
      });
    });
  }

  function readPoemAloud() {
    if (!('speechSynthesis' in window)) return;
    var utter = new SpeechSynthesisUtterance(el.poemText.textContent);
    utter.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    // Re-render the poem actions so "Read Aloud" can dwell-trigger again.
    setTimeout(renderPoemActions, 400);
  }

  function goToIntro() {
    stopWebgazer();
    state.inputMode = null;
    clearTiles();
    showView('intro');
  }

  // ==================== INTRO / MODE SELECTION ====================
  function setupIntro() {
    el.dwellSlider.addEventListener('input', function () {
      CONFIG.dwellMs = parseInt(el.dwellSlider.value, 10);
      el.dwellValue.textContent = (CONFIG.dwellMs / 1000).toFixed(1);
    });

    el.soundToggle.addEventListener('change', function () {
      soundEnabled = el.soundToggle.checked;
    });

    var choiceButtons = document.querySelectorAll('.big-choice');
    choiceButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        chooseMode(btn.getAttribute('data-mode'));
      });
    });

    el.skipCalibration.addEventListener('click', function () {
      enterSteps();
    });
  }

  function chooseMode(mode) {
    ensureAudioCtx();
    state.inputMode = mode;
    if (mode === 'pointer') {
      enterSteps();
      return;
    }

    // webgazer mode
    showView('calibration');
    el.calibrationProgressText.textContent = 'Loading webcam eye-tracking…';
    buildCalibration();
    loadWebgazer(
      function () {
        startWebgazer();
      },
      function () {
        el.calibrationProgressText.textContent =
          'Could not load webcam eye-tracking. You can still calibrate-skip and use a mouse.';
      }
    );
  }

  // ==================== INIT ====================
  function init() {
    setupPointerTracking();
    setupIntro();
    startDwellLoop();
    showView('intro');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
