import type { Scope } from "@scene-lib/scope";

import { layoutCarved } from "./carved-layout";
import type { CarvedLayout, CarvedMetrics } from "./carved-layout";
import { el } from "./dom";

// A line of writing in the Deseret alphabet, drawn as a picture: the letters are nowhere in the
// page as text (not in a text node, nor a label, nor a title), so they cannot be copied out and
// put through a converter; the player is to learn the letters and read them (the author,
// 2026-11-16: "they should learn the language themselves and be able to read it themselves").
//
// Its look is the CSS class it is given (font, size, spacing, colour, line height: read back from
// the computed style), with the two shadows of cut letters drawn here. It is drawn sharp at the
// device's pixel ratio, again when its width changes, and not until the lettering has loaded
// (drawn with the fallbacks if it cannot be). Its height is set at once, so nothing moves when
// the picture comes.

/** What the picture is called, for whatever reads the page aloud: the same for every line, and saying nothing of what is written. */
export const WRITING_LABEL = "Writing in an unknown script";

/** The shadows of a cut letter, drawn under it, lowest first (as `text-shadow: 0 1.5px 0 rgb(255 255 255 / 0.32), 0 -1px 1px rgb(0 0 0 / 0.55)` would): dark in the cut, light along its lower edge. Offsets and blur in CSS pixels. */
const SHADOWS = [
  { dx: 0, dy: -1, blur: 1, color: "rgb(0 0 0 / 0.55)" },
  { dx: 0, dy: 1.5, blur: 0, color: "rgb(255 255 255 / 0.32)" },
];
/** A shadow is drawn by drawing its letter this far off to the left, out of the picture, and casting the shadow back by as much: so only the shadow lands. */
const OFF_PICTURE = 4096;

type CarvedWritingProps = {
  /** The line of writing. */
  text: string;
  /** The CSS class that gives its look. */
  className: string;
};

/** Reads a length in CSS pixels from a computed style, or `fallback` for "normal" and the like. */
const px = (value: string, fallback: number): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

/** "normal" line height, as a share of the font size, where the style does not give one. */
const NORMAL_LINE_HEIGHT = 1.2;

export const CarvedWriting = (scope: Scope, { text, className }: CarvedWritingProps): HTMLCanvasElement => {
  const canvas = el("canvas", className);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", WRITING_LABEL);
  const view = canvas.getContext("2d");
  // Measured and drawn on a canvas that is not in the page, then copied: a canvas in the page lays
  // its own CSS letter and word spacing over every letter it draws (Chrome does), which would count them twice.
  const ctx = document.createElement("canvas").getContext("2d");
  let fontReady = false;
  let fontAsked = false;
  let live = true;
  /** What it was last drawn for: width, font, pixel ratio and whether the lettering had loaded. */
  let drawnFor = "";

  const lay = (): { layout: CarvedLayout; font: string; color: string; width: number } | null => {
    const width = canvas.clientWidth;
    if (!ctx || width === 0) return null;
    const style = getComputedStyle(canvas);
    const fontPx = px(style.fontSize, 0);
    const font = `${style.fontStyle} ${style.fontWeight} ${fontPx}px ${style.fontFamily}`;
    ctx.font = font;
    const sample = ctx.measureText(text);
    const metrics: CarvedMetrics = {
      lineHeight: px(style.lineHeight, fontPx * NORMAL_LINE_HEIGHT),
      letterSpacing: px(style.letterSpacing, 0),
      wordSpacing: px(style.wordSpacing, 0),
      ascent: sample.fontBoundingBoxAscent,
      descent: sample.fontBoundingBoxDescent,
    };
    return { layout: layoutCarved(text, width, metrics, (char) => ctx.measureText(char).width), font, color: style.color, width };
  };

  const draw = (): void => {
    if (!live || !ctx || !view) return;
    const laid = lay();
    if (!laid) return;
    const dpr = window.devicePixelRatio || 1;
    const key = `${laid.width}|${laid.font}|${dpr}|${fontReady}`;
    if (key === drawnFor) return;
    drawnFor = key;
    const { layout, font, color, width } = laid;
    // The height is the picture's room on the page: kept from the first, so nothing jumps.
    canvas.style.height = `${layout.height}px`;
    canvas.width = ctx.canvas.width = Math.round(width * dpr);
    canvas.height = ctx.canvas.height = Math.round(layout.height * dpr);
    if (!fontReady) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    const letters = (shift: number): void => {
      for (const row of layout.rows) for (const glyph of row.glyphs) ctx.fillText(glyph.char, glyph.x + shift, row.baseline);
    };
    for (const shadow of SHADOWS) {
      ctx.save();
      // (Shadow offsets and blur are in device pixels: the transform does not scale them.)
      ctx.shadowColor = shadow.color;
      ctx.shadowBlur = shadow.blur * dpr;
      ctx.shadowOffsetX = (shadow.dx + OFF_PICTURE) * dpr;
      ctx.shadowOffsetY = shadow.dy * dpr;
      letters(-OFF_PICTURE);
      ctx.restore();
    }
    letters(0);
    view.drawImage(ctx.canvas, 0, 0);
  };

  // Drawn when the lettering has loaded (or has failed to: then with the fallbacks, as the page would).
  const loadFont = (): void => {
    fontAsked = true;
    const style = getComputedStyle(canvas);
    document.fonts
      .load(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`, text)
      .catch(() => [])
      .then(() => {
        fontReady = true;
        draw();
      });
  };

  const resized = new ResizeObserver(() => {
    // (Asked for once it is in the page, when its style can be read.)
    if (!fontAsked && canvas.isConnected) loadFont();
    // (On the next frame: setting the height from in here would have the observer called again in the same frame.)
    requestAnimationFrame(draw);
  });
  resized.observe(canvas);
  scope.add(() => {
    live = false;
    resized.disconnect();
  });
  // The size of the lettering follows the window's width, which can change while the picture's own does not.
  scope.listen(window, "resize", draw);
  return canvas;
};
