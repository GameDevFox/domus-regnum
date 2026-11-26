// For the page checks: which event listeners the page still holds on nodes it has taken out of
// itself. A listener on a node that is gone keeps the node and its closure alive for as long as
// whatever registered it lives, and a control drawn afresh again and again piles them up.
import type { Page } from "@playwright/test";

/**
 * Put before the page's own scripts (`page.addInitScript`): keeps a list of the listeners added
 * to anything and not yet taken off again. (The page's own code is arrow functions throughout;
 * this patches a prototype's methods, whose receiver is only reached through `this`.)
 */
export const KEEP_LISTENERS = `(() => {
  const held = [];
  window.__heldListeners = held;
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const capture = (options) => (typeof options === "boolean" ? options : Boolean(options && options.capture));
  EventTarget.prototype.addEventListener = function (type, handler, options) {
    if (!held.some((h) => h.target === this && h.type === type && h.handler === handler && h.capture === capture(options))) held.push({ target: this, type, handler, capture: capture(options) });
    return add.call(this, type, handler, options);
  };
  EventTarget.prototype.removeEventListener = function (type, handler, options) {
    const at = held.findIndex((h) => h.target === this && h.type === type && h.handler === handler && h.capture === capture(options));
    if (at >= 0) held.splice(at, 1);
    return remove.call(this, type, handler, options);
  };
})()`;

/** How many listeners are still held on nodes that match a selector and are no longer in the page. */
export const heldOnGone = (page: Page, selector: string): Promise<number> => page.evaluate(`window.__heldListeners.filter((h) => h.target instanceof Element && !h.target.isConnected && h.target.matches(${JSON.stringify(selector)})).length`) as Promise<number>;
