import { mountSprites } from "@kitsune/vn/three";
import { collectImages, script, type Script } from "@kitsune/vn";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { DomusApp } from ".";

// The VN cutscene component. Mirrors buildComposition / buildBlocksScene: it owns the engine + the
// Three.js sprite renderer, and a `scope.effect` keyed off `vnActive` mounts/unmounts the cutscene
// (publishing the sprite render pass into `vnPass`, which the render loop draws — see
// three-canvas/utils.ts). The dialogue box itself is DOM, mounted React-side (views/VnDialogue).
//
// Why no background layer: the cutscene plays OVER the live household, so we want the running 3D
// scene visible behind the character — the transparent-overlay case. Add a `bg` show to make it
// opaque.

// Domus art lives in /public; map the script's image names to those URLs. The maid is the household
// avatar art (also used by the recolor demo); the mascot stands in as a second speaker.
const DOMUS_ART: Record<string, string> = {
  maid: "/textures/maid.png",
  mascot: "/textures/mascot.png",
};
const resolveImage = (name: string): string | null => DOMUS_ART[name] ?? null;

// A short domus-flavored scene: a maid reports to the lord over the live house. Exercises show,
// narration vs. speaker lines, a branching menu, hide — and per-choice SIDE EFFECTS: each choice
// jumps to a label whose `exec` hook reaches back into the game (here, toggling the item icons via
// the `showItems` Value) before the script continues. `exec` closures can touch any host state, so
// a choice can do anything the game can — not just branch the dialogue.
export const buildVnScript = ({ showItems }: { showItems: Value<boolean> }): Script =>
  script()
    .label("start")
    // Establishing beat: the live house, no one on screen yet.
    .say("Soft candlelight shines throughout the hall. The household is getting settled in for the evening.")
    // The next line introduces her — she slides in from the right wing as it's spoken.
    .show("maid", "maid", { at: { x: 0.74, z: 1 }, enter: { from: "right" } })
    .say("Aki Jr. appears and bows politely")
    .say("Aki Jr.", "Would you like the treasure hoard displayed in the hall, my lord?")
    .menu("Show the treasure?", [
      { text: "“Yes”", target: "showWares" },
      { text: "“No”", target: "hideWares" },
    ])

    // Choice 1: side effect — show the item icons — then continue.
    .label("showWares")
    .exec(() => showItems.set(true))
    .say("{i}She claps twice and instantly the treasure appears in the room.{/}")
    .jump("leave")

    // Choice 2: side effect — hide the item icons — then continue.
    .label("hideWares")
    .exec(() => showItems.set(false))
    .say("Aki Jr.", "{i}She nods.{/} As you wish, my lord.")
    .jump("leave")

    .label("leave")
    .hide("maid")
    .say("{i}She leaves.{/}")
    .say("— end of scene —")
    .build();

type VnDeps = Pick<DomusApp, "time" | "vnActive" | "vnPass" | "vnEngine" | "vnScript">;

export const buildVnScene = ({ time, vnActive, vnPass, vnEngine, vnScript }: VnDeps): Scope => {
  const scope = Scope();

  // The sprite renderer is persistent (created once); it draws whatever the engine's snapshot holds,
  // so an empty/inactive scene simply draws nothing. It reads domus's virtual clock for fades.
  const sprites = mountSprites(vnEngine, { resolveImage, now: () => time.peek() });
  scope.add(() => sprites.unmount());

  // Dev-only probe for the HMR investigation (docs/hmr.md): every buildVnScene instance registers
  // itself, so a test can ask "which instance owns the live pass, and does it have sprites?".
  if (import.meta.env.DEV) {
    const w = window;
    w.__vnDebug ??= { builds: 0, instances: [] };
    w.__vnDebug.builds++;
    const entry = {
      disposed: false,
      isActivePass: () => vnPass.peek() === sprites.render,
      // children minus the fade veil = tracked sprite meshes (incl. ghosts/exiting)
      spriteCount: () => sprites.scene.children.length - 1,
      details: () =>
        sprites.scene.children.map((c) => {
          const m = (c as { material?: { opacity?: number; map?: unknown } }).material;
          return { order: c.renderOrder, opacity: m?.opacity, hasMap: !!m?.map };
        }),
    };
    w.__vnDebug.instances.push(entry);
    scope.add(() => (entry.disposed = true));

    // Watchdog: if the cutscene is up, the engine has on-screen entries, and THIS instance owns
    // the pass but draws nothing visible for >1.5s — dump diagnostics. If "the sprite didn't
    // show up" ever recurs, the console will say exactly which invariant broke (docs/hmr.md).
    scope.effect((use, runScope) => {
      if (!use(vnActive)) return;
      const id = setInterval(() => {
        const snap = vnEngine.snapshot();
        const entries = Object.values(snap.layers).reduce((n, l) => n + l.length, 0);
        const visible = sprites.scene.children.some(
          (c) =>
            c.renderOrder !== 10000 &&
            ((c as { material?: { opacity?: number } }).material?.opacity ?? 0) > 0,
        );
        if (entries > 0 && vnPass.peek() === sprites.render && !visible) {
          console.warn("[vn] sprite watchdog: engine has entries but the active pass draws none", {
            builds: w.__vnDebug?.builds,
            entries,
            status: snap.status,
            details: entry.details(),
          });
        }
      }, 1500);
      runScope.add(() => clearInterval(id));
    });
  }

  // Advancing past the scene's last line ends the cutscene: flip the toggle off, which tears the
  // effect below down (pulls the pass, unmounts the dialogue React-side).
  scope.add(
    vnEngine.subscribe((snap) => {
      if (snap.status === "done") vnActive.set(false);
    }),
  );

  // Mount/unmount on the toggle. We draw the sprite pass immediately (so any backdrop is up), but
  // preload the scene's textures BEFORE starting the script — otherwise the first sprite could slide
  // in untextured. `cancelled` guards a fast toggle-off mid-preload. The progress callback is where a
  // loading indicator would hook in later.
  scope.effect((use, runScope) => {
    if (!use(vnActive)) return;
    let cancelled = false;
    vnPass.set(sprites.render);
    void sprites
      .preload(collectImages(vnScript))
      .then(() => {
        if (!cancelled) vnEngine.start("start");
      })
      .catch((err: unknown) => {
        // A failed preload must not become an unhandled rejection that silently never starts the
        // script — log it and start anyway (loaded sprites show; missing ones just render untextured).
        console.error("[vn] sprite preload failed; starting the cutscene anyway", err);
        if (!cancelled) vnEngine.start("start");
      });
    runScope.add(() => {
      cancelled = true;
      vnPass.set(null);
    });
  });

  return scope;
};

if (import.meta.hot) {
  import.meta.hot.accept();
  window.Kitsune?.updateDep("vnScene", buildVnScene);
}
