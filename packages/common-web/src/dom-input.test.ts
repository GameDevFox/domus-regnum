/**
 * @jest-environment jsdom
 */
import { EventRouter } from "@kitsune/common";

import { attachDomInput } from "./dom-input";

const keyEvent = (type: "keydown" | "keyup", code: string, target?: EventTarget) => {
  const event = new KeyboardEvent(type, { code, bubbles: true });
  (target ?? window).dispatchEvent(event);
  return event;
};

const pointerEvent = (type: string, init: MouseEventInit = {}, target: EventTarget = window) => {
  // jsdom has no PointerEvent constructor; the event type string is what matters
  const event = new MouseEvent(type, { bubbles: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe("attachDomInput", () => {
  it("routes keydown/keyup by physical code", () => {
    const events = EventRouter();
    const spy = vi.fn();

    events.layer("base", {
      key: {
        KeyX: {
          down: (e: KeyboardEvent) => spy("down", e.code),
          up: (e: KeyboardEvent) => spy("up", e.code),
        },
      },
    });
    events.enter("base");

    const detach = attachDomInput(events);

    keyEvent("keydown", "KeyX");
    keyEvent("keyup", "KeyX");
    keyEvent("keydown", "KeyZ"); // unbound — should not throw

    expect(spy.mock.calls).toEqual([["down", "KeyX"], ["up", "KeyX"]]);
    detach();
  });

  it("skips key events from editable elements", () => {
    const events = EventRouter();
    const spy = vi.fn();

    events.layer("base", { key: { _any: spy } });
    events.enter("base");

    const detach = attachDomInput(events);

    const input = document.createElement("input");
    document.body.appendChild(input);
    keyEvent("keydown", "KeyX", input);

    expect(spy).not.toHaveBeenCalled();

    keyEvent("keydown", "KeyX", document.body);
    expect(spy).toHaveBeenCalledTimes(1);

    input.remove();
    detach();
  });

  it("routes pointer buttons by name", () => {
    const events = EventRouter();
    const spy = vi.fn();

    events.layer("base", {
      pointer: {
        left: { down: () => spy("left down"), up: () => spy("left up") },
        right: { down: () => spy("right down") },
      },
    });
    events.enter("base");

    const detach = attachDomInput(events);

    pointerEvent("pointerdown", { button: 0 });
    pointerEvent("pointerup", { button: 0 });
    pointerEvent("pointerdown", { button: 2 });

    expect(spy.mock.calls).toEqual([["left down"], ["left up"], ["right down"]]);
    detach();
  });

  it("routes pointer move, wheel, contextmenu, and window blur", () => {
    const events = EventRouter();
    const spy = vi.fn();

    events.layer("base", {
      pointer: {
        move: () => spy("move"),
        contextmenu: () => spy("contextmenu"),
      },
      wheel: () => spy("wheel"),
      window: { blur: () => spy("blur") },
    });
    events.enter("base");

    const detach = attachDomInput(events);

    pointerEvent("pointermove");
    pointerEvent("wheel");
    pointerEvent("contextmenu");
    window.dispatchEvent(new Event("blur"));

    expect(spy.mock.calls).toEqual([["move"], ["wheel"], ["contextmenu"], ["blur"]]);
    detach();
  });

  it("listens for pointer events on the given target only", () => {
    const events = EventRouter();
    const spy = vi.fn();

    events.layer("base", {
      pointer: { left: { down: () => spy("down") } },
      key: { KeyX: { down: () => spy("key") } },
    });
    events.enter("base");

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);

    const detach = attachDomInput(events, { pointerTarget: canvas });

    pointerEvent("pointerdown", { button: 0 }, canvas);
    pointerEvent("pointerdown", { button: 0 }, document.body);

    // keys stay on window regardless of pointer target
    keyEvent("keydown", "KeyX", document.body);

    expect(spy.mock.calls).toEqual([["down"], ["key"]]);

    canvas.remove();
    detach();
  });

  it("detach removes every listener", () => {
    const events = EventRouter();
    const spy = vi.fn();

    events.layer("base", { _any: spy });
    events.enter("base");

    const detach = attachDomInput(events);
    detach();

    keyEvent("keydown", "KeyX");
    pointerEvent("pointerdown", { button: 0 });
    pointerEvent("pointermove");
    window.dispatchEvent(new Event("blur"));

    expect(spy).not.toHaveBeenCalled();
  });
});
