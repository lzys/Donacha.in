import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

export const EMOJI_FONT =
  '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
export const TEXT_FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * A flat plane whose texture is drawn with the 2D canvas API. Call `draw()`
 * whenever the content changes; the texture is re-uploaded once per draw.
 */
export class CanvasPlane {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;

  constructor(widthM: number, heightM: number, pxPerMetre = 1600) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(widthM * pxPerMetre);
    this.canvas.height = Math.round(heightM * pxPerMetre);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new Mesh(
      new PlaneGeometry(widthM, heightM),
      new MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        toneMapped: false,
      }),
    );
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  draw(fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    fn(this.ctx, this.width, this.height);
    this.texture.needsUpdate = true;
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Greedy word wrap. Returns at most `maxLines` lines. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}
