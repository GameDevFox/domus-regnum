// Balance harness: play whole seasons with scripted strategies across seeds and print what happened.
//   yarn workspace manor bots [seeds] [strategy]
import { STRATEGIES, runBot } from "../src/sim/bot";
import { createGame } from "../src/sim/game";
import { hearthLevel } from "../src/sim/house";

const DEFAULT_SEEDS = 8;
const seeds = Number(process.argv[2] ?? DEFAULT_SEEDS);
const only = process.argv[3];

const MARK = { triumph: "T", success: "s", shortfall: "." } as const;

const short = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

for (const strategy of STRATEGIES) {
  if (only && strategy.name !== only) continue;
  const rows: string[] = [];
  const wins = [0, 0, 0, 0];
  let coin = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const g = createGame(seed);
    const r = runBot(g, strategy);
    r.tiers.forEach((t, i) => {
      if (t !== "shortfall") wins[i] += 1;
    });
    coin += r.coinEarned;
    rows.push(
      `  seed ${String(seed).padStart(2)}  ${r.tiers.map((t) => MARK[t]).join("")}  ` +
        r.scores.map((s, i) => `${short(s)}/${short(r.targets[i])}`.padEnd(14)).join(" ") +
        ` coin ${String(r.coinEarned).padStart(5)}  hearth ×${hearthLevel(r.hearth)}  maids ${r.maids}`,
    );
  }
  console.log(`\n${strategy.name.toUpperCase()}  wins per chapter: ${wins.map((w) => `${w}/${seeds}`).join("  ")}  avg coin ${Math.round(coin / seeds)}`);
  console.log(rows.join("\n"));
}
