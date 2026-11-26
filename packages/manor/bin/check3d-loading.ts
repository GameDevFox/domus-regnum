// The checks of the 3D demo page that are about what is on the screen before the house is: the
// loading screen, which is part of the page itself and so is there before any script has come;
// its going away once the house is drawn; and what it says when the house cannot be opened.
// Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** The page's own script, as the page asks for it. */
const OWN_SCRIPT = "**/src/demo3d/main.ts*";
/** The colour behind everything while it loads: dark, and not the white of a bare page. */
const DARK = "rgb(33, 22, 15)";
/** How long the loading screen may take to be gone once the house is ready: its fade, the lettering, and a little over. */
const GONE_MS = 4000;
/** Places on the screen, in pixels, at which what is uppermost is asked: the corner the panel is in, and the middle. */
const SPOTS: [number, number][] = [[60, 60], [200, 300], [720, 430]];

/** What the loading screen is showing: its state, whether its windows are being lit, and which of its sayings can be seen. */
const showing = (page: Page): Promise<{ there: boolean; state: string | null; lit: string; seen: string[]; behind: string; uppermost: boolean; ready: boolean }> =>
  page.evaluate((spots) => {
    const loading = document.getElementById("loading");
    const pane = loading?.querySelector(".pane");
    return {
      there: loading !== null,
      state: loading?.dataset.state ?? null,
      lit: pane ? getComputedStyle(pane).animationName : "",
      seen: [...(loading?.querySelectorAll(".loading-says") ?? [])].filter((p) => getComputedStyle(p).display !== "none").map((p) => p.className.replace("loading-says ", "")),
      behind: getComputedStyle(document.documentElement).backgroundColor,
      uppermost: spots.every(([x, y]) => document.elementFromPoint(x, y)?.closest("#loading") != null),
      ready: document.body.classList.contains("ready"),
    };
  }, SPOTS);

const handleThere = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
const gone = (page: Page): Promise<boolean> =>
  page
    .waitForFunction(() => document.getElementById("loading") === null, undefined, { timeout: GONE_MS })
    .then(() => true)
    .catch(() => false);

export const checkLoading = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const url = `${base}demo3d.html?help=0`;

  // Before the page's own script has come: it is held back, and the page is looked at as it stands.
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  let release = (): void => undefined;
  const held = new Promise<void>((done) => (release = done));
  await page.route(OWN_SCRIPT, async (route) => {
    await held;
    await route.continue();
  });
  // (The page is not waited for: it is not done until its script has run, which is what is being held back.)
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForSelector("#panel", { state: "attached" });
  const before = await showing(page);
  check(`before any of its script has come, the page is its loading screen: dark, and over everything (${before.behind})`, before.there && before.uppermost && before.behind === DARK && !before.ready);
  check("…a house whose windows are lit one after another, with the game's name, and nothing said of anything going wrong", before.lit === "loading-lit" && before.state === null && before.seen.length === 0 && (await page.locator(".loading-title").textContent()) === "Domus" && (await page.getByRole("status", { name: "Loading" }).count()) === 1);
  release();
  // The moment the house can be driven by a script, the loading screen keeps nothing from it.
  const through = await page.waitForFunction(() => {
    if (!(window as unknown as { manor3d?: unknown }).manor3d) return false;
    const loading = document.getElementById("loading");
    return loading ? getComputedStyle(loading).pointerEvents : "gone";
  });
  check(`once the house is ready the loading screen lets presses through at once (${await through.jsonValue()})`, ["none", "gone"].includes((await through.jsonValue()) as string));
  const after = (await gone(page)) ? await showing(page) : null;
  check(`…and fades, and is gone from the page: the house is what is on the screen${errors.length ? ` (${errors.slice(0, 2).join(" | ")})` : ""}`, after !== null && !after.there && after.ready && !after.uppermost && errors.length === 0);
  await page.close();

  // A browser that runs no script is told so, in words, on the same screen.
  const plain = await browser.newContext({ viewport, javaScriptEnabled: false });
  const still = await plain.newPage();
  await still.goto(url, { waitUntil: "domcontentloaded" });
  const says = still.locator("#loading .loading-noscript");
  check(`with no JavaScript the loading screen says that is what is wanted, and its windows stay dark (${await says.textContent()})`, (await says.isVisible()) && ((await says.textContent()) ?? "").includes("JavaScript") && (await still.locator("#loading .loading-failed").isHidden()) && (await still.locator("#loading .pane").first().evaluate((pane) => getComputedStyle(pane).animationName)) === "none");
  await plain.close();

  // The page's own script cannot be fetched: the screen says the house could not be opened, and offers to try again.
  const lost = await browser.newPage({ viewport });
  await lost.route(OWN_SCRIPT, (route) => route.abort());
  await lost.goto(url, { waitUntil: "load" });
  await lost.waitForSelector('#loading[data-state="failed"]', { timeout: GONE_MS }).catch(() => null);
  const failed = await showing(lost);
  check(`if its script cannot be fetched, the loading screen says the house could not be opened (${failed.seen.join()})`, failed.there && failed.state === "failed" && failed.seen.join() === "loading-failed" && failed.lit === "none" && failed.uppermost);
  await lost.unroute(OWN_SCRIPT);
  await lost.getByRole("button", { name: "Try again" }).click();
  await handleThere(lost);
  check("…and trying again loads the page afresh: this time the house opens", await gone(lost));
  await lost.close();

  // The script comes, and stops short before the house is drawn.
  const broken = await browser.newPage({ viewport });
  await broken.route(OWN_SCRIPT, (route) => route.fulfill({ contentType: "text/javascript", body: 'throw new Error("no house today");' }));
  await broken.goto(url, { waitUntil: "load" });
  await broken.waitForSelector('#loading[data-state="failed"]', { timeout: GONE_MS }).catch(() => null);
  const stopped = await showing(broken);
  check("if its script stops short before the house is drawn, it says the same", stopped.state === "failed" && stopped.seen.join() === "loading-failed" && stopped.uppermost);
  await broken.close();
};
