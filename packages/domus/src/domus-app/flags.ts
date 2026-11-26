// Dev feature flags — the replacement for the old comment-out-the-block workflow. Disabled
// experiments stay as REAL, compiling code behind a flag instead of rotting in comments.
//
// Flags persist in localStorage and are read ONCE at app construction, so toggle + reload:
//   domusFlags.enable("scene2dDemo")    domusFlags.disable("scene2dDemo")    domusFlags.list()
//
// Headless-safe: under node tests there is no localStorage and every flag reads as its default.

const KEY = "domus.flags";

const read = (): Record<string, boolean> => {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
};

const write = (flags: Record<string, boolean>): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(flags));
  } catch {
    /* storage unavailable */
  }
};

// The known flags and their defaults — register new experiments here so list() can show them.
const DEFAULTS: Record<string, boolean> = {
  scene2dDemo: false, // rotating test cube + live rotation readout on the 2D overlay (index.ts)
  textureTest: false, // texture-window sprite experiment in the game scene (scene.ts)
};

export const flag = (name: keyof typeof DEFAULTS & string): boolean =>
  read()[name] ?? DEFAULTS[name] ?? false;

export const domusFlags = {
  enable: (name: string): void => {
    write({ ...read(), [name]: true });
    console.log(`flag "${name}" on — reload to apply`);
  },
  disable: (name: string): void => {
    write({ ...read(), [name]: false });
    console.log(`flag "${name}" off — reload to apply`);
  },
  list: (): Record<string, boolean> => ({ ...DEFAULTS, ...read() }),
};

// Console access from devtools (dev convenience, like window.Kitsune / window.domus).
if (typeof window !== "undefined") {
  window.domusFlags = domusFlags;
}
