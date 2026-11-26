// Runs named parts of the page check alone (bin/check3d-parts.ts), by their function's name without "check"; with no names, every part
// (but not check3d.ts's own opening and closing checks). Needs the dev server.
//   npx tsx bin/check3d-some.ts trade work
import { PARTS } from "./check3d-parts";
import { partName, runParts, workersAsked } from "./check3d-pool";

const VIEWPORT = { width: 1280, height: 800 };

const main = async (): Promise<void> => {
  const wanted = process.argv.slice(2).map((name) => name.toLowerCase());
  const unknown = wanted.filter((name) => !PARTS.some((part) => partName(part).toLowerCase() === name));
  if (unknown.length > 0) throw new Error(`no such part: ${unknown.join(", ")} (there are: ${PARTS.map(partName).join(", ")})`);
  let failed = 0;
  await runParts({
    parts: PARTS.filter((part) => wanted.length === 0 || wanted.includes(partName(part).toLowerCase())),
    workers: workersAsked(),
    base: process.env.MANOR_URL ?? "http://127.0.0.1:3011/",
    viewport: VIEWPORT,
    check: (name, ok) => {
      if (!ok) failed++;
      console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
    },
  });
  console.log(`${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((err: unknown) => {
  console.error(String(err));
  process.exit(1);
});
