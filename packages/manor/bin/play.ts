// Play the game from the command line, one batch of commands at a time. State lives in a save
// file, so a session is just repeated invocations:
//   npx tsx bin/play.ts <save.json> "new 7" "invite humble" "assign lord shop" start "run 30"
// Run with no commands to look. `help` lists the commands.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { GOODS, RECIPES } from "../src/sim/content/house";
import { DEVICES } from "../src/sim/content/devices";
import { SITES } from "../src/sim/content/world";
import { whyNotSend } from "../src/sim/expedition";
import { donationCost } from "../src/sim/flow";
import { advance, apply, createGame } from "../src/sim/game";
import { whyNotTrade } from "../src/sim/trade";
import { render, roomLabel } from "../src/sim/text";
import { DAY_SECONDS, OCCASION_SECONDS } from "../src/sim/tuning";
import type { Command, Game } from "../src/sim/types";

const HELP = `Commands (quote each one):
  new <seed>                 start a new game
  invite humble|grand|royal  accept an invitation (phase INVITE); grand needs last time to have gone well, royal a triumph
  assign <maid> <room>|hall  post someone to a room; a room is named by its kind (kitchen, shop, parlour, lab, pantry…) or always by its [id] (r11)
  uninstall <room>           take a room's device out and back to the laboratory, to be put somewhere else
  carriages                  at an occasion: call the carriages and end the evening now
  recipe <room> <recipe>     make a producing room turn out just this one thing
  rota <room> <recipe>       put a recipe on a room's rota, or take it off: the room makes whichever of its rota the house has least of
  menu <good> on|off         strike a kind off the guests' menu, or put it back (everything worth serving is on it by default)
  sell <good> / keep <good>  standing order: sell what can be spared to walk-ins, or never sell it ("keep all" / "sell all")
  supper none|shared|feast   what the household eats tonight (feast = one of every food there is one each of; one Hearth point per kind)
  wages fair|generous        what the maids are paid each night (generous costs more and grows the Hearth)
  engage quartet|chef|footmen  hire help for the coming occasion only (see the ENGAGED line for prices)
  note <guest#>              at an occasion: notice a guest's fancy, so it is brought next (worth ×3)
  trade / dismiss            answer whoever is at the door
  donate                     in the evening: a gift to the parish for Hearth
  send <maid> <site> [pack…] expedition (phase MORNING): site forest|lake|caves; pack up to 2 of: a comfort food as a ration, or a pack device
  start                      begin the day (phase MORNING)
  run [seconds]              let time pass (default 10) — phases DAY and OCCASION
  press / back               expedition: press on, or turn back
  choose <n>                 pick an invention, or acknowledge a gift
  install <device> <room|maid>
  buy <n> [room]             buy offer n (phase OFFERS); a room offer goes in the first empty room unless you name one by its [id]
  reroll / next              new offers / go to the next day
  continue                   move on from RESULT, SABBATH or ENDED
  look                       print the state`;

const [, , savePath, ...commands] = process.argv;
if (!savePath) {
  console.log("usage: play.ts <save.json> [commands…]\n" + HELP);
  process.exit(1);
}

let g: Game | null = existsSync(savePath) ? (JSON.parse(readFileSync(savePath, "utf8")) as Game) : null;

const findRoom = (game: Game, name: string): string | null => {
  const byLabel = game.rooms.find((r) => roomLabel(game, r) === name || r.id === name);
  if (byLabel) return byLabel.id;
  const byKind = game.rooms.find((r) => r.kind === name);
  return byKind ? byKind.id : null;
};

const DEFAULT_RUN = 10;

const run = (game: Game, line: string): string | null => {
  const [verb, ...args] = line.trim().split(/\s+/);
  const send = (cmd: Command): string | null => (apply(game, cmd) ? null : `could not: ${line}`);
  switch (verb) {
    case "look":
      return null;
    case "invite":
      return send({ kind: "invite", grade: args[0] === "royal" ? "royal" : args[0] === "grand" ? "grand" : "humble" });
    case "rota": {
      const room = findRoom(game, args[0]);
      if (!room) return `no such room: ${args[0]}`;
      if (!RECIPES[args[1]]) return `no such recipe: ${args[1]}`;
      return apply(game, { kind: "rota", room, recipe: args[1] }) ? null : `that room cannot make ${args[1]} (wrong kind of room, or the recipe is not known)`;
    }
    case "menu":
      if (!GOODS[args[0]]) return `no such good: ${args[0]}`;
      return apply(game, { kind: "menu", good: args[0], on: args[1] !== "off" }) ? null : `${args[0]} is not something guests are served`;
    case "assign": {
      const room = args[1] === "hall" ? null : findRoom(game, args[1]);
      if (args[1] !== "hall" && !room) return `no such room: ${args[1]}`;
      if (!game.maids.some((m) => m.id === args[0])) return `no such person: ${args[0]}`;
      return send({ kind: "assign", maid: args[0], room });
    }
    case "recipe": {
      const room = findRoom(game, args[0]);
      if (!room) return `no such room: ${args[0]}`;
      if (!RECIPES[args[1]]) return `no such recipe: ${args[1]}`;
      return send({ kind: "recipe", room, recipe: args[1] });
    }
    case "sell":
    case "keep": {
      const goods = args[0] === "all" ? Object.keys(GOODS).filter((id) => GOODS[id].pole !== null) : [args[0]];
      for (const good of goods) {
        if (!GOODS[good]) return `no such good: ${good}`;
        apply(game, { kind: "order", good, order: verb });
      }
      return null;
    }
    case "supper":
      if (!["none", "shared", "feast"].includes(args[0])) return "supper is none, shared or feast";
      return send({ kind: "supper", plan: args[0] as "none" | "shared" | "feast" });
    case "wages":
      if (args[0] !== "fair" && args[0] !== "generous") return "wages are fair or generous";
      return send({ kind: "wages", plan: args[0] });
    case "note":
      return apply(game, { kind: "note", visitor: Number(args[0]) }) ? null : `guest ${args[0]} has no fancy to notice`;
    case "trade": {
      const why = whyNotTrade(game);
      return why ? `could not trade: ${why}` : send({ kind: "trade" });
    }
    case "dismiss":
      return send({ kind: "dismiss" });
    case "engage":
      return apply(game, { kind: "engage", id: args[0] }) ? null : `could not engage ${args[0]}: not enough coin, already engaged, or no occasion coming`;
    case "donate":
      if (game.phase !== "offers") return "gifts to the parish are made in the evening";
      return apply(game, { kind: "donate" }) ? null : `a gift now costs ${donationCost(game)} coin`;
    case "send": {
      if (!SITES[args[1]]) return `no such site: ${args[1]}`;
      const why = whyNotSend(game, args[0]);
      return why ? `could not send: ${why}` : send({ kind: "expedition", maid: args[0], site: args[1], pack: args.slice(2) });
    }
    case "start":
      return send({ kind: "startDay" });
    case "run": {
      if (game.phase !== "day" && game.phase !== "occasion") return `nothing is running in phase ${game.phase}`;
      const max = game.phase === "day" ? DAY_SECONDS : OCCASION_SECONDS;
      advance(game, Math.min(Number(args[0] ?? DEFAULT_RUN), max));
      return null;
    }
    case "press":
      return send({ kind: "press" });
    case "back":
      return send({ kind: "turnBack" });
    case "choose":
      return send({ kind: "choose", index: Number(args[0] ?? 1) - 1 });
    case "install": {
      if (!DEVICES[args[0]]) return `no such device: ${args[0]} (spare devices are listed on the LAB line by their id)`;
      if (!game.spareDevices.includes(args[0])) return `${args[0]} is not spare: "uninstall <room>" first to move one`;
      const maid = game.maids.find((m) => m.id === args[1]);
      return send(maid ? { kind: "install", device: args[0], maid: maid.id } : { kind: "install", device: args[0], room: findRoom(game, args[1]) ?? undefined });
    }
    case "buy": {
      const offer = game.offers[Number(args[0]) - 1];
      if (game.phase !== "offers") return "offers are made in the evening";
      if (!offer) return `no offer ${args[0]}`;
      if (offer.sold) return "already taken";
      if (offer.cost > game.coin) return `that costs ${offer.cost} coin and there is ${game.coin}`;
      if (offer.kind === "room" && !game.rooms.some((r) => r.kind === "empty")) return "there is no empty room to fit out";
      return apply(game, { kind: "buy", index: Number(args[0]) - 1, room: args[1] ? (findRoom(game, args[1]) ?? undefined) : undefined }) ? null : "could not buy that (a full household, perhaps)";
    }
    case "uninstall": {
      const room = findRoom(game, args[0]);
      if (!room) return `no such room: ${args[0]}`;
      return apply(game, { kind: "uninstall", room }) ? null : "there is no device in that room";
    }
    case "carriages":
      return apply(game, { kind: "carriages" }) ? null : "there is no evening to end";
    case "reroll":
      return send({ kind: "reroll" });
    case "next":
      return send({ kind: "nextDay" });
    case "continue":
      return send({ kind: "continue" });
    default:
      return `unknown command: ${verb}`;
  }
};

const problems: string[] = [];
for (const line of commands) {
  const [verb, arg] = line.trim().split(/\s+/);
  if (verb === "help") {
    console.log(HELP);
    continue;
  }
  if (verb === "new") {
    g = createGame(Number(arg ?? 1));
    continue;
  }
  if (!g) {
    problems.push(`no game yet: start with "new <seed>"`);
    break;
  }
  const problem = run(g, line);
  if (problem) problems.push(problem);
}

if (g) {
  writeFileSync(savePath, JSON.stringify(g));
  console.log(render(g));
}
if (problems.length) console.log(`\n!! ${problems.join("\n!! ")}`);
