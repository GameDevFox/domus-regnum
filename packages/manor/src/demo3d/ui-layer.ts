import type { Scope } from "@scene-lib/scope";
import { Value } from "@scene-lib/value";

// The page's furniture, in one place. Everything on the page that is not the picture of the house
// is put into one element (`#ui`, demo3d.html): the panel, the clock, the floor chooser, the map and
// its button, the round buttons, every card, menu and window, the notes that pop up, the graph. So
// all of it can be put away at once, and brought back at once (the author's, 2026-11-18: "Organize UI
// elements so they can all be easily hid during a cutscene").
//
// Three things are on the page and not in it, because they are what the furniture is put away
// for, or over: the scene itself (scene-stage.ts), the black before and after it (curtain.ts), and
// the loading screen (demo3d.html). ui-layer.test.ts holds every other part of the page to this.
//
// The developer's tools are furniture of another kind, in an element of their own (`#dev-tools`):
// the wrench, the dev menu, the windows opened from it, its notice. A player never sees them (dev
// mode is locked until the false book is pulled), and they are wanted over a scene: the wrench
// was made to stay to hand over one, and the palette window repaints a portrait while it is on
// show. So they are not put away with the rest; being in one element, they could be as easily.
//
// The element has no place or order of its own: what is in it is drawn where and as high as it
// was (each by its own z-index, keys.ts `LAYER`). Put away, it is out of the page (`hidden`), not
// merely unseen, so nothing in it can be pressed or tabbed to.

const UI_ID = "ui";
const DEV_ID = "dev-tools";

/** Where a part of the page puts what it shows: the page's furniture (the page itself, where there is no such element). */
export const ui = (): HTMLElement => document.getElementById(UI_ID) ?? document.body;
/** Where the developer's tools are put: an element of their own, which a scene does not put away. */
export const devTools = (): HTMLElement => document.getElementById(DEV_ID) ?? document.body;
/**
 * Put something on the page itself, outside the furniture: only the scene and the black are. It goes
 * before the developer's tools, so that of two things drawn as high as each other (the scene and
 * the dev menu are) the developer's is on top, as it was when both were put last on the page.
 */
export const onThePage = (node: HTMLElement): void => void document.body.insertBefore(node, document.getElementById(DEV_ID));

type LayerProps = {
  /** Ticks once a frame, in seconds. */
  frame: Value<number>;
  /** Whether the furniture is to be away just now: asked once a frame. */
  away: () => boolean;
};

/**
 * Puts the page's furniture away while `away` says so, and brings it back when it no longer does.
 * Returns whether it is away, for whatever lays the page out round the furniture (the picture of
 * the house is slid aside for the panel, and has the whole window while the panel is away).
 */
export const mountUiLayer = (scope: Scope, { frame, away }: LayerProps): Value<boolean> => {
  const isAway = Value(false);
  scope.effect((use) => {
    use(frame);
    isAway.set(away());
  });
  scope.effect((use) => {
    ui().hidden = use(isAway);
  });
  scope.add(() => (ui().hidden = false));
  return isAway;
};
