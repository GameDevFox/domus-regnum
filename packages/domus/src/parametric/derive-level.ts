import { Scope } from "@kitsune/common-web/src/scope";
import { UsedAs, Value } from "@kitsune/common-web/src/value";

import { Level } from "../blocks/types";

import { EvaluatedDoc } from "./evaluate";
import { ParametricDoc } from "./types";

// The bridge to everything downstream: a live Level derived from the evaluated doc. Feed it
// to the existing currentLevel contract and mountLevel / level-nav / the sims keep working
// untouched — they never learn the parametric layer exists.
export const deriveLevel = (
  scope: Scope,
  doc: UsedAs<ParametricDoc>,
  evaluated: EvaluatedDoc,
): Value<Level> =>
  scope.computed<Level>((use) => {
    const d = use(doc);
    return { name: d.name, tile: d.tile, placements: use(evaluated.placements) };
  });
