import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import type { Game } from "../game";
import type { Plan } from "../space";
import { mountBook } from "./book";
import { mountCalendar } from "./calendar-view";
import { mountCharacterCard } from "./character-card";
import { mountFloors } from "./floors-widget";
import type { View } from "./house-view";
import { mountLab } from "./lab-panel";
import { mountLedger } from "./ledger";
import { mountMarket } from "./market";
import type { DialPlan } from "./plans";
import { mountTransport } from "./transport";
import { mountTurnControl } from "./turn-control";
import { mountCentreToggle } from "./view-centre";
import { mountRoomsToggle, mountWallsToggle } from "./walls-toggle";

// The furniture of the page: the parts of it that want only the game and the page's own values
// to be put up, and give nothing back. Each is its own file; this is where they are all set out,
// so that the page's main file is about the house and how it is looked at. (The map, the list of
// the household, the help and the settings are put up there, since they take and give more.)

type FurnitureProps = {
  game: Game;
  plan: Plan;
  /** Ticks once a frame, in seconds. */
  frame: Value<number>;
  /** Whether the dev menu is unlocked. */
  dev: Value<boolean>;
  /** Open the map: where a question waiting is put. */
  openMap: () => void;
  following: Value<string | null>;
  paused: Value<boolean>;
  /** Whether time stands still for someone told to stay (stay-hold.ts): the clock shows it. */
  staying: Value<boolean>;
  speed: Value<number>;
  /** The game's clock, in minutes; and what the house is waiting for, for the dial. */
  daytime: Value<number>;
  plans: Value<DialPlan[]>;
  calendarOpen: Value<boolean>;
  /** Which storey is looked at, and the going to another. */
  view: Value<View>;
  look: (view: View) => void;
  turn: (direction: 1 | -1) => void;
  /** Whether the walls slide, and the key that says so. */
  slide: Value<boolean>;
  wallsKey: string;
  /** Whether only the rooms with someone in them are opened, and the key that says so. */
  byRoom: Value<boolean>;
  roomsKey: string;
  /** Whether the picture is centred on the window, or in what the panel leaves of it. */
  centred: Value<boolean>;
};

export const mountFurniture = (scope: Scope, { game, plan, frame, dev, following, paused, speed, daytime, plans, calendarOpen, view, look, turn, slide, wallsKey, byRoom, roomsKey, centred, staying, openMap }: FurnitureProps): void => {
  // In the panel at the left.
  mountLedger(scope, { game, frame });
  mountMarket(scope, { game, frame });
  mountLab(scope, { game, frame });
  // Round the edges of the window.
  mountTurnControl(scope, { turn });
  mountFloors(scope, { plan, view, look });
  mountTransport(scope, { paused, staying, speed, daytime, plans, calendar: calendarOpen, dev, game, frame, openMap });
  mountWallsToggle(scope, { slide, key: wallsKey });
  mountRoomsToggle(scope, { byRoom, key: roomsKey });
  mountCentreToggle(scope, { centred });
  mountCharacterCard(scope, { game, following, frame, dev });
  // Over everything, when they are opened.
  mountCalendar(scope, { game, open: calendarOpen, daytime, dev });
  mountBook(scope, { game, frame, dev });
};
