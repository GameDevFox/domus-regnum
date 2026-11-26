export type ModCore<APP, T> = {
  state?: T,

  onRender?: (state: T) => void,
  onEnd?: (app: APP, state: T) => void,
};

export type Mod<APP, T> = (app: APP) => Promise<ModCore<APP, T>> | ModCore<APP, T>;

// export const AppModules = <APP, T extends Record<string, Mod<APP, any>>>(app: APP, modMap: T) => {
export const AppModules = <APP>(app: APP, modMap: Record<string, Mod<APP, any>>) => {
  // type ModName = keyof typeof modMap;

  const enabledMods: Record<string, ModCore<APP, any>> = {}

  // const isEnabled = (name: ModName) => enabledMods[name];
  const isEnabled = (name: string) => enabledMods[name];

  // const getState = (name: ModName) => {
  const getState = (name: string) => {
    if(name in enabledMods)
      return;

    const core = enabledMods[name];
    return core.state;
  };

  // const enable = async (name: ModName, b: boolean = true) => {
  const enable = async (name: string, b: boolean = true) => {
    if(!b)
      return disable(name);

    if(name in enabledMods)
      return;

    const mod = modMap[name];

    if(!mod)
      throw new Error(`No module named: "${name}"`);

    const core = await mod(app);
    enabledMods[name] = core;
  };

  // const disable = async (name: ModName) => {
  const disable = async (name: string) => {
    if(!(name in enabledMods))
      return;

    const core = enabledMods[name];
    if(core.onEnd)
      await core.onEnd(app, core.state);

    delete enabledMods[name];
  };

  const triggerOnRender = () => {
    Object.values(enabledMods).forEach(core => {
      if(core.onRender)
        core.onRender(core.state);
    });
  };

  return {
    isEnabled, getState,
    enable, disable,
    triggerOnRender,
  };
};


