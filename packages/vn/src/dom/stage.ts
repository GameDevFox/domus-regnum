// A dependency-free DOM renderer for the VN runtime — the "dialogue box + choices as a DOM overlay"
// half of the design (docs/design/12-vn-engine.md §4d). It subscribes to engine snapshots and
// renders sprites, the textbox, and the choice menu as plain DOM, wiring click-to-advance and
// click-to-choose. Because it's DOM, it composites over a game <canvas> for free via CSS stacking —
// no WebGL needed. A Three.js sprite layer (for GL blending with the 3D world) can replace the
// sprite rendering here later; the textbox/choices stay DOM.
//
// Plain DOM, zero dependencies. All `document` access happens inside functions, so importing this
// module in a non-browser context (e.g. node tests of the core) is safe.

import { ActorChange, Engine, SceneEntry, Snapshot } from "../runtime";

import { RevealWalk } from "../reveal";
import { parseRichText, plainText, SegmentStyle, textSegments } from "../rich-text";

import { ActorTracker } from "./actor-events";

export type StageOptions = {
  // Map a script image name to an asset URL. Return null (the default) to render a labeled
  // placeholder silhouette instead — so a script runs and screenshots cleanly with no art yet.
  resolveImage?: (image: string) => string | null;
  // Layer names whose entries fill the stage as a backdrop (cover), rather than standing as a
  // sprite. Defaults to ["bg"].
  backgroundLayers?: string[];
  // Render the background + sprite layers in the DOM. Default true. Set false in a hybrid setup
  // where a canvas renderer (mountSprites) draws them, leaving the DOM box to show only the
  // dialogue + choices over the transparent canvas.
  sprites?: boolean;
  // Typewriter reveal speed in characters per second. Default 0 = OFF (lines appear whole, a click
  // advances). Set a positive value to enable the reveal — then the first click completes the line
  // and the next advances. (Infinity also = instant.)
  textSpeed?: number;
  // Actor lifecycle events: fired when an actor's persistent state changes (the script's `actor`
  // statements / say options) or its reveal-bound `talking` flips — start of the typewriter reveal
  // → true, settle (including an early completing click) → false; instant lines pulse both. Mount
  // flushes current state per actor; unmount flushes talking:false for a live speaker.
  onActorChange?: (e: ActorChange) => void;
};

export type StageHandle = {
  root: HTMLElement;
  unmount: () => void;
};

const setStyle = (el: HTMLElement, style: Partial<CSSStyleDeclaration>) => {
  Object.assign(el.style, style);
};

const div = (style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement => {
  const el = document.createElement("div");
  setStyle(el, style);
  return el;
};

// Position one sprite from its Transform. x/y are normalized 0..1 across the stage and mark the
// sprite's bottom-center anchor (translate below). Default is centered horizontally with its bottom
// on the stage floor (x 0.5, y 1) — the usual Ren'Py "sprite stands at the bottom" placement.
// zoom scales; alpha is opacity.
const placeSprite = (el: HTMLElement, entry: SceneEntry) => {
  const t = entry.transform;
  const x = t.x ?? 0.5;
  const y = t.y ?? 1;
  const zoom = t.zoom ?? 1;
  setStyle(el, {
    position: "absolute",
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    transform: `translate(-50%, -100%) scale(${zoom})`,
    opacity: String(t.alpha ?? 1),
    zIndex: String(t.z ?? 0),
    transition: "opacity 200ms ease, transform 200ms ease",
  });
};

// A backdrop fills the stage. With a URL it's a cover image; without, a soft vignette captioned
// with the image name so a scene reads even before art exists.
const renderBackground = (entry: SceneEntry, opts: StageOptions): HTMLElement => {
  const url = opts.resolveImage?.(entry.image) ?? null;
  const el = div({
    position: "absolute",
    inset: "0",
    opacity: String(entry.transform.alpha ?? 1),
    zIndex: String(entry.transform.z ?? 0),
  });
  if (url) {
    setStyle(el, { background: `center/cover no-repeat url("${url}")` });
  } else {
    setStyle(el, {
      background:
        "radial-gradient(120% 90% at 50% 10%, rgba(70,60,100,0.55), rgba(20,16,30,0.85) 70%)",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
    });
    const tag = div({
      marginTop: "14px",
      padding: "4px 10px",
      font: "12px/1 system-ui, sans-serif",
      color: "rgba(255,255,255,0.4)",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: "6px",
    });
    tag.textContent = entry.image;
    el.appendChild(tag);
  }
  return el;
};

const renderSprite = (entry: SceneEntry, opts: StageOptions): HTMLElement => {
  const url = opts.resolveImage?.(entry.image) ?? null;
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = entry.image;
    setStyle(img, { display: "block", height: "70%", imageRendering: "auto" });
    const wrap = div();
    wrap.appendChild(img);
    placeSprite(wrap, entry);
    return wrap;
  }
  // Placeholder silhouette: a soft rounded pillar with the image name. Enough to approve layout
  // and motion before real art exists.
  const el = div({
    width: "180px",
    height: "55vh",
    borderRadius: "90px 90px 24px 24px",
    background: "linear-gradient(180deg, rgba(120,140,200,0.55), rgba(40,50,90,0.75))",
    border: "1px solid rgba(255,255,255,0.25)",
    boxShadow: "0 0 40px rgba(120,140,200,0.35)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    color: "rgba(255,255,255,0.85)",
    font: "600 14px/1.2 system-ui, sans-serif",
    paddingBottom: "16px",
    boxSizing: "border-box",
  });
  el.textContent = entry.image;
  placeSprite(el, entry);
  return el;
};

export const mountStage = (
  engine: Engine,
  container: HTMLElement,
  opts: StageOptions = {},
): StageHandle => {
  const root = div({
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    font: "16px/1.5 Georgia, 'Times New Roman', serif",
    userSelect: "none",
    cursor: "pointer",
  });

  const spriteHost = div({ position: "absolute", inset: "0" });

  // Dialogue box, pinned to the bottom — the classic VN textbox.
  const dialogueBox = div({
    position: "absolute",
    left: "5%",
    right: "5%",
    bottom: "5%",
    minHeight: "120px",
    padding: "20px 24px",
    background: "rgba(15, 12, 24, 0.82)",
    border: "1px solid rgba(210, 180, 140, 0.5)",
    borderRadius: "12px",
    color: "#f3ead9",
    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    backdropFilter: "blur(2px)",
    zIndex: "100",
  });
  const speakerEl = div({
    font: "700 18px/1.2 Georgia, serif",
    color: "#e8c98a",
    marginBottom: "8px",
    letterSpacing: "0.5px",
  });
  const textEl = div({ fontSize: "18px" });
  // The line is rendered as TWO inline spans: the revealed prefix (visible) and the remainder
  // (transparent but still occupying its glyph space). Keeping the FULL line laid out at all times is
  // what kills typewriter word-wrap jitter: the browser wraps the complete text into its final line
  // positions from the first character, so a long word never jumps to the next line mid-reveal — we
  // only ever recolor glyphs, never add them. A window resize reflows both spans together, so the
  // break positions update for free with no manual measurement.
  // (Populated per line by buildLine(): a visible/transparent span PAIR per rich-text segment.)
  const advanceHint = div({
    position: "absolute",
    right: "16px",
    bottom: "10px",
    fontSize: "13px",
    color: "rgba(243,234,217,0.5)",
  });
  advanceHint.textContent = "▼ click to continue";
  dialogueBox.append(speakerEl, textEl, advanceHint);

  // Choice menu, centered.
  const choiceHost = div({
    position: "absolute",
    inset: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    zIndex: "200",
  });

  root.append(spriteHost, dialogueBox, choiceHost);
  container.appendChild(root);

  const backgroundLayers = new Set(opts.backgroundLayers ?? ["bg"]);
  const renderSprites = opts.sprites !== false;
  // Characters per second; default 0 / Infinity = instant (off). The script can override per-beat
  // via the `textSpeed` statement — the snapshot carries the current value, mount option is the
  // fallback, updated in render() so an in-flight reveal changes pace live.
  let cps = opts.textSpeed ?? 0;

  // Typewriter state. Each line is parsed into rich-text segments (Ren'Py-style tags — see
  // rich-text.ts) rendered as a visible/transparent span pair per segment: the full styled line
  // is laid out up front (transparent glyphs keep their metrics, bold/size included), so the
  // reveal never reflows — the original two-span trick, per segment. `fullText` is the TAG-FREE
  // text (cps counts glyphs, markup is free); `rawLine` is the tagged source, for line identity.
  const applySegmentStyle = (el: HTMLElement, st: SegmentStyle) => {
    if (st.bold) el.style.fontWeight = "bold";
    if (st.italic) el.style.fontStyle = "italic";
    const deco = [st.underline && "underline", st.strike && "line-through"].filter(Boolean).join(" ");
    if (deco) el.style.textDecoration = deco;
    if (st.color) el.style.color = st.color;
    if (st.sizePx !== undefined) el.style.fontSize = `${st.sizePx}px`;
    else if (st.sizeDelta !== undefined) el.style.fontSize = `calc(1em + ${st.sizeDelta}px)`;
  };
  type SegmentPair = { vis: HTMLSpanElement; hid: HTMLSpanElement; text: string; start: number };
  let pairs: SegmentPair[] = [];
  let rawLine = "";
  let fullText = "";
  let walk: RevealWalk | null = null; // the pure pacing brain (reveal.ts): rates, pauses, {fast}
  let lastTick = 0;
  let rafId: number | null = null;
  const isSettled = () => walk?.settled() ?? true;

  const buildLine = (raw: string) => {
    rawLine = raw;
    const items = parseRichText(raw);
    fullText = plainText(items);
    walk = RevealWalk(items);
    textEl.replaceChildren();
    pairs = [];
    let start = 0;
    for (const item of items) {
      if (item.kind === "break") {
        textEl.appendChild(document.createElement("br"));
        continue;
      }
      if (item.kind !== "text") continue; // waits/fast are the walk's business, not the DOM's
      const vis = document.createElement("span");
      applySegmentStyle(vis, item.style);
      const hid = document.createElement("span");
      applySegmentStyle(hid, item.style);
      hid.style.color = "transparent"; // after the segment color — invisible but metrically present
      textEl.append(vis, hid);
      pairs.push({ vis, hid, text: item.text, start });
      start += item.text.length;
    }
  };

  // A `wait` beat's timer: armed when a snapshot carries `waiting`, cleared on any newer snapshot
  // (a skipping click advances first and the timer must not double-advance).
  let waitTimer: ReturnType<typeof setTimeout> | undefined;

  // Actor events: the pure tracker diffs state + talking per update; we feed it at every point
  // the reveal lifecycle or the snapshot changes (see actor-events.ts for the semantics).
  const tracker = ActorTracker();
  let lastActors: Record<string, Record<string, unknown>> = {};
  const emitActors = (talkingWho: string | null) => {
    if (!opts.onActorChange) return;
    for (const e of tracker.update(lastActors, talkingWho)) opts.onActorChange(e);
  };

  const paint = () => {
    // Move the reveal boundary through the segment pairs; each pair's combined text is always its
    // full segment, so wrapping never shifts as it reveals.
    const pos = walk?.pos() ?? fullText.length;
    for (const p of pairs) {
      const k = Math.min(Math.max(pos - p.start, 0), p.text.length);
      p.vis.textContent = p.text.slice(0, k);
      p.hid.textContent = p.text.slice(k);
    }
    advanceHint.style.display =
      isSettled() && engine.status() === "awaiting-advance" ? "block" : "none";
  };

  const stopReveal = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };

  const completeReveal = () => {
    stopReveal();
    walk?.completeAll();
    paint();
  };

  // The reveal-bound talking signal, pause-aware: a {w} beat stops the mouth mid-line.
  const talkingNow = (): string | null =>
    engine.snapshot().dialogue?.who && walk?.isTalking() ? engine.snapshot().dialogue!.who! : null;

  const tick = () => {
    if (!walk) return;
    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    const wasTalking = walk.isTalking();
    walk.advanceTime(dt, cps);
    paint();
    if (walk.isTalking() !== wasTalking) emitActors(talkingNow()); // pause hit / timed-pause resumed
    if (walk.settled()) {
      stopReveal();
      emitActors(null); // the sentence finished — the speaker stops talking
    } else if (walk.paused()?.kind === "click") {
      stopReveal(); // idle until the resuming click — no RAF while waiting on the player
    } else {
      rafId = requestAnimationFrame(tick);
    }
  };

  const startReveal = () => {
    stopReveal();
    lastTick = performance.now();
    tick(); // first tick handles instant segments / a leading {w} / an empty line uniformly
  };

  const render = (snap: Snapshot) => {
    cps = snap.textSpeed ?? opts.textSpeed ?? 0;
    lastActors = snap.actors ?? {};
    let newLineWho: string | undefined; // a say that (re)started its reveal in THIS render
    // Sprites: clear and rebuild from the (already z-sorted) layer lists. Background layers fill
    // the stage; everything else stands as a sprite. Skipped entirely in dialogue-only (hybrid)
    // mode, where a canvas renderer draws these instead.
    spriteHost.replaceChildren();
    if (renderSprites) {
      for (const layer of Object.keys(snap.layers)) {
        const isBg = backgroundLayers.has(layer);
        for (const entry of snap.layers[layer]) {
          spriteHost.appendChild(isBg ? renderBackground(entry, opts) : renderSprite(entry, opts));
        }
      }
    }

    // Dialogue.
    if (snap.dialogue) {
      dialogueBox.style.display = "block";
      speakerEl.style.display = snap.dialogue.who ? "block" : "none";
      speakerEl.textContent = snap.dialogue.who ?? "";
      // Restart the typewriter only when the LINE changes — re-renders for sprite/status changes
      // mustn't rewind an in-progress reveal. A restored line (snapshot already settled) shows whole.
      if (snap.dialogue.text !== rawLine) {
        buildLine(snap.dialogue.text);
        if (snap.status === "awaiting-advance") {
          startReveal();
          newLineWho = snap.dialogue.who;
        } else {
          completeReveal();
        }
      } else {
        paint(); // refresh the advance hint against the latest status
      }
    } else {
      stopReveal();
      rawLine = "";
      fullText = "";
      dialogueBox.style.display = "none";
    }

    // Wait beats: hold, then advance. Any newer render clears the pending timer first.
    clearTimeout(waitTimer);
    waitTimer = undefined;
    if (snap.waiting && snap.status === "awaiting-advance") {
      waitTimer = setTimeout(() => engine.advance(), snap.waiting.ms);
    }

    // Actor events for this snapshot. Reveal-bound talking: the speaker of a still-revealing line.
    // An instant line pulses true→false in one render (start event, then the settled state).
    // Pause-aware: revealing counts as talking, a {w} beat does not (walk.isTalking covers both).
    const talkingWho =
      snap.dialogue?.who && snap.status === "awaiting-advance" && walk?.isTalking()
        ? snap.dialogue.who
        : null;
    if (newLineWho && isSettled()) emitActors(newLineWho); // the pulse's leading edge (instant lines)
    emitActors(talkingWho);

    // Choices.
    choiceHost.replaceChildren();
    if (snap.choices) {
      snap.choices.forEach((choice, i) => {
        const btn = document.createElement("button");
        for (const seg of textSegments(parseRichText(choice.text))) {
          const sp = document.createElement("span");
          applySegmentStyle(sp, seg.style);
          sp.textContent = seg.text;
          btn.appendChild(sp);
        }
        setStyle(btn, {
          font: "16px/1.4 Georgia, serif",
          color: "#f3ead9",
          background: "rgba(40, 30, 60, 0.9)",
          border: "1px solid rgba(210, 180, 140, 0.6)",
          borderRadius: "8px",
          padding: "12px 28px",
          cursor: "pointer",
          minWidth: "260px",
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          engine.choose(i);
        });
        choiceHost.appendChild(btn);
      });
    }
  };

  // Two-stage click on a parked `say`: the first click completes a still-revealing line, the next
  // advances. (Choices have their own handlers + stopPropagation.)
  const onClick = () => {
    if (engine.status() !== "awaiting-advance") return;
    if (isSettled() || !walk) {
      engine.advance();
      return;
    }
    walk.click(); // resume a pause, or complete to the NEXT pause (Ren'Py semantics)
    paint();
    emitActors(talkingNow()); // paused → resumed, or revealing → parked at a wait
    if (!walk.settled() && walk.paused()?.kind !== "click") {
      lastTick = performance.now();
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }
    if (walk.settled()) {
      stopReveal();
      emitActors(null);
    }
  };
  root.addEventListener("click", onClick);

  const unsub = engine.subscribe(render);
  render(engine.snapshot()); // paint the current state immediately

  return {
    root,
    unmount: () => {
      stopReveal();
      clearTimeout(waitTimer);
      // The unmount guarantee: a live speaker is never left talking (rigs can't get stuck).
      if (opts.onActorChange) for (const e of tracker.flush()) opts.onActorChange(e);
      unsub();
      root.removeEventListener("click", onClick);
      root.remove();
    },
  };
};
