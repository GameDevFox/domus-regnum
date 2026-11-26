import { Plugin } from "vite";
import path from "path";

type Options = {
  componentsDir?: string;
  exclude?: string[];
};

// Collect the names the accept block can snapshot: declaration exports (const/let/var/
// function — all create module-local bindings) plus LOCAL export lists (`export { A, B }`,
// `export { local as Exported }`). Re-export forms (`export { A } from "./x"`) create NO
// local binding to snapshot, so they can't hot-swap through this file — they're returned
// separately so the footer can say so in dev instead of silently opting out.
export const collectExports = (
  code: string,
): { snapEntries: string[]; reExported: string[] } => {
  const snap = new Map<string, string>(); // exported name → local binding
  const reExported: string[] = [];

  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function)\s+(\w+)/g))
    snap.set(m[1], m[1]);

  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}(\s*from\s*["'][^"']+["'])?/g)) {
    const names = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("type "));
    if (m[2]) {
      names.forEach((n) => reExported.push(n.split(/\s+as\s+/).pop()!.trim()));
      continue;
    }
    names.forEach((n) => {
      const [local, exported = local] = n.split(/\s+as\s+/).map((s) => s.trim());
      snap.set(exported, local);
    });
  }

  const snapEntries = [...snap.entries()].map(([exported, local]) =>
    exported === local ? exported : `${exported}: ${local}`,
  );
  return { snapEntries, reExported };
};

export const kitsuneHMR = (options: Options = {}): Plugin => {
  let componentsDir: string;
  const excluded = new Set(options.exclude ?? ["app-scene.ts"]);

  const isComponentFile = (file: string): boolean =>
    file.startsWith(componentsDir + path.sep) &&
    (file.endsWith(".ts") || file.endsWith(".js")) &&
    !excluded.has(path.basename(file));

  return {
    name: "kitsune-hmr",
    apply: "serve", // accept blocks are dev-only; keep production builds untouched

    configResolved(config) {
      componentsDir = path.resolve(
        config.root,
        options.componentsDir ?? "src/components",
      );
    },

    transform(code, id) {
      if (!isComponentFile(id)) return;

      // The accept block captures the old factory references in _snap so they're
      // available when the callback fires with the new module.
      const { snapEntries, reExported } = collectExports(code);
      if (snapEntries.length === 0 && reExported.length === 0) return;

      const warn = reExported.length
        ? `\n  console.warn("[kitsune-hmr] ${path.basename(id)}: re-exports (${reExported.join(
            ", ",
          )}) have no local binding and won't hot-swap through this file — edit their source module instead.");`
        : "";
      const footer = `
if (import.meta.hot) {
  const _snap = { ${snapEntries.join(", ")} };${warn}
  import.meta.hot.accept((mod) => {
    if (!mod) return;
    Object.entries(_snap).forEach(([k, oldFn]) => {
      const newFn = mod[k];
      if (typeof oldFn === "function" && typeof newFn === "function")
        globalThis.__kitsune_hmr?.(oldFn, newFn);
    });
  });
}
`;
      return { code: code + footer, map: null };
    },
  };
};
