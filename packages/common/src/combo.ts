import { Buffer } from "buffer";
import { mapValues } from "lodash";

const ZERO = BigInt(0);

export type Combo = number[];

export const generateCombo = (nodeId: string, baseInt: number, limit?: number) => {
  const base = BigInt(baseInt);

  const bigIntStr = `0x${Buffer.from(nodeId, "base64").toString("hex")}`;
  let value = BigInt(bigIntStr);

  const result: Combo = [];
  while(value !== ZERO && result.length < (limit ?? Number.MAX_SAFE_INTEGER)) {
    const digit = value % base;
    result.push(Number(digit))

    if(value === digit)
      break;

    value = (value - digit) / base;
  }

  return result;
};

type Tree = Record<string, any>;
export const shortenCombos = (combos: Record<string, Combo>) => {
  const result: Record<string, Combo> = {};

  const root: Tree = {};

  const getComboValue = (combo: Combo, depth: number) => {
    if(depth >= combo.length)
      throw new Error("Combo overflow");

    return combo[depth];
  };

  const getLeaf = (combo: Combo, target: Tree, depth: number): Tree => {
    const value = getComboValue(combo, depth);

    const nextTree = target[value];
    if(!nextTree) {
      return {
        leaf: target,
        depth,
      };
    }

    return getLeaf(combo, nextTree, depth + 1);
  };

  const add = (key: string, combo: Combo) => {
    const { leaf, depth } = getLeaf(combo, root, 0);
    const value = getComboValue(combo, depth);

    const shortCombo = combo.slice(0, depth + 1);

    const { data } = leaf;

    if(data) {
      // console.log(`Collision between ${key} and ${leaf.data.key} - depth ${depth}`);
      delete leaf.data;
    }

    leaf[value] = {
      data: {
        key,
        combo,
      }
    };
    result[key] = shortCombo;

    if(data) {
      const { key, combo } = data;
      add(key, combo);
    }
  };

  Object.entries(combos).forEach(([key, combo]) => {
    add(key, combo);
  });

  const getKey = (combo: Combo) => {
    try {
      const { leaf } = getLeaf([...combo, 0], root, 0);
      return leaf.data.key ?? null;
    } catch(e) {
      return null;
    }
  };

  return { combos: result, getKey };
};

export const byCombo = (nodeIds: string[], keys: any[]) => {
  const byNumber = Object.fromEntries(
    keys.map((value, index) => [value, index])
  );

  const combos: Record<string, Combo> = Object.fromEntries(
    nodeIds.map(nodeId => [nodeId, generateCombo(nodeId, keys.length)])
  );
  const { combos: shortCombos, getKey } = shortenCombos(combos);

  const comboMap = mapValues(shortCombos, combo => {
    return combo.map(value => keys[value]);
  });

  return {
    comboMap,
    getKey: (combo: string[]) => {
      const numberCombo = combo.map(value => {
        const result = byNumber[value]
        if(result === undefined)
          throw new Error(`Invalid character: "${value}". Must be one of ${keys.map(value => `"${value}"`).join(", ")}`)

        return result;
      });

      return getKey(numberCombo);
    },
  };
};
