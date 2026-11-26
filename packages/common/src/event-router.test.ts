import { EventRouter } from "./event-router";

describe("EventRouter", () => {

  describe("routing", () => {
    it("routes an event id to a handler with its args", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", {
        pointer: {
          down: (x: number, y: number) => spy("pointer down", x, y),
        },
      });
      events.enter("base");

      const handled = events.trigger(["pointer", "down"], 3, 4);

      expect(handled).toBe(true);
      expect(spy.mock.calls).toEqual([["pointer down", 3, 4]]);
    });

    it("reports unhandled events and returns false", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.onUnhandled((id, eventArgs) => spy(id, eventArgs));

      const handled = events.trigger(["key", "q"], "payload");

      expect(handled).toBe(false);
      expect(spy.mock.calls).toEqual([[["key", "q"], ["payload"]]]);
    });

    it("does not treat a subtree as a handler", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", { pointer: { down: () => spy("down") } });
      events.enter("base");
      events.onUnhandled(id => spy("unhandled", id));

      events.trigger(["pointer"]);

      expect(spy.mock.calls).toEqual([["unhandled", ["pointer"]]]);
    });
  });

  describe("layers", () => {
    // Mirrors the original overlay-ordering scenario: the top-most active
    // layer wins, lower layers fill in the gaps. Defaults live in a layer
    // conventionally named "base", entered first so it sits at the bottom.
    it("routes through active layers from the top of the stack down", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", {
        left: { a: () => spy("left a") },
        right: {
          a: () => spy("right a"),
          b: () => spy("right b"),
        },
      });

      events.layer("switched", {
        right: {
          b: () => spy("switched right b"),
          c: () => spy("switched right c"),
        },
      });

      events.layer("bonus", {
        right: { c: () => spy("bonus right c") },
      });

      events.onUnhandled(id => spy(`No handler for ${id}`));

      events.enter("base");

      const fireAll = () => {
        events.trigger(["left", "a"]);
        events.trigger(["right", "b"]);
        events.trigger(["right", "c"]);
        events.trigger(["right", "d"]);
      };

      fireAll();

      events.enter("switched");
      fireAll();

      events.exit("switched");
      events.enter("bonus");
      fireAll();

      events.enter("switched"); // stack is now [bonus, switched]
      fireAll();

      expect(spy.mock.calls).toEqual([
        // []
        ["left a"],
        ["right b"],
        ["No handler for right,c"],
        ["No handler for right,d"],

        // [switched]
        ["left a"],
        ["switched right b"],
        ["switched right c"],
        ["No handler for right,d"],

        // [bonus]
        ["left a"],
        ["right b"],
        ["bonus right c"],
        ["No handler for right,d"],

        // [bonus, switched] — switched is on top
        ["left a"],
        ["switched right b"],
        ["switched right c"],
        ["No handler for right,d"],
      ]);
    });

    it("masks a lower handler with a no-op layer handler", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", { a: () => spy("base a") });
      events.layer("modal", { a: () => {} });
      events.enter("base");
      events.enter("modal");

      const handled = events.trigger(["a"]);

      expect(handled).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    });

    it("redefining a layer replaces its handlers", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("modal", { a: () => spy("old") });
      events.enter("modal");
      events.layer("modal", { a: () => spy("new") });

      events.trigger(["a"]);

      expect(spy.mock.calls).toEqual([["new"]]);
    });
  });

  describe("pass-through", () => {
    it("falls through to lower layers when a handler returns false", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", { key: { x: () => spy("base x") } });
      events.enter("base");

      events.layer("tool", {
        key: {
          x: (active: boolean) => {
            if(!active)
              return false;

            spy("tool x");
          },
        },
      });
      events.enter("tool");

      events.trigger(["key", "x"], true);
      events.trigger(["key", "x"], false);

      expect(spy.mock.calls).toEqual([["tool x"], ["base x"]]);
    });

    it("reports unhandled when every handler passes", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", { a: () => false });
      events.enter("base");
      events.onUnhandled(id => spy("unhandled", id));

      const handled = events.trigger(["a"]);

      expect(handled).toBe(false);
      expect(spy.mock.calls).toEqual([["unhandled", ["a"]]]);
    });
  });

  describe("_any capture-all", () => {
    it("catches events under its node, receiving the rest path and args", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("dialog", {
        key: { _any: (rest: string[], payload: string) => spy(rest, payload) },
      });
      events.enter("dialog");

      const handled = events.trigger(["key", "x"], "evt");

      expect(handled).toBe(true);
      expect(spy.mock.calls).toEqual([[["x"], "evt"]]);
    });

    it("exact handlers win over _any in the same layer", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("dialog", {
        key: {
          x: () => spy("exact"),
          _any: () => spy("any"),
        },
      });
      events.enter("dialog");

      events.trigger(["key", "x"]);
      events.trigger(["key", "z"]);

      expect(spy.mock.calls).toEqual([["exact"], ["any"]]);
    });

    it("the nearest _any wins, walking up from the deepest matched node", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("dialog", {
        _any: (rest: string[]) => spy("root", rest),
        key: { _any: (rest: string[]) => spy("key", rest) },
      });
      events.enter("dialog");

      events.trigger(["key", "x"]);
      events.trigger(["pointer", "down"]);

      expect(spy.mock.calls).toEqual([
        ["key", ["x"]],
        ["root", ["pointer", "down"]],
      ]);
    });

    it("masks lower layers, like a blocking modal", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", { key: { x: () => spy("base x") } });
      events.layer("dialog", { key: { _any: () => {} } });
      events.enter("base");
      events.enter("dialog");

      const handled = events.trigger(["key", "x"]);

      expect(handled).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    });

    it("declining with false moves to the next layer, not a shallower _any", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", { key: { x: () => spy("base x") } });
      events.layer("dialog", {
        _any: () => spy("root any"),
        key: { _any: () => false },
      });
      events.enter("base");
      events.enter("dialog");

      events.trigger(["key", "x"]);

      expect(spy.mock.calls).toEqual([["base x"]]);
    });

    it("does not catch the _enter/_exit lifecycle keys", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("dialog", { _any: () => spy("any") });

      events.enter("dialog");
      events.exit("dialog");

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("stack changes", () => {
    it("enter is idempotent", () => {
      const events = EventRouter();

      events.enter("modal");
      events.enter("modal");

      expect(events.active()).toEqual(["modal"]);
    });

    it("toggle with an explicit flag enables and disables", () => {
      const events = EventRouter();

      events.toggle("alt", true);
      events.toggle("alt", true);
      expect(events.active()).toEqual(["alt"]);

      events.toggle("alt", false);
      expect(events.active()).toEqual([]);
    });

    it("toggle without a flag flips the layer", () => {
      const events = EventRouter();

      events.toggle("alt");
      expect(events.isActive("alt")).toBe(true);

      events.toggle("alt");
      expect(events.isActive("alt")).toBe(false);
    });

    it("replace changes a matching layer in place, preserving stack order", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("mode:select", { a: () => spy("select a") });
      events.layer("mode:adjust", { a: () => spy("adjust a") });
      events.layer("alt", { a: () => spy("alt a") });

      events.replace("mode:", "mode:select");
      events.enter("alt");
      events.replace("mode:", "mode:adjust");

      expect(events.active()).toEqual(["mode:adjust", "alt"]);

      // alt stayed on top of the replaced mode layer
      events.trigger(["a"]);
      expect(spy.mock.calls).toEqual([["alt a"]]);
    });

    it("replace enters the layer when no name matches the prefix", () => {
      const events = EventRouter();

      events.replace("mode:", "mode:select");

      expect(events.active()).toEqual(["mode:select"]);
    });

    it("replace with the current layer is a no-op", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("mode:select", { _enter: () => spy("enter") });

      events.replace("mode:", "mode:select");
      events.replace("mode:", "mode:select");

      expect(events.active()).toEqual(["mode:select"]);
      expect(spy.mock.calls).toEqual([["enter"]]);
    });

    it("active() returns a copy, not the live stack", () => {
      const events = EventRouter();

      events.enter("modal");
      events.active().push("hacked");

      expect(events.active()).toEqual(["modal"]);
    });
  });

  describe("set & clear", () => {
    it("set overwrites the entire stack in one call", () => {
      const events = EventRouter();

      events.enter("a");
      events.enter("b");

      events.set(["b", "c"]);

      expect(events.active()).toEqual(["b", "c"]);
    });

    it("set fires _exit for removed and _enter for added, but not for retained layers", () => {
      const events = EventRouter();
      const spy = jest.fn();

      ["a", "b", "c"].forEach(name => events.layer(name, {
        _enter: () => spy(`${name} enter`),
        _exit: () => spy(`${name} exit`),
      }));

      events.enter("a");
      events.enter("b");
      spy.mockClear();

      events.set(["b", "c"]);

      expect(spy.mock.calls).toEqual([["a exit"], ["c enter"]]);
    });

    it("set notifies onChange once", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.enter("a");
      events.onChange(spy);

      events.set(["b", "c"]);

      expect(spy.mock.calls).toEqual([[["b", "c"]]]);
    });

    it("set is a no-op when the stack already matches", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.enter("a");
      events.enter("b");
      events.onChange(spy);

      events.set(["a", "b"]);

      expect(spy).not.toHaveBeenCalled();
    });

    it("set reorders retained layers without firing lifecycle handlers", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("a", { _enter: () => spy("a enter"), _exit: () => spy("a exit") });
      events.layer("b", { hit: () => spy("b hit") });

      events.enter("a");
      events.enter("b");
      spy.mockClear();

      events.set(["b", "a"]);

      expect(events.active()).toEqual(["b", "a"]);
      events.trigger(["hit"]);
      expect(spy.mock.calls).toEqual([["b hit"]]);
    });

    it("set dedupes repeated names", () => {
      const events = EventRouter();

      events.set(["a", "b", "a"]);

      expect(events.active()).toEqual(["a", "b"]);
    });

    it("clear empties the stack, firing _exit top-down", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("bottom", { _exit: () => spy("bottom exit") });
      events.layer("top", { _exit: () => spy("top exit") });

      events.enter("bottom");
      events.enter("top");

      events.clear();

      expect(events.active()).toEqual([]);
      expect(spy.mock.calls).toEqual([["top exit"], ["bottom exit"]]);
    });
  });

  describe("onChange", () => {
    it("notifies subscribers with the new stack on every change", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.onChange(spy);

      events.enter("mode:select");
      events.toggle("alt", true);
      events.replace("mode:", "mode:adjust");
      events.exit("alt");

      expect(spy.mock.calls).toEqual([
        [["mode:select"]],
        [["mode:select", "alt"]],
        [["mode:adjust", "alt"]],
        [["mode:adjust"]],
      ]);
    });

    it("does not notify on no-op changes", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.enter("modal");
      events.onChange(spy);

      events.enter("modal");
      events.exit("missing");
      events.toggle("modal", true);
      events.replace("mod", "modal");

      expect(spy).not.toHaveBeenCalled();
    });

    it("supports multiple subscribers and unsubscribing", () => {
      const events = EventRouter();
      const first = jest.fn();
      const second = jest.fn();

      const unsubscribe = events.onChange(first);
      events.onChange(second);

      events.enter("a");
      unsubscribe();
      events.enter("b");

      expect(first.mock.calls).toEqual([[["a"]]]);
      expect(second.mock.calls).toEqual([[["a"]], [["a", "b"]]]);
    });

    it("watches a single layer by name, firing only on its transitions", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.onChange("tool:move", enabled => spy(enabled));

      events.enter("other");
      events.enter("tool:move");
      events.enter("tool:move");
      events.exit("other");
      events.exit("tool:move");

      expect(spy.mock.calls).toEqual([[true], [false]]);
    });

    it("does not fire a named watcher at subscribe time", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.enter("modal");
      events.onChange("modal", spy);

      expect(spy).not.toHaveBeenCalled();
    });

    it("replace notifies the watchers of both layers", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.onChange("mode:select", enabled => spy("select", enabled));
      events.onChange("mode:adjust", enabled => spy("adjust", enabled));

      events.replace("mode:", "mode:select");
      events.replace("mode:", "mode:adjust");

      expect(spy.mock.calls).toEqual([
        ["select", true],
        ["select", false],
        ["adjust", true],
      ]);
    });

    it("unsubscribes a named watcher", () => {
      const events = EventRouter();
      const spy = jest.fn();

      const unsubscribe = events.onChange("modal", spy);

      events.enter("modal");
      unsubscribe();
      events.exit("modal");

      expect(spy.mock.calls).toEqual([[true]]);
    });

    it("passes a copy of the stack, not the live array", () => {
      const events = EventRouter();
      const seen: string[][] = [];

      events.onChange(active => seen.push(active));

      events.enter("modal");
      seen[0].push("hacked");

      expect(events.active()).toEqual(["modal"]);
    });
  });

  describe("onTrigger", () => {
    it("reports which layer handled each event, or null", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", { a: () => {}, b: () => {} });
      events.layer("modal", { a: () => {} });
      events.enter("base");
      events.enter("modal");

      events.onTrigger((id, eventArgs, handledBy) => spy(id, eventArgs, handledBy));

      events.trigger(["a"], 1);
      events.trigger(["b"], 2);
      events.trigger(["c"], 3);

      expect(spy.mock.calls).toEqual([
        [["a"], [1], "modal"],
        [["b"], [2], "base"],
        [["c"], [3], null],
      ]);
    });

    it("reports the handler that consumed after pass-through", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("base", { a: () => {} });
      events.layer("modal", { a: () => false });
      events.enter("base");
      events.enter("modal");

      events.onTrigger((_id, _eventArgs, handledBy) => spy(handledBy));

      events.trigger(["a"]);

      expect(spy.mock.calls).toEqual([["base"]]);
    });
  });

  describe("lifecycle", () => {
    it("fires _enter and _exit once each despite repeated calls", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("modal", {
        _enter: () => spy("enter"),
        _exit: () => spy("exit"),
      });

      events.enter("modal");
      events.enter("modal");
      events.exit("modal");
      events.exit("modal");

      expect(spy.mock.calls).toEqual([["enter"], ["exit"]]);
    });

    it("replace fires _exit on the old layer and _enter on the new one", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("mode:select", {
        _enter: () => spy("select enter"),
        _exit: () => spy("select exit"),
      });
      events.layer("mode:adjust", {
        _enter: () => spy("adjust enter"),
        _exit: () => spy("adjust exit"),
      });

      events.replace("mode:", "mode:select");
      events.replace("mode:", "mode:adjust");

      expect(spy.mock.calls).toEqual([
        ["select enter"],
        ["select exit"],
        ["adjust enter"],
      ]);
    });

    it("does not route _enter/_exit through trigger lifecycle implicitly", () => {
      const events = EventRouter();
      const spy = jest.fn();

      events.layer("modal", { _enter: () => spy("enter") });

      events.trigger(["a"]);

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
