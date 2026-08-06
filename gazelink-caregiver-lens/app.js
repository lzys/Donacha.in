(function () {
  'use strict';

  // ==================== CONFIG ====================
  var CONFIG = {
    relayUrl: 'ws://localhost:3001/caregiver',
    reconnectBaseDelay: 1000,
    reconnectMaxDelay: 30000,
    replyDurationMs: 6000,
    demoStepMs: 8000,
    fontMax: 44,
    fontMin: 34,
    replyFontMax: 64,
    replyFontMin: 40,
  };

  var URGENCY_CLASSES = ['urgency-high', 'urgency-medium', 'urgency-low'];

  // ==================== DEMO DATA ====================
  var DEMO_SETS = [
    [
      { priority: 1, urgency: 'high', text: 'Are you thirsty?', why: 'Looked at the water glass 3 times in 10s' },
      { priority: 2, urgency: 'medium', text: 'Is your mouth dry?', why: 'Repeated glances toward the water glass' },
      { priority: 3, urgency: 'low', text: 'Would you like ice chips instead?', why: 'Common alternative when swallowing is difficult' },
    ],
    [
      { priority: 1, urgency: 'high', text: 'Are you in pain?', why: 'Held gaze on left leg with a brief eye squint' },
      { priority: 2, urgency: 'medium', text: 'Do you need to shift position?', why: 'Gaze dropped to hip right after the squint' },
      { priority: 3, urgency: 'low', text: 'Should I call the nurse?', why: 'Discomfort signs persisted after repositioning' },
    ],
    [
      { priority: 1, urgency: 'high', text: 'Are you too cold?', why: 'Gaze fixed on the blanket, shoulders tensed' },
      { priority: 2, urgency: 'medium', text: 'Is the light too bright?', why: 'Repeated glances toward the window' },
      { priority: 3, urgency: 'low', text: 'Want the TV turned on?', why: 'Gaze drifted to the TV twice' },
    ],
  ];
  var DEMO_REPLY = 'Yes, please';

  // ==================== STATE ====================
  var live = { hasData: false, prompts: [], currentIndex: 0, asked: {} };
  var demo = { prompts: [], currentIndex: 0, asked: {} };
  var mode = 'live'; // 'live' | 'demo'
  var replyActive = false;
  var replyTimer = null;
  var demoTimer = null;
  var demoStep = 0;

  var ws = null;
  var reconnectTimer = null;
  var reconnectDelay = CONFIG.reconnectBaseDelay;

  var pressTimers = {};
  var longPressFired = {};
  var LONG_PRESS_RESET_MS = 600;
  var LONG_PRESS_DEMO_MS = 2000;

  // ==================== DOM REFS ====================
  var el = {
    waitingView: document.getElementById('waiting-view'),
    promptView: document.getElementById('prompt-view'),
    replyView: document.getElementById('reply-view'),
    demoChip: document.getElementById('demo-chip'),
    priorityBadge: document.getElementById('priority-badge'),
    urgencyWord: document.getElementById('urgency-word'),
    askedCheck: document.getElementById('asked-check'),
    promptText: document.getElementById('prompt-text'),
    promptDots: document.getElementById('prompt-dots'),
    replyText: document.getElementById('reply-text'),
  };

  // ==================== ACTIVE DATA HELPERS ====================
  function activeData() {
    return mode === 'demo' ? demo : live;
  }

  function activePromptKey(index) {
    return String(index);
  }

  // ==================== RENDER ====================
  function showView(name) {
    el.waitingView.classList.toggle('hidden', name !== 'waiting');
    el.promptView.classList.toggle('hidden', name !== 'prompt');
    el.replyView.classList.toggle('hidden', name !== 'reply');
  }

  function render() {
    if (replyActive) {
      showView('reply');
      return;
    }

    var data = activeData();
    if (mode === 'live' && !data.hasData) {
      showView('waiting');
      return;
    }
    if (!data.prompts || data.prompts.length === 0) {
      showView('waiting');
      return;
    }

    showView('prompt');
    el.demoChip.classList.toggle('hidden', mode !== 'demo');

    var idx = data.currentIndex;
    var item = data.prompts[idx];
    var isAsked = !!data.asked[activePromptKey(idx)];

    el.priorityBadge.textContent = item.priority;
    el.urgencyWord.textContent = item.urgency;

    el.promptView.classList.remove.apply(el.promptView.classList, URGENCY_CLASSES);
    var urgencyClass = 'urgency-' + item.urgency;
    if (URGENCY_CLASSES.indexOf(urgencyClass) !== -1) {
      el.promptView.classList.add(urgencyClass);
    }

    el.askedCheck.classList.toggle('hidden', !isAsked);
    el.promptView.classList.toggle('prompt-view-asked', isAsked);

    fitText(el.promptText, item.text, CONFIG.fontMax, CONFIG.fontMin);
    renderDots(data);
  }

  function fitText(target, text, maxSize, minSize) {
    target.style.fontSize = maxSize + 'px';
    target.textContent = text;

    var size = maxSize;
    while (target.scrollHeight > target.parentElement.clientHeight && size > minSize) {
      size -= 1;
      target.style.fontSize = size + 'px';
    }
  }

  function renderDots(data) {
    el.promptDots.innerHTML = '';
    data.prompts.forEach(function (item, i) {
      var dot = document.createElement('span');
      dot.className = 'prompt-dot';
      if (i === data.currentIndex) dot.classList.add('active');
      if (data.asked[activePromptKey(i)]) dot.classList.add('asked');
      el.promptDots.appendChild(dot);
    });
  }

  // ==================== NAVIGATION / ACTIONS ====================
  function movePrompt(delta) {
    var data = activeData();
    if (!data.prompts || data.prompts.length === 0) return;
    var len = data.prompts.length;
    data.currentIndex = (data.currentIndex + delta + len) % len;
    render();
  }

  function markAsked() {
    var data = activeData();
    if (!data.prompts || data.prompts.length === 0) return;
    data.asked[activePromptKey(data.currentIndex)] = true;
    render();
    setTimeout(function () {
      movePrompt(1);
    }, 250);
  }

  function resetToFirst() {
    var data = activeData();
    data.currentIndex = 0;
    render();
  }

  function triggerReply(text) {
    replyActive = true;
    render();
    fitText(el.replyText, text, CONFIG.replyFontMax, CONFIG.replyFontMin);
    clearTimeout(replyTimer);
    replyTimer = setTimeout(function () {
      replyActive = false;
      render();
    }, CONFIG.replyDurationMs);
  }

  // ==================== DEMO MODE ====================
  function applyDemoStep() {
    if (demoStep < DEMO_SETS.length) {
      demo.prompts = DEMO_SETS[demoStep];
      demo.currentIndex = 0;
      demo.asked = {};
      render();
    } else {
      triggerReply(DEMO_REPLY);
    }
  }

  function startDemoMode() {
    mode = 'demo';
    demoStep = 0;
    applyDemoStep();
    clearInterval(demoTimer);
    demoTimer = setInterval(function () {
      demoStep = (demoStep + 1) % (DEMO_SETS.length + 1);
      applyDemoStep();
    }, CONFIG.demoStepMs);
  }

  function stopDemoMode() {
    mode = 'live';
    clearInterval(demoTimer);
    demoTimer = null;
    replyActive = false;
    clearTimeout(replyTimer);
    render();
  }

  function toggleDemoMode() {
    if (mode === 'demo') stopDemoMode();
    else startDemoMode();
  }

  // ==================== RELAY (WEBSOCKET) ====================
  function connectRelay() {
    try {
      ws = new WebSocket(CONFIG.relayUrl);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      reconnectDelay = CONFIG.reconnectBaseDelay;
    };

    ws.onmessage = function (event) {
      var msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      handleRelayMessage(msg);
    };

    ws.onclose = function () {
      scheduleReconnect();
    };

    ws.onerror = function () {
      // onclose fires after onerror for WebSocket failures; reconnect handled there.
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(function () {
      reconnectDelay = Math.min(reconnectDelay * 2, CONFIG.reconnectMaxDelay);
      connectRelay();
    }, reconnectDelay);
  }

  function handleRelayMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'prompts') {
      live.hasData = true;
      live.prompts = Array.isArray(msg.items) ? msg.items : [];
      live.currentIndex = 0;
      live.asked = {};
      if (mode === 'live') render();
    } else if (msg.type === 'reply') {
      if (mode === 'live') triggerReply(msg.text || '');
    }
  }

  // ==================== INPUT ====================
  function setupInput() {
    document.addEventListener('keydown', function (e) {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          movePrompt(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          movePrompt(1);
          break;
        case 'Enter':
          e.preventDefault();
          if (e.repeat) return;
          longPressFired.Enter = false;
          clearTimeout(pressTimers.Enter);
          pressTimers.Enter = setTimeout(function () {
            longPressFired.Enter = true;
            toggleDemoMode();
          }, LONG_PRESS_DEMO_MS);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.repeat) return;
          longPressFired.ArrowLeft = false;
          clearTimeout(pressTimers.ArrowLeft);
          pressTimers.ArrowLeft = setTimeout(function () {
            longPressFired.ArrowLeft = true;
            resetToFirst();
          }, LONG_PRESS_RESET_MS);
          break;
        case 'd':
        case 'D':
          e.preventDefault();
          toggleDemoMode();
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          resetToFirst();
          break;
      }
    });

    document.addEventListener('keyup', function (e) {
      if (e.key === 'Enter') {
        clearTimeout(pressTimers.Enter);
        if (!longPressFired.Enter) markAsked();
      } else if (e.key === 'ArrowLeft') {
        clearTimeout(pressTimers.ArrowLeft);
      }
    });
  }

  // ==================== INIT ====================
  function init() {
    setupInput();
    render();
    connectRelay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
