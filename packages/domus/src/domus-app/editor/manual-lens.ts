import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { Level, Placement } from "../../blocks/types";

import { addNode, MANUAL_NODE_ID, setProp } from "../../parametric/edit";
import { ParametricDoc, PropValue } from "../../parametric/types";

// The manual-node lens. Hand tools (stamp/grab/region/…) operate on a plain `Level` via the pure ops
// in blocks/edit.ts — but that Level is a LENS over the doc's `manual-1` placements node: read it out,
// apply the op, write it back. Generated placements (other nodes' output) stay read-only until
// detach-to-bake. Factored out of editorApp so the hand-tool read/write surface is one cohesive unit
// depending only on `doc`/`commit`/`scope`.
export const manualLens = (
  doc: Value<ParametricDoc>,
  commit: (d: ParametricDoc) => void,
  scope: Scope,
) => {
  const manualListOf = (d: ParametricDoc): Placement[] =>
    (d.nodes.find((n) => n.id === MANUAL_NODE_ID)?.props.list as Placement[] | undefined) ?? [];
  const manualLevel = (): Level => {
    const d = doc.peek();
    return { name: d.name, tile: d.tile, placements: manualListOf(d) };
  };
  const withManual = (d: ParametricDoc, placements: Placement[]): ParametricDoc => {
    const base = d.nodes.some((n) => n.id === MANUAL_NODE_ID)
      ? d
      : addNode(d, {
          id: MANUAL_NODE_ID,
          kind: "placements",
          label: "Hand-placed",
          props: { list: [] },
        });
    // STABLE UIDS: every hand-placed block gets a persistent local id (saved in the doc, used
    // by the deriver as its placement key) — so deleting one block no longer shifts the keys
    // of everything after it (which made keyed mounting rebuild all those meshes). Existing
    // ids are kept; only new items are stamped with the next free u<N>.
    let next =
      placements.reduce((m, p) => {
        const n = p.id?.startsWith("u") ? Number(p.id.slice(1)) : NaN;
        return Number.isFinite(n) && n > m ? n : m;
      }, 0) + 1;
    const withIds = placements.map((p) => (p.id ? p : { ...p, id: `u${next++}` }));
    return setProp(base, MANUAL_NODE_ID, "list", withIds as unknown as PropValue);
  };
  const setManual = (lvl: Level) => doc.set(withManual(doc.peek(), lvl.placements)); // live, no history
  const commitManual = (lvl: Level) => commit(withManual(doc.peek(), lvl.placements)); // one undo step
  // Reactive manual list — selection/grab indices index into THIS, not the derived level.
  const manualV = scope.computed((use) => manualListOf(use(doc)));
  // A derived placement's stamped id → its index in the manual list (null for generated blocks). The
  // local key is the placement's persistent uid when it has one (see withManual), falling back to its
  // index — mirror the deriver's `p.id ?? index` precedence.
  const manualIndexOf = (p: Placement): number | null => {
    if (!p.id?.startsWith(`${MANUAL_NODE_ID}/`)) return null;
    const key = p.id.slice(MANUAL_NODE_ID.length + 1);
    const idx = manualV.peek().findIndex((m, i) => (m.id ?? String(i)) === key);
    return idx >= 0 ? idx : null;
  };
  return { manualListOf, manualLevel, withManual, setManual, commitManual, manualV, manualIndexOf };
};
