import {
  Color,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RayInteractable,
  Vector3,
  VisibilityState,
  createSystem,
} from '@iwsdk/core';
import {
  CanvasPlane,
  EMOJI_FONT,
  TEXT_FONT,
  roundRect,
  wrapText,
} from './canvas-plane.js';
import {
  Answer,
  CONFIRM_MS,
  COOLDOWN_MS,
  DWELL_MS,
  PANEL_GAP_M,
  PANEL_SIZE_M,
  QUESTIONS,
  SHOW_DEBUG_LINE,
  SPEAK_ANSWERS,
  VIEW_DISTANCE_M,
} from './config.js';
import { speak, speechStatus } from './speech.js';

// Colours: dark calm background, high-contrast panels.
const BG_COLOR = 0x0b1220;
const PANEL_FILL = '#16325c';
const PANEL_BORDER = '#dbe6f5';
const HOVER_BORDER = '#ffd166';
const FILL_COLOR = 0xffd166;
const TRACK_COLOR = 0x0a1a33;
const CONFIRM_ACCENT = '#7ee3a1';

type Mode = 'question' | 'confirm';

interface PanelView {
  index: number;
  entity: Entity;
  group: Group;
  face: CanvasPlane;
  fill: Mesh<PlaneGeometry, MeshBasicMaterial>;
  hovered: boolean;
  dimmed: boolean;
}

/** Which pointer last entered a panel, for the debug line. */
interface HoverInfo {
  panel: number;
  via: string;
  at: number;
}

const FILL_WIDTH = PANEL_SIZE_M * 0.84;
const FILL_HEIGHT = PANEL_SIZE_M * 0.09;

export class GazeReplySystem extends createSystem({}) {
  private root!: Group;
  private rootEntity!: Entity;
  private questionPlane!: CanvasPlane;
  private confirmPlane!: CanvasPlane;
  private debugPlane!: CanvasPlane;
  private panels: PanelView[] = [];

  private mode: Mode = 'question';
  private questionIndex = 0;
  private dwellPanel: number | null = null;
  private dwellStart = 0;
  private confirmUntil = 0;
  private cooldownUntil = 0;

  // Recentring: follow the head for a short window after XR starts, then lock.
  private recenterUntil = 0;
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly forward = new Vector3();

  // Debug bookkeeping.
  private lastHover: HoverInfo | null = null;
  private gazeEventTimes: number[] = [];
  private gazePoseTimes: number[] = [];
  private lastDebugDraw = 0;
  private lastDebugText = '';

  init(): void {
    this.scene.background = new Color(BG_COLOR);

    this.root = new Group();
    this.root.name = 'gaze-reply-root';
    this.rootEntity = this.world.createTransformEntity(this.root);

    // Question text, above the panels (~+9° from view centre).
    this.questionPlane = new CanvasPlane(1.2, 0.16);
    this.questionPlane.mesh.name = 'question';
    this.questionPlane.mesh.position.set(0, 0.2, 0);
    this.root.add(this.questionPlane.mesh);

    // Three answer panels in a row.
    const step = PANEL_SIZE_M + PANEL_GAP_M;
    for (let i = 0; i < 3; i++) {
      this.panels.push(this.createPanel(i, (i - 1) * step, -0.06));
    }

    // Confirmation card, shown in place of the question + panels.
    this.confirmPlane = new CanvasPlane(0.95, 0.46);
    this.confirmPlane.mesh.name = 'confirmation';
    this.confirmPlane.mesh.position.set(0, 0.02, 0);
    this.confirmPlane.mesh.visible = false;
    this.root.add(this.confirmPlane.mesh);

    // Small debug line under the panels (~-13° from view centre).
    this.debugPlane = new CanvasPlane(1.1, 0.08);
    this.debugPlane.mesh.name = 'debug-line';
    this.debugPlane.mesh.position.set(0, -0.3, 0);
    this.debugPlane.mesh.visible = SHOW_DEBUG_LINE;
    this.root.add(this.debugPlane.mesh);

    this.showQuestion(performance.now());
    this.placeInFrontOfViewer();

    // Re-centre in front of the head whenever an XR session becomes visible,
    // and back in front of the desktop camera when it ends.
    this.cleanupFuncs.push(
      this.visibilityState.subscribe((state) => {
        if (state === VisibilityState.Visible) {
          this.recenterUntil = performance.now() + 600;
        } else if (state === VisibilityState.NonImmersive) {
          this.recenterUntil = 0;
          this.placeInFrontOfViewer();
        }
      }),
    );

    // Caregiver shortcut: R re-centres the content in front of the viewer.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') this.placeInFrontOfViewer();
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
  }

  // ---------------------------------------------------------------- building

  private createPanel(index: number, x: number, y: number): PanelView {
    const group = new Group();
    group.name = `answer-panel-${index}`;
    group.position.set(x, y, 0);

    const face = new CanvasPlane(PANEL_SIZE_M, PANEL_SIZE_M);
    face.mesh.name = `answer-panel-${index}-face`;
    group.add(face.mesh);

    // Dwell progress bar: a dark track plus a bright fill that grows
    // left → right. The fill geometry is shifted so scale.x grows from the
    // left edge.
    const barY = -PANEL_SIZE_M / 2 + FILL_HEIGHT * 0.5 + PANEL_SIZE_M * 0.05;
    const track = new Mesh(
      new PlaneGeometry(FILL_WIDTH, FILL_HEIGHT),
      new MeshBasicMaterial({ color: TRACK_COLOR, toneMapped: false }),
    );
    track.position.set(0, barY, 0.002);
    group.add(track);

    const fillGeom = new PlaneGeometry(FILL_WIDTH, FILL_HEIGHT);
    fillGeom.translate(FILL_WIDTH / 2, 0, 0);
    const fill = new Mesh(
      fillGeom,
      new MeshBasicMaterial({ color: FILL_COLOR, toneMapped: false }),
    );
    fill.name = `answer-panel-${index}-fill`;
    fill.position.set(-FILL_WIDTH / 2, barY, 0.004);
    fill.scale.x = 0.0001;
    group.add(fill);

    const entity = this.world.createTransformEntity(group, {
      parent: this.rootEntity,
    });
    // RayInteractable is what makes gaze (and mouse / hand rays) add the
    // transient `Hovered` tag to this entity.
    entity.addComponent(RayInteractable);

    // Record which pointer type is hovering, purely for the debug line.
    const onPointer = (e: any) => {
      const source = e?.pointerState?.source;
      const via =
        source === 'gaze'
          ? 'gaze'
          : e?.pointerType === 'ray'
            ? 'hand/controller ray'
            : String(e?.pointerType ?? 'pointer').replace('screen-', '');
      const now = performance.now();
      if (e.type === 'pointerenter') this.lastHover = { panel: index, via, at: now };
      if (via === 'gaze') this.gazeEventTimes.push(now);
    };
    (group as any).addEventListener('pointerenter', onPointer);
    (group as any).addEventListener('pointermove', onPointer);
    this.cleanupFuncs.push(() => {
      (group as any).removeEventListener('pointerenter', onPointer);
      (group as any).removeEventListener('pointermove', onPointer);
    });

    return { index, entity, group, face, fill, hovered: false, dimmed: false };
  }

  private drawPanel(panel: PanelView, answer: Answer) {
    panel.face.draw((ctx, w, h) => {
      const border = Math.round(w * 0.03);
      roundRect(ctx, border / 2, border / 2, w - border, h - border, w * 0.08);
      ctx.fillStyle = PANEL_FILL;
      ctx.fill();
      ctx.lineWidth = panel.hovered ? border * 1.8 : border;
      ctx.strokeStyle = panel.hovered ? HOVER_BORDER : PANEL_BORDER;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(h * 0.34)}px ${EMOJI_FONT}`;
      ctx.fillText(answer.emoji, w / 2, h * 0.3);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(h * 0.12)}px ${TEXT_FONT}`;
      const lines = wrapText(ctx, answer.label, w * 0.86, 2);
      const lineH = h * 0.135;
      const top = h * 0.62 - ((lines.length - 1) * lineH) / 2;
      lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * lineH));
    });
    panel.face.mesh.material.opacity = panel.dimmed ? 0.4 : 1;
  }

  private drawQuestion(text: string) {
    this.questionPlane.draw((ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = Math.round(h * 0.55);
      ctx.font = `700 ${size}px ${TEXT_FONT}`;
      while (ctx.measureText(text).width > w * 0.96 && size > 20) {
        size -= 4;
        ctx.font = `700 ${size}px ${TEXT_FONT}`;
      }
      ctx.fillText(text, w / 2, h / 2);
    });
  }

  private drawConfirmation(answer: Answer) {
    this.confirmPlane.draw((ctx, w, h) => {
      const border = Math.round(h * 0.025);
      roundRect(ctx, border / 2, border / 2, w - border, h - border, h * 0.1);
      ctx.fillStyle = '#10301f';
      ctx.fill();
      ctx.lineWidth = border;
      ctx.strokeStyle = CONFIRM_ACCENT;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = CONFIRM_ACCENT;
      ctx.font = `600 ${Math.round(h * 0.1)}px ${TEXT_FONT}`;
      ctx.fillText('✓ You chose', w / 2, h * 0.16);
      ctx.font = `${Math.round(h * 0.32)}px ${EMOJI_FONT}`;
      ctx.fillText(answer.emoji, w / 2, h * 0.47);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(h * 0.15)}px ${TEXT_FONT}`;
      ctx.fillText(answer.label, w / 2, h * 0.8);
    });
  }

  // ---------------------------------------------------------------- states

  private get question() {
    return QUESTIONS[this.questionIndex % QUESTIONS.length];
  }

  private showQuestion(now: number) {
    this.mode = 'question';
    this.drawQuestion(this.question.prompt);
    for (const panel of this.panels) {
      panel.hovered = false;
      panel.dimmed = now < this.cooldownUntil;
      panel.fill.scale.x = 0.0001;
      this.drawPanel(panel, this.question.answers[panel.index]);
      panel.group.visible = true;
    }
    this.questionPlane.mesh.visible = true;
    this.confirmPlane.mesh.visible = false;
    this.dwellPanel = null;
  }

  private select(panel: PanelView, now: number) {
    const answer = this.question.answers[panel.index];
    this.mode = 'confirm';
    this.dwellPanel = null;
    this.confirmUntil = now + CONFIRM_MS;
    // The cooldown starts when the question comes back, so a gaze that is
    // still resting where the chosen panel was cannot immediately re-select.
    this.cooldownUntil = this.confirmUntil + COOLDOWN_MS;

    for (const p of this.panels) {
      p.group.visible = false;
      p.fill.scale.x = 0.0001;
    }
    this.questionPlane.mesh.visible = false;
    this.drawConfirmation(answer);
    this.confirmPlane.mesh.visible = true;

    if (SPEAK_ANSWERS) speak(answer.label);
    console.info(`[gaze-reply] selected "${answer.label}"`);
  }

  // ---------------------------------------------------------------- frame

  update(): void {
    const now = performance.now();

    if (now < this.recenterUntil) this.placeInFrontOfViewer();

    if (this.mode === 'confirm') {
      if (now >= this.confirmUntil) {
        this.questionIndex = (this.questionIndex + 1) % QUESTIONS.length;
        this.showQuestion(now);
      }
    } else {
      this.updateDwell(now);
    }

    this.sampleGazePose(now);
    if (SHOW_DEBUG_LINE && now - this.lastDebugDraw > 250) {
      this.lastDebugDraw = now;
      this.drawDebug(now);
    }
  }

  private updateDwell(now: number) {
    const coolingDown = now < this.cooldownUntil;

    // Keep hover/dim visuals in sync with the ECS `Hovered` tag.
    for (const panel of this.panels) {
      const hovered = !coolingDown && panel.entity.hasComponent(Hovered);
      if (hovered !== panel.hovered || coolingDown !== panel.dimmed) {
        panel.hovered = hovered;
        panel.dimmed = coolingDown;
        this.drawPanel(panel, this.question.answers[panel.index]);
      }
    }

    if (coolingDown) {
      this.dwellPanel = null;
      return;
    }

    // Keep dwelling on the current panel while it is still hovered; otherwise
    // start a fresh timer on whichever panel is hovered now (if any).
    const current =
      this.dwellPanel !== null ? this.panels[this.dwellPanel] : null;
    if (!current || !current.hovered) {
      const next = this.panels.find((p) => p.hovered) ?? null;
      this.dwellPanel = next ? next.index : null;
      this.dwellStart = now;
    }

    for (const panel of this.panels) {
      const progress =
        panel.index === this.dwellPanel
          ? Math.min(1, (now - this.dwellStart) / DWELL_MS)
          : 0;
      panel.fill.scale.x = Math.max(0.0001, progress);
      if (progress >= 1) {
        this.select(panel, now);
        return;
      }
    }
  }

  private placeInFrontOfViewer() {
    const inXR = this.visibilityState.peek() !== VisibilityState.NonImmersive;
    const head = inXR ? this.player.head : this.camera;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.headPos);
    head.getWorldQuaternion(this.headQuat);
    this.forward.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.root.position
      .copy(this.headPos)
      .addScaledVector(this.forward, VIEW_DISTANCE_M);
    this.root.quaternion.copy(this.headQuat);
  }

  // ---------------------------------------------------------------- debug

  /** Count frames in which the runtime delivered a valid gaze pose. */
  private sampleGazePose(now: number) {
    const session = this.xrManager.getSession();
    const frame = this.xrFrame as XRFrame | undefined;
    const ref = this.xrManager.getReferenceSpace();
    if (!session || !frame || !ref) return;
    for (const source of session.inputSources) {
      if (source.targetRayMode === 'gaze') {
        try {
          if (frame.getPose(source.targetRaySpace, ref)) {
            this.gazePoseTimes.push(now);
          }
        } catch {
          // Frame not active for this sample; ignore.
        }
      }
    }
  }

  private describeInput(): string {
    const session = this.xrManager.getSession();
    if (!session) return 'XR off · input: mouse/desktop';
    const kinds: string[] = [];
    for (const s of session.inputSources) {
      if (s.targetRayMode === 'gaze') kinds.push('GAZE');
      else if (s.hand) kinds.push(`hand-${s.handedness[0]}`);
      else if (s.targetRayMode === 'tracked-pointer')
        kinds.push(`ctrl-${s.handedness[0]}`);
      else kinds.push(s.targetRayMode);
    }
    return `XR on · sources: ${kinds.length ? kinds.join(' ') : 'none'}`;
  }

  private drawDebug(now: number) {
    const cutoff = now - 1000;
    this.gazePoseTimes = this.gazePoseTimes.filter((t) => t > cutoff);
    this.gazeEventTimes = this.gazeEventTimes.filter((t) => t > cutoff);

    const inXR = this.xrManager.getSession() != null;
    const line1 = [this.describeInput()];
    if (inXR) {
      line1.push(`gaze pose ${this.gazePoseTimes.length}/s`);
      line1.push(`gaze hover events ${this.gazeEventTimes.length}/s`);
    }
    const line2: string[] = [];
    if (this.lastHover) {
      const ago = ((now - this.lastHover.at) / 1000).toFixed(1);
      line2.push(`last hover: #${this.lastHover.panel + 1} via ${this.lastHover.via} ${ago}s ago`);
    } else {
      line2.push('last hover: none yet');
    }
    if (now < this.cooldownUntil && this.mode === 'question') line2.push('cooldown');
    line2.push(`speech: ${speechStatus()}`);

    const lines = [line1.join(' · '), line2.join(' · ')];
    const text = lines.join('\n');
    if (text === this.lastDebugText) return;
    this.lastDebugText = text;
    this.debugPlane.draw((ctx, w, h) => {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, 0, 0, w, h, h * 0.2);
      ctx.fill();
      ctx.fillStyle = '#b8c7d9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const font = (px: number) => `${px}px ui-monospace, Menlo, Consolas, monospace`;
      let size = Math.round(h * 0.34);
      ctx.font = font(size);
      const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
      while (widest() > w * 0.97 && size > 10) {
        size -= 2;
        ctx.font = font(size);
      }
      ctx.fillText(lines[0], w / 2, h * 0.3);
      ctx.fillText(lines[1], w / 2, h * 0.72);
    });
  }
}
