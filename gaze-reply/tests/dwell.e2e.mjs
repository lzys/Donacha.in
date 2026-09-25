// End-to-end dwell test. Start the dev server first (`npm start`), then:
//   npm run test:e2e
// Set CHROMIUM_PATH to use a specific Chromium binary.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = new URL('../test-results/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL ?? 'https://localhost:8081/';
const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(APP_URL);
await page.waitForFunction(() => window.gazeReply?.system, null, { timeout: 60000 });
await sleep(1500);

const state = () =>
  page.evaluate(() => {
    const s = window.gazeReply.system;
    return {
      mode: s.mode,
      dwell: s.dwellPanel,
      fills: s.panels.map((p) => +p.fill.scale.x.toFixed(2)),
      hovered: s.panels.map((p) => p.hovered),
      dimmed: s.panels.map((p) => p.dimmed),
      debug: s.lastDebugText,
      inXR: !!s.xrManager.getSession(),
    };
  });

// Screen-space centre of each panel (desktop camera).
const panelPx = await page.evaluate(() => {
  const { system, world } = window.gazeReply;
  const canvas = world.renderer.domElement.getBoundingClientRect();
  return system.panels.map((p) => {
    const v = p.group.getWorldPosition(p.group.position.clone());
    v.project(world.camera);
    return { x: canvas.left + ((v.x + 1) / 2) * canvas.width, y: canvas.top + ((1 - v.y) / 2) * canvas.height };
  });
});

// ------------------------------------------------ A. desktop mouse hover
await page.mouse.click(40, 40); // unlock speech, away from panels
await page.screenshot({ path: `${OUT}/1-desktop-question.png` });
let s = await state();
check('A0 starts in question mode, not in XR', s.mode === 'question' && !s.inXR, JSON.stringify(s.fills));

await page.mouse.move(panelPx[0].x, panelPx[0].y, { steps: 5 });
await sleep(1000);
s = await state();
check('A1 hover panel 1 for 1s → fill ~50%', s.dwell === 0 && s.fills[0] > 0.35 && s.fills[0] < 0.7, `fills=${s.fills}`);
await page.screenshot({ path: `${OUT}/2-desktop-dwell.png` });

await page.mouse.move(40, 40, { steps: 3 });
await sleep(200);
s = await state();
check('A2 leave before 2s → fill resets, no selection', s.mode === 'question' && s.fills.every((f) => f < 0.01), `fills=${s.fills}`);

await page.mouse.move(panelPx[1].x, panelPx[1].y, { steps: 5 });
await sleep(1500);
s = await state();
check('A3 still question at 1.5s', s.mode === 'question' && s.dwell === 1, `fills=${s.fills}`);
await sleep(700);
s = await state();
check('A4 at ~2.2s → confirmation', s.mode === 'confirm');
await page.screenshot({ path: `${OUT}/3-desktop-confirm.png` });
const spoke = logs.some((l) => l.includes('selected "Juice"'));
check('A5 selected Juice', spoke);

await sleep(2500);
s = await state();
check('A6 back to question after 2.5s, panels dimmed (cooldown), no dwell', s.mode === 'question' && s.dimmed.every(Boolean) && s.dwell === null, JSON.stringify(s));
await page.screenshot({ path: `${OUT}/4-desktop-cooldown.png` });
await sleep(500);
s = await state();
check('A7 lingering mouse still ignored ~0.7s into cooldown', s.dwell === null && s.fills.every((f) => f < 0.01));
await sleep(1300);
s = await state();
check('A8 after cooldown, dwell restarts on lingering hover', s.dwell === 1 && s.fills[1] > 0 && s.fills[1] < 0.8, `fills=${s.fills}`);
await page.mouse.move(40, 40);
await sleep(300);

// ------------------------------------------------ B. XR + emulated gaze
await page.evaluate(() => window.gazeReply.world.launchXR());
await page.waitForFunction(() => !!window.gazeReply.system.xrManager.getSession(), null, { timeout: 20000 });
await sleep(1500);
const gazeInfo = await page.evaluate(() => {
  const d = window.IWER_DEVICE;
  const sess = window.gazeReply.system.xrManager.getSession();
  return {
    device: d?.name ?? d?.constructor?.name,
    hasGaze: !!d?.gaze,
    gazeConnected: d?.gaze?.connected,
    sources: [...sess.inputSources].map((x) => x.targetRayMode + (x.hand ? ':hand' : '')),
    features: sess.enabledFeatures ?? null,
  };
});
check('B0 XR session has a gaze input source', gazeInfo.sources.includes('gaze'), JSON.stringify(gazeInfo));

// Aim the IWER gaze (viewer-relative) at a panel or elsewhere.
const aim = (target) =>
  page.evaluate((target) => {
    const { system, world } = window.gazeReply;
    let dir;
    if (target === 'away') dir = { x: 0, y: 0.6, z: -1 };
    else {
      const v = system.panels[target].group.getWorldPosition(system.panels[target].group.position.clone());
      world.player.head.updateWorldMatrix(true, false);
      world.player.head.worldToLocal(v);
      dir = v;
    }
    const len = Math.hypot(dir.x, dir.y, dir.z);
    const b = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
    // Quaternion rotating (0,0,-1) onto b.
    const a = { x: 0, y: 0, z: -1 };
    const r = 1 + (a.x * b.x + a.y * b.y + a.z * b.z);
    let q = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x, w: r };
    const n = Math.hypot(q.x, q.y, q.z, q.w);
    window.IWER_DEVICE.gaze.quaternion.set(q.x / n, q.y / n, q.z / n, q.w / n);
  }, target);

await aim('away');
await sleep(800);
s = await state();
check('B1 gaze away → nothing hovered', s.hovered.every((h) => !h), s.debug);

await aim(0);
await sleep(1000);
s = await state();
check('B2 gaze on panel 1 for 1s (no pinch) → fill grows', s.dwell === 0 && s.fills[0] > 0.3 && s.fills[0] < 0.7, `fills=${s.fills}`);
await page.screenshot({ path: `${OUT}/5-xr-gaze-dwell.png` });
const dbg = s.debug;
check('B3 debug line reports GAZE source, pose rate and gaze hover', /GAZE/.test(dbg) && /gaze pose [1-9]\d*\/s/.test(dbg) && /via gaze/.test(dbg), dbg);

await aim('away');
await sleep(300);
s = await state();
check('B4 gaze leaves early → reset', s.fills.every((f) => f < 0.01) && s.mode === 'question', `fills=${s.fills}`);

await aim(2);
await sleep(2400);
s = await state();
check('B5 gaze on panel 3 for 2s → confirmation, no pinch used', s.mode === 'confirm');
await page.screenshot({ path: `${OUT}/6-xr-confirm.png` });
check('B6 selected Something warm', logs.some((l) => l.includes('selected "Something warm"')));

await sleep(2600);
s = await state();
check('B7 back to question with cooldown ignoring lingering gaze', s.mode === 'question' && s.dwell === null && s.dimmed.every(Boolean));
await sleep(1600);
s = await state();
check('B8 after cooldown lingering gaze starts a new dwell', s.dwell === 2, `fills=${s.fills}`);

console.log(results.join('\n'));
console.log('--- gaze/app console lines ---');
console.log(logs.filter((l) => /gaze|error|Error/i.test(l)).slice(0, 25).join('\n'));
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
