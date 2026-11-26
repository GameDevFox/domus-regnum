import { Object3D } from "three";

import { children } from "@kitsune/common-web/src/registry";
import { Scope } from "@kitsune/common-web/src/scope";
import { isValue, UsedAs, Value } from "@kitsune/common-web/src/value";

import { defaultBlocks } from "./block-kinds";
import { disposeDeep } from "./dispose";
import { applyTransform, resolveTransform } from "./transform";
import { BlockParams, BlockRegistry, isGridPlacement, Level } from "./types";

// The interpreter: mount a (possibly reactive) level into a Three parent, resolving each placement
// to a block instance via the registry. Built on the reactive `each`, so editing the level data —
// adding/removing/changing placements — live-updates the scene. This is what makes the data-driven
// authoring + future editor work without a rebuild.
//
// Each placement gets its own effect that rebuilds-on-change: change a placement's params or
// position and only that block re-renders. Grid blocks get `tile` injected into their params so
// floors/walls size to the cell.
export const mountLevel = (
  scope: Scope,
  parent: Object3D,
  level: UsedAs<Level>,
  registry: BlockRegistry = defaultBlocks,
): void => {
  const levelV: Value<Level> = isValue(level) ? (level as Value<Level>) : Value(level as Level);
  const tileV = scope.computed((use) => use(levelV).tile);
  const placementsV = scope.computed((use) => use(levelV).placements);

  children(scope, parent, (kids) => {
    // Keyed by placement id when present (the parametric deriver stamps `nodeId/localKey`),
    // so an edit rebuilds only the blocks whose placement actually changed. Id-less
    // (hand-authored) placements fall back to index keys — the original behavior.
    kids.each(
      placementsV,
      (k, item) => {
        let mesh: Object3D | null = null;
        const teardown = () => {
          if (mesh) {
            parent.remove(mesh);
            disposeDeep(mesh);
            mesh = null;
          }
        };

        // Re-runs when this placement OR the tile size changes — so live edits reflect immediately.
        k.scope.effect((use) => {
          const placement = use(item);
          const tile = use(tileV);
          teardown();

          const factory = registry[placement.block];
          if (!factory) {
            // Unknown block id — skip it loudly rather than crashing the whole level.
            console.warn(`[blocks] unknown block kind "${placement.block}"`);
            return;
          }

          // tile, span, and runStart (the world coordinate of an edge block's left end along its run)
          // are injected for grid blocks so factories can size, span, and align textures across
          // segments; never stored in the data.
          const params: BlockParams = isGridPlacement(placement)
            ? {
                ...placement.params,
                tile,
                span: placement.span ?? 1,
                // A region block's extent in cells (default 1×1) — a factory uses it to build one
                // merged, tiled mesh instead of a single cell. Flattened to two numbers since params
                // must stay JSON-scalar.
                ...(placement.size ? { sizeW: placement.size[0], sizeH: placement.size[1] } : {}),
                // …unless the placement AUTHORED a runStart (the parametric `walls` kind computes
                // texture-circuit starts for perimeter continuity — don't clobber them).
                ...(placement.edge && placement.params?.runStart === undefined
                  ? {
                      runStart:
                        placement.edge === "N" || placement.edge === "S"
                          ? (placement.cell[0] - 0.5) * tile
                          : (placement.cell[1] - 0.5) * tile,
                    }
                  : {}),
              }
            : { ...placement.params };

          const built = factory(k.scope, params);
          applyTransform(built.mesh, resolveTransform(placement, tile));
          // Tag the block's root with its placement so a raycast hit (e.g. the editor's pick) can map
          // back to which placement was clicked. Refreshed on every rebuild, so it stays current.
          built.mesh.userData.placement = placement;
          parent.add(built.mesh);
          mesh = built.mesh;
        });

        k.scope.add(teardown);
      },
      { key: (p, i) => p.id ?? i },
    );
  });
};
