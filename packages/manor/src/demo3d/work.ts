import type { Raycaster } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import type { Game, JobId } from "../game";
import { mountGardenMenu } from "./garden-menu";
import type { View } from "./house-view";
import { PlaceIcons } from "./place-icons";
import type { PlaceIcons as Icons } from "./place-icons";
import { mountWorkCard } from "./work-card";
import { WORKPLACES } from "./workplaces";

// The places of work, put up together: each one's card, and its icon over the place in the 3D
// view. One card is open at a time; an icon, or the card's key, opens and shuts it.

type WorkProps = { game: Game; /** Ticks once a frame, in seconds. */ frame: Value<number>; view: Value<View> };

export type Work = {
  /** The icons, to be stood in the scene: the ground floor's and the grounds'. */
  icons: Icons;
  /** A press, as a ray into the picture: on an icon, it opens that place's card (or shuts it), and says that it was. */
  press: (ray: Raycaster) => boolean;
  /** Whether each place's card is open. */
  open: Record<JobId, Value<boolean>>;
};

export const mountWork = (scope: Scope, { game, frame, view }: WorkProps): Work => {
  // (The garden's card has its plots, and is its own; the rest are the one card.)
  const open = Object.fromEntries(WORKPLACES.map((place) => [place.job, place.job === "garden" ? mountGardenMenu(scope, { game, frame }) : mountWorkCard(scope, { game, frame, place })])) as Record<JobId, Value<boolean>>;
  // One at a time: opening one shuts the others.
  for (const mine of Object.values(open)) {
    scope.effect((use) => {
      if (!use(mine)) return;
      for (const other of Object.values(open)) if (other !== mine) other.set(false);
    });
  }
  const icons = PlaceIcons(scope, { game, frame, view, isOpen: (job) => open[job].peek() });
  return {
    icons,
    open,
    press: (ray) => {
      const job = icons.at(ray);
      if (job) open[job].update((o) => !o);
      return job !== null;
    },
  };
};
