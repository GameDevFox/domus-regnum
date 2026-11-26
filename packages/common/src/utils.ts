import { Edge, idToBase64 } from "./id";

export const noop: any = () => {};

export const edgeToBase64 = (edge: Edge) => {
  const result: Record<string, string> = {};

  for(const key of Object.keys(edge)) {
    const id = edge[key as keyof Edge];
    result[key] = idToBase64(id);
  }

  return result;
}

// Times
export const times = (count: number, fn: (value: number) => any) => {
  const result = [];

  for(let i = 0; i < count; i++) {
    const value = fn(i);
    result.push(value);
  }

  return result;
};

export const timesStr = (count: number, str: string) => {
  const result = [];

  for(let i = 0; i < count; i++)
    result.push(str);

  return result;
};

type Function = (...args: any[]) => any;

// type A = ArgsOf<typeof test>;
// type R = ReturnType<typeof test>;

export const toAsync = <Fn extends Function>(fn: Fn) => (...args: Parameters<Fn>) => {
  return new Promise<ReturnType<Fn>>(resolve => {
    setTimeout(async () => {
      const result = await fn(...args as any);
      resolve(result);
    }, 0);
  });
};

export const withPorts = (system: any, name: string) => {
  const ids = new Set<string>();

  const add = () => {
    const outputId = name + ids.size;

    ids.add(outputId);
    system[outputId] = noop;

    return outputId;
  };

  const remove = (outputId: string) => {
    ids.delete(outputId);
    delete system[outputId];
  };

  const outputs = () => {
    const result: any = {};
    ids.forEach(id => {
      result[id] = system[id]
    });

    return result;
  };

  return { ids, add, remove, outputs };
};

type Key = string | number | symbol;
type Value<T> = T | (() => T);

export const getOrCreate = <K extends Key, T>(obj: Record<K, T>, key: K, value: Value<T>) => {
  if(key in obj)
    return obj[key];

  obj[key] = typeof value === "function" ? (value as any)() : value;
  return obj[key];
};
