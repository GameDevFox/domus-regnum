import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The page's furniture is all in one element, so that it can all be put away at once
// (ui-layer.ts). That holds only while no part of the page puts what it shows on the page itself:
// these read the page's own files, and say which do.

const HERE = dirname(fileURLToPath(import.meta.url));
/** What is on the page itself by design, and why (ui-layer.ts says the same): the furniture is put away for these, or under them. */
const ON_THE_PAGE_ITSELF = ["scene-stage.ts", "curtain.ts"];
/** The one file that touches the page's body: it has the way onto the page itself (`onThePage`). */
const THE_LAYER = "ui-layer.ts";
/** Using that way. */
const PUT_ON_PAGE = /\bonThePage\(/;
/** Putting something on the page itself: onto its body, by any of the ways of putting a thing into another. */
const PUT_ON_BODY = /document\.body\.(append|appendChild|prepend|insertBefore|insertAdjacentElement|insertAdjacentHTML|replaceChildren)\(/;

const sources = readdirSync(HERE).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

describe("the page's furniture is in one element", () => {
  it("no part of the page puts what it shows on the page's body: only the layer's own file touches it", () => {
    const putting = sources.filter((name) => PUT_ON_BODY.test(readFileSync(join(HERE, name), "utf8")));
    expect(putting).toEqual([THE_LAYER]);
  });

  it("only the scene and the black are put on the page itself, outside the furniture", () => {
    const putting = sources.filter((name) => name !== THE_LAYER && PUT_ON_PAGE.test(readFileSync(join(HERE, name), "utf8")));
    expect(putting.sort()).toEqual([...ON_THE_PAGE_ITSELF].sort());
  });

  it("the page has the element, with the panel in it, and the picture of the house outside it", () => {
    const page = readFileSync(join(HERE, "../../demo3d.html"), "utf8");
    const from = page.indexOf('<div id="ui">');
    const panel = page.indexOf('<aside id="panel">');
    const stage = page.indexOf('<div id="stage">');
    expect(from).toBeGreaterThan(-1);
    expect(stage).toBeGreaterThan(-1);
    expect(stage).toBeLessThan(from);
    expect(panel).toBeGreaterThan(from);
    // The panel is closed before the element is: it is inside it.
    expect(page.slice(page.indexOf("</aside>", panel) + "</aside>".length).trimStart().startsWith("</div>")).toBe(true);
  });

  it("the developer's tools have an element of their own, after the furniture and outside it", () => {
    const page = readFileSync(join(HERE, "../../demo3d.html"), "utf8");
    const furnitureEnds = page.indexOf("</div>", page.indexOf("</aside>", page.indexOf('<aside id="panel">')));
    expect(page.indexOf('<div id="dev-tools">')).toBeGreaterThan(furnitureEnds);
    for (const name of ["dev-menu.ts", "dev-window.ts"]) expect(readFileSync(join(HERE, name), "utf8")).toMatch(/devTools\(\)\.append\(/);
  });
});
