// Opt-in tracing. Off by default (no console spam); enable from the devtools console
// with `localStorage.kitsuneTrace = "1"` then reload — handy for watching which
// components rebuild on a hot update (HMR granularity).
const enabled = typeof localStorage !== "undefined" && localStorage.getItem("kitsuneTrace") != null;

export const trace = (...args: unknown[]): void => {
  if (enabled) console.log(...args);
};

export const traceBuild = (name: string): void => trace("build", name);
