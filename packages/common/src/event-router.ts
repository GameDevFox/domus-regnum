export type EventHandler = (...eventArgs: any[]) => unknown;

export type HandlerTree = {
  [key: string]: HandlerTree | EventHandler | undefined,
};

type Resolved = {
  fn: EventHandler,
  /** Empty for an exact match; the unmatched id remainder for an `_any` catch. */
  rest: string[],
};

const resolve = (tree: HandlerTree | undefined, id: string[]): Resolved | undefined => {
  if(tree === undefined)
    return undefined;

  const visited: HandlerTree[] = [];
  let node: HandlerTree | EventHandler | undefined = tree;

  for(const key of id) {
    if(node === undefined || typeof node === "function")
      break;

    visited.push(node);
    node = node[key];
  }

  if(visited.length === id.length && typeof node === "function")
    return { fn: node, rest: [] };

  for(let i = visited.length - 1; i >= 0; i--) {
    const fallback = visited[i]._any;
    if(typeof fallback === "function")
      return { fn: fallback, rest: id.slice(i) };
  }

  return undefined;
};

export type EventRouter = {
  /**
   * Route an event to the top-most active layer that handles it, falling
   * through to lower layers. A handler consumes the event unless it returns
   * exactly `false`. Returns whether anything handled it.
   */
  trigger: (id: string[], ...eventArgs: any[]) => boolean,

  /**
   * Define (or replace) a named layer's handler tree. The reserved keys
   * `_enter` / `_exit` are invoked when the layer is entered/exited. A node
   * may define the reserved key `_any` as a catch-all for events under it
   * with no exact handler — called as `(rest, ...eventArgs)` where `rest` is
   * the id remainder relative to the node. The nearest `_any` to the event
   * wins; one handler fires per layer per event.
   * By convention, always-on default bindings live in a layer named `base`,
   * entered before any mode layers so it sits at the bottom of the stack.
   */
  layer: (name: string, tree: HandlerTree) => void,

  /** Push a layer onto the top of the stack. No-op if already active. */
  enter: (name: string) => void,
  /** Remove a layer from the stack. No-op if not active. */
  exit: (name: string) => void,
  /** Enter/exit by flag, or flip when no flag is given. */
  toggle: (name: string, enable?: boolean) => void,
  /**
   * Replace the active layer whose name starts with `prefix` in place,
   * preserving its position in the stack — for mutually exclusive mode
   * families like `mode:select` / `mode:adjust`. Enters the layer normally
   * when nothing matches the prefix.
   */
  replace: (prefix: string, name: string) => void,
  /**
   * Overwrite the entire stack in one call — for restoring saved modal
   * state. Fires `_exit` for layers leaving (top-down) and `_enter` for
   * layers arriving (bottom-up); layers that merely move fire nothing.
   * Notifies `onChange` once. No-op if the stack already matches.
   */
  set: (names: string[]) => void,
  /** Exit every layer, firing `_exit` top-down. Equivalent to `set([])`. */
  clear: () => void,

  isActive: (name: string) => boolean,
  /** The active layer names, bottom to top. Returns a copy. */
  active: () => string[],
  /**
   * Observe stack changes; fires after every change that actually altered
   * the stack. Returns an unsubscribe function.
   *
   * - `onChange(fn)` — `fn` receives a copy of the new stack.
   * - `onChange(name, fn)` — `fn` receives a boolean, fired only when that
   *   layer's activation transitions. Not fired at subscribe time; read
   *   `isActive(name)` for the initial state.
   *
   * This is the observer-side counterpart of `_enter`/`_exit`: lifecycle
   * handlers belong to the layer's own definition, watchers belong to
   * outside code (UI, mirrors) that doesn't own the layer.
   */
  onChange: {
    (fn: (active: string[]) => void): () => void,
    (name: string, fn: (enabled: boolean) => void): () => void,
  },

  /** Called when no handler consumes a triggered event. */
  onUnhandled: (fn: (id: string[], eventArgs: any[]) => void) => void,
  /**
   * Trace every dispatch: `handledBy` is the consuming layer's name, or
   * `null` when nothing consumed the event.
   */
  onTrigger: (fn: (id: string[], eventArgs: any[], handledBy: string | null) => void) => void,
};

export const EventRouter = (): EventRouter => {
  const layers: Record<string, HandlerTree> = {};
  const stack: string[] = [];
  let unhandled: (id: string[], eventArgs: any[]) => void = () => {};
  let trace: (id: string[], eventArgs: any[], handledBy: string | null) => void = () => {};
  const subscribers: ((active: string[]) => void)[] = [];

  const notify = () => {
    subscribers.forEach(fn => fn(stack.slice()));
  };

  // Direct lookup so a layer's `_any` never intercepts lifecycle keys
  const fireLifecycle = (name: string, key: "_enter" | "_exit") => {
    const tree = layers[name];
    const fn = tree && tree[key];
    if(typeof fn === "function")
      fn();
  };

  const isActive = (name: string) => stack.indexOf(name) !== -1;

  const addSubscriber = (fn: (active: string[]) => void) => {
    subscribers.push(fn);

    return () => {
      const index = subscribers.indexOf(fn);
      if(index !== -1)
        subscribers.splice(index, 1);
    };
  };

  const onChange: EventRouter["onChange"] = (
    fnOrName: string | ((active: string[]) => void),
    maybeFn?: (enabled: boolean) => void,
  ) => {
    if(typeof fnOrName !== "string")
      return addSubscriber(fnOrName);

    const name = fnOrName;
    const fn = maybeFn as (enabled: boolean) => void;
    let previous = isActive(name);

    return addSubscriber(() => {
      const enabled = isActive(name);
      if(enabled === previous)
        return;

      previous = enabled;
      fn(enabled);
    });
  };

  const enter = (name: string) => {
    if(isActive(name))
      return;

    stack.push(name);
    fireLifecycle(name, "_enter");
    notify();
  };

  const exit = (name: string) => {
    const index = stack.indexOf(name);
    if(index === -1)
      return;

    stack.splice(index, 1);
    fireLifecycle(name, "_exit");
    notify();
  };

  const toggle = (name: string, enable?: boolean) => {
    const on = enable === undefined ? !isActive(name) : enable;

    if(on)
      enter(name);
    else
      exit(name);
  };

  const replace = (prefix: string, name: string) => {
    const index = stack.findIndex(active => active.startsWith(prefix));
    if(index === -1) {
      enter(name);
      return;
    }

    const previous = stack[index];
    if(previous === name)
      return;

    if(isActive(name)) {
      exit(previous);
      return;
    }

    fireLifecycle(previous, "_exit");
    stack.splice(index, 1, name);
    fireLifecycle(name, "_enter");
    notify();
  };

  const set = (names: string[]) => {
    const next: string[] = [];
    names.forEach(name => {
      if(next.indexOf(name) === -1)
        next.push(name);
    });

    const unchanged = stack.length === next.length
      && stack.every((name, index) => name === next[index]);
    if(unchanged)
      return;

    const exited = stack.filter(name => next.indexOf(name) === -1).reverse();
    const entered = next.filter(name => !isActive(name));

    stack.splice(0, stack.length, ...next);

    exited.forEach(name => fireLifecycle(name, "_exit"));
    entered.forEach(name => fireLifecycle(name, "_enter"));

    notify();
  };

  const trigger = (id: string[], ...eventArgs: any[]) => {
    for(let i = stack.length - 1; i >= 0; i--) {
      const name = stack[i];
      const resolved = resolve(layers[name], id);
      if(!resolved)
        continue;

      const { fn, rest } = resolved;
      const result = rest.length === 0 ? fn(...eventArgs) : fn(rest, ...eventArgs);
      if(result !== false) {
        trace(id, eventArgs, name);
        return true;
      }
    }

    trace(id, eventArgs, null);
    unhandled(id, eventArgs);
    return false;
  };

  return {
    trigger,

    layer: (name, tree) => { layers[name] = tree; },

    enter,
    exit,
    toggle,
    replace,
    set,
    clear: () => set([]),

    isActive,
    active: () => stack.slice(),
    onChange,

    onUnhandled: fn => { unhandled = fn; },
    onTrigger: fn => { trace = fn; },
  };
};
