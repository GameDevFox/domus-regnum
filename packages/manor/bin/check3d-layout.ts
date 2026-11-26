// For the page checks: how often the page asks where something on the map is drawn. Each such
// question, after anything on the page has changed, makes the browser lay the page out there and
// then, and a question asked every frame is a layout every frame.
import type { Page } from "@playwright/test";

/**
 * Put before the page's own scripts (`page.addInitScript`): counts the questions asked of nodes
 * in the map's frame, and the frames drawn, from when `window.__layoutReads.from()` is called.
 * (This patches a prototype's method, whose receiver is only reached through `this`.)
 */
export const COUNT_LAYOUT_READS = `(() => {
  const counts = { reads: 0, frames: 0 };
  const read = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    if (this.closest && this.closest(".map-frame")) counts.reads += 1;
    return read.call(this);
  };
  const tick = () => {
    counts.frames += 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__layoutReads = { from: () => Object.assign(counts, { reads: 0, frames: 0 }), now: () => ({ ...counts }) };
})()`;

/** Begin counting afresh. */
export const countFrom = (page: Page): Promise<unknown> => page.evaluate(`window.__layoutReads.from()`);
/** What has been counted since. */
export const counted = (page: Page): Promise<{ reads: number; frames: number }> => page.evaluate(`window.__layoutReads.now()`) as Promise<{ reads: number; frames: number }>;
