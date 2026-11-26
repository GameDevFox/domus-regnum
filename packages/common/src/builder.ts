type PartialUpdater = (instance: any, depValue: any) => void | Promise<void>;

type AnyEntry = {
  key: string;
  deps: string[];
  build: (data: any) => any;
  cleanUp?: (value: any) => void;
  partialUpdaters?: Record<string, PartialUpdater>;
};

type UpdateMap<App> = {
  [K in keyof App]?: (data: App) => App[K] | Promise<App[K]>;
};

export type BuilderData<B extends Builder<any>> = Awaited<ReturnType<B["run"]>>["data"];

export type Builder<App extends Record<string, any> = {}> = {
  // Positional: no deps
  add<K extends string, V>(
    key: K,
    build: V | Promise<V> | (() => V | Promise<V>),
    deps?: [],
    cleanUp?: (value: V) => void,
  ): Builder<App & Record<K, V>>;

  // Positional: with deps
  add<K extends string, V, Deps extends keyof App & string>(
    key: K,
    build: (data: Pick<App, Deps>) => V | Promise<V>,
    deps: Deps[],
    cleanUp?: (value: V) => void,
    partialUpdaters?: { [D in Deps]?: (instance: V, depValue: App[D]) => void | Promise<void> },
  ): Builder<App & Record<K, V>>;

  // Options object: no deps
  add<K extends string, V>(
    key: K,
    build: V | Promise<V> | (() => V | Promise<V>),
    options: { deps?: []; cleanUp?: (value: V) => void },
  ): Builder<App & Record<K, V>>;

  // Options object: with deps
  add<K extends string, V, Deps extends keyof App & string>(
    key: K,
    build: (data: Pick<App, Deps>) => V | Promise<V>,
    options: {
      deps: Deps[];
      cleanUp?: (value: V) => void;
      partialUpdaters?: { [D in Deps]?: (instance: V, depValue: App[D]) => void | Promise<void> };
    },
  ): Builder<App & Record<K, V>>;

  run(): Promise<{
    data: App;
    update: (updates: UpdateMap<App>) => Promise<string[]>;
  }>;
};

export const Builder = <App extends Record<string, any> = {}>(entries: AnyEntry[] = []): Builder<App> => {
  const add = (
    key: string,
    build: any,
    depsOrOptions?: any,
    cleanUp?: any,
    partialUpdaters?: any,
  ): any => {
    const buildFn = typeof build === "function" ? build : () => build;

    let deps: string[];
    let resolvedCleanUp: any;
    let resolvedPartialUpdaters: any;

    if (Array.isArray(depsOrOptions) || depsOrOptions == null) {
      deps = depsOrOptions ?? [];
      resolvedCleanUp = cleanUp;
      resolvedPartialUpdaters = partialUpdaters;
    } else {
      deps = depsOrOptions.deps ?? [];
      resolvedCleanUp = depsOrOptions.cleanUp;
      resolvedPartialUpdaters = depsOrOptions.partialUpdaters;
    }

    return Builder<any>([
      ...entries,
      {
        key,
        deps,
        build: buildFn,
        cleanUp: resolvedCleanUp,
        partialUpdaters: resolvedPartialUpdaters,
      },
    ]);
  };

  const run = async () => {
    const liveEntries = entries.map((e) => ({ ...e }));
    const entryMap = new Map(liveEntries.map((e) => [e.key, e]));

    // Compute transitive deps (also detects circular deps)
    const getTransitiveDeps = (key: string, path: string[] = []): string[] => {
      if (path.includes(key)) throw new Error(`Circular dependency: ${path.join(" > ")} > ${key}`);

      const entry = entryMap.get(key)!;
      const seen = new Set<string>();

      for (const dep of entry.deps) {
        seen.add(dep);
        for (const t of getTransitiveDeps(dep, [...path, key])) seen.add(t);
      }

      return [...seen];
    };

    const transitiveDeps: Record<string, string[]> = {};
    for (const entry of liveEntries) transitiveDeps[entry.key] = getTransitiveDeps(entry.key);

    // Build transitive reverse dep map
    const reverseDeps: Record<string, string[]> = {};
    for (const entry of liveEntries) reverseDeps[entry.key] = [];
    for (const [key, deps] of Object.entries(transitiveDeps)) {
      for (const dep of deps) {
        reverseDeps[dep] ??= [];
        if (!reverseDeps[dep].includes(key)) reverseDeps[dep].push(key);
      }
    }

    // Initial build
    const data = {} as App;
    const built = new Set<string>();

    const buildOne = async (key: string): Promise<void> => {
      if (built.has(key)) return;
      const entry = entryMap.get(key)!;
      for (const dep of entry.deps) await buildOne(dep);
      (data as any)[key] = await entry.build(data);
      built.add(key);
    };

    for (const entry of liveEntries) await buildOne(entry.key);

    // Update
    const update = async (updates: UpdateMap<App>): Promise<string[]> => {
      let rebuildList: string[] = [];

      const rebuildSet = new Set<string>();
      for (const key of Object.keys(updates)) {
        const fn = updates[key as keyof App];
        const entry = entryMap.get(key);
        if (entry && fn) entry.build = fn as any;
        rebuildSet.add(key);
        for (const k of reverseDeps[key] ?? []) rebuildSet.add(k);
      }
      rebuildList = [...rebuildSet];

      const rebuilt: string[] = [];
      const rebuiltSet = new Set<string>();

      const rebuild = async (key: string): Promise<void> => {
        if (rebuiltSet.has(key)) return;
        const entry = entryMap.get(key)!;

        const depsToRebuild = entry.deps.filter(
          (dep) => rebuildList.includes(dep) && !rebuiltSet.has(dep),
        );
        for (const dep of depsToRebuild) await rebuild(dep);

        const changedDirectDeps = entry.deps.filter((dep) => rebuildList.includes(dep));
        const canPartialUpdate =
          changedDirectDeps.length > 0 &&
          entry.partialUpdaters != null &&
          changedDirectDeps.every((dep) => entry.partialUpdaters![dep] != null);

        if (canPartialUpdate) {
          for (const dep of changedDirectDeps)
            await entry.partialUpdaters![dep]((data as any)[key], (data as any)[dep]);
        } else {
          if (entry.cleanUp) entry.cleanUp((data as any)[key]);
          (data as any)[key] = await entry.build(data);
        }

        rebuiltSet.add(key);
        rebuilt.push(key);
      };

      for (const key of rebuildList) await rebuild(key);

      return rebuilt;
    };

    return { data, update };
  };

  return { add, run } as Builder<App>;
};

