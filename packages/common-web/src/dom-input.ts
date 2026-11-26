import { EventRouter } from "@kitsune/common";

/**
 * Bridges DOM input to an EventRouter, so keyboard/pointer handling lives in
 * router layers instead of scattered listeners. Event ids:
 *
 * - `["key", code, "down" | "up"]` — physical `KeyboardEvent.code` (see the
 *   `Key` constants), so bindings are keyboard-layout independent
 * - `["pointer", button, "down" | "up"]` — button is `left`/`middle`/`right`
 * - `["pointer", "move"]`, `["pointer", "contextmenu"]`, `["wheel"]`
 * - `["window", "blur"]` — for clearing held-key state
 *
 * Every handler receives the original DOM event; `preventDefault` is the
 * handler's decision, never the adapter's.
 */

export type DomInputOptions = {
  /** Target for pointer/wheel events (typically the canvas). Defaults to window. */
  pointerTarget?: EventTarget,
  /** Skip key events while an input/textarea/select/contenteditable has focus. Default true. */
  ignoreEditable?: boolean,
};

const POINTER_BUTTONS = ["left", "middle", "right", "button3", "button4"];

const isEditable = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if(!element || !element.tagName)
    return false;

  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
    || element.isContentEditable === true;
};

/** Attach DOM listeners that feed the router. Returns a detach function. */
export const attachDomInput = (events: EventRouter, options: DomInputOptions = {}) => {
  const { pointerTarget = window, ignoreEditable = true } = options;

  const onKey = (action: "down" | "up") => (e: Event) => {
    const event = e as KeyboardEvent;
    if(ignoreEditable && isEditable(event.target))
      return;

    events.trigger(["key", event.code, action], event);
  };

  const onPointerButton = (action: "down" | "up") => (e: Event) => {
    const event = e as PointerEvent;
    const button = POINTER_BUTTONS[event.button] || `button${event.button}`;
    events.trigger(["pointer", button, action], event);
  };

  const onPointerMove = (e: Event) => events.trigger(["pointer", "move"], e as PointerEvent);
  const onContextMenu = (e: Event) => events.trigger(["pointer", "contextmenu"], e);
  const onWheel = (e: Event) => events.trigger(["wheel"], e as WheelEvent);
  const onBlur = () => events.trigger(["window", "blur"]);

  const keyDown = onKey("down");
  const keyUp = onKey("up");
  const pointerDown = onPointerButton("down");
  const pointerUp = onPointerButton("up");

  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", onBlur);
  pointerTarget.addEventListener("pointerdown", pointerDown);
  pointerTarget.addEventListener("pointerup", pointerUp);
  pointerTarget.addEventListener("pointermove", onPointerMove);
  pointerTarget.addEventListener("contextmenu", onContextMenu);
  pointerTarget.addEventListener("wheel", onWheel);

  return () => {
    window.removeEventListener("keydown", keyDown);
    window.removeEventListener("keyup", keyUp);
    window.removeEventListener("blur", onBlur);
    pointerTarget.removeEventListener("pointerdown", pointerDown);
    pointerTarget.removeEventListener("pointerup", pointerUp);
    pointerTarget.removeEventListener("pointermove", onPointerMove);
    pointerTarget.removeEventListener("contextmenu", onContextMenu);
    pointerTarget.removeEventListener("wheel", onWheel);
  };
};
