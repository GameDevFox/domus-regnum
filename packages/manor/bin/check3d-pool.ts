// Runs parts of the page check (bin/check3d-parts.ts), by one browser or by several side by side. A part's lines are kept and printed
// together when it ends, so that parts run side by side do not mingle theirs; and a part that throws is one failed check, with the lines
// it had got to, and the run goes on to the next part.
import { chromium } from "@playwright/test";
import type { Browser } from "@playwright/test";

import type { Checks } from "./check3d-kit";

type Part = (checks: Checks) => Promise<void>;
type Check = Checks["check"];
type PoolProps = Pick<Checks, "base" | "viewport" | "check"> & { parts: readonly Part[]; /** How many browsers run parts at once. */ workers: number };

/** How many lines of what a part threw are kept: the error, and where the page was waiting. */
const THROWN_LINES = 4;
/** The variable that says how many browsers a run may use at once, and how many it uses when nothing says. */
const WORKERS_VARIABLE = "CHECK_WORKERS";
const ONE_AT_A_TIME = 1;

/** A browser as the page check wants it: the page drawn in software, graphics card or none, so that a run is the same on any machine. */
export const launchBrowser = (): Promise<Browser> => chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

/** How many browsers the run was asked to use at once (CHECK_WORKERS): one, when it was not asked. */
export const workersAsked = (): number => Math.max(ONE_AT_A_TIME, Math.floor(Number(process.env[WORKERS_VARIABLE])) || ONE_AT_A_TIME);

/** A part's name as it is asked for and printed: its function's, without "check". */
export const partName = (part: Part): string => part.name.replace(/^check/, "");

/** Every page a part left open is shut: one left open goes on being drawn behind the next part's, and slows it. */
const shutPages = async (browser: Browser): Promise<void> => void (await Promise.all(browser.contexts().map((context) => context.close())));

const runOne = async (part: Part, browser: Browser, { base, viewport, check }: PoolProps): Promise<void> => {
  const lines: Parameters<Check>[] = [];
  const began = Date.now();
  try {
    await part({ browser, base, viewport, check: (name, ok) => void lines.push([name, ok]) });
  } catch (err) {
    lines.push([`${partName(part)} ran to its end (it threw: ${String(err).split("\n").slice(0, THROWN_LINES).join(" | ")})`, false]);
    await shutPages(browser);
  }
  console.log(`== ${partName(part)} (${Math.round((Date.now() - began) / 1000)} s)`);
  for (const [name, ok] of lines) check(name, ok);
};

/** Run the parts, each once, by as many browsers as asked for: each browser takes the next part not yet begun. */
export const runParts = async (props: PoolProps): Promise<void> => {
  const waiting = [...props.parts];
  const work = async (): Promise<void> => {
    const browser = await launchBrowser();
    for (let part = waiting.shift(); part; part = waiting.shift()) await runOne(part, browser, props);
    await browser.close();
  };
  await Promise.all(Array.from({ length: Math.min(props.workers, props.parts.length) }, work));
};
