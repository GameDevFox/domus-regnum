import { mapValues } from "lodash";

const REFERENCE = "reference";

const sortById = (a: [string, any], b: [string, any]) => {
  const aKey = parseInt(a[0].slice(1));
  const bKey = parseInt(b[0].slice(1));

  return aKey - bKey;
}

export const toKSON = (
  value: any,
  replacer?: any,
  space?: string | number
) => {
  const valueToId: Map<any, any> = new Map();
  const idToConverted: Record<string, any> = {};
  let counter = 0;

  const convertValue = (value: any): any => {
    if(valueToId.has(value))
      return valueToId.get(value);

    // TODO: this
    // if(typeof value === "function") {
    //   const id = getFunctionId();
    //   // const id = `@${counter++}`;
    //   const idObj = { type: FUNCTION, id };
    //   valueToId.set(value, idObj);

    //   const converted = value;
    //   idToConverted[id] = converted;

    //   return idObj;
    // } else
    if(Array.isArray(value)) {
      const id = `@${counter++}`;
      const idObj = { type: REFERENCE, id };
      valueToId.set(value, idObj);

      idToConverted[id] = value.map(convertValue);

      return idObj;
    } else if(typeof value === "object") {
      const id = `@${counter++}`;
      const idObj = { type: REFERENCE, id };
      valueToId.set(value, idObj);

      idToConverted[id] = mapValues(value, convertValue);

      return idObj;
    }

    return value;
  };

  const converted = convertValue(value);
  if(converted === value)
    return JSON.stringify(value, replacer, space);;

  // NOTE: This sort might not ever work, but whatever
  const final = Object.fromEntries(
    Object.entries(idToConverted).sort(sortById)
  );
  return JSON.stringify(final, replacer, space);
};

export const fromKSON = (text: string, reviver?: (this: any, key: string, value: any) => any) => {
  const root = JSON.parse(text, reviver);

  const replace = (value: any, key: any) => {
    const obj = value[key];
    if(typeof obj === "object") {
      if(obj.type !== REFERENCE)
        throw new Error(
          "KSON currently only supports references: \n" +
          JSON.stringify(obj, null, 2)
        );

      value[key] = root[obj.id];
    }
  }

  Object.entries(root).forEach(([key, value]: [string, any]) => {
    if(Array.isArray(value)) {
      for(const index in value)
        replace(value, index);
    } else if(typeof value === "object") {
      Object.keys(value).forEach(key => replace(value, key));
    } else {
      throw new Error(
        "Encountered non-array or non-object value at root level: \n" +
        JSON.stringify({ key, value }, null, 2)
      );
    }
  });

  return root["@0"];
};
