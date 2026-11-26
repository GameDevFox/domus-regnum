import { isPlainObject } from "lodash";

export type LogSafeOptions = Partial<{
  indent: boolean,
  precision: number,
}>;

const defaults: LogSafeOptions = {
  indent: false,
};

export const logSafe = (value: any, options: LogSafeOptions = {}) => {
  const { indent, precision } = { ...defaults, ...options };

  if(typeof value === "string")
    return value;

  if(typeof value === "function") {
    const fnSignature = value.toString()
      .split("\n")[0] // Take only the first line
      .slice(0, -2); // Remove " {" at the end of string
    return `function ${fnSignature}`;
  }

  if(precision !== undefined && typeof value === "object" && !Array.isArray(value)) {
    value = Object.fromEntries(Object.entries(value)
      .map(([name, value]) => {
        if(typeof value === "number")
          value = parseFloat(value.toFixed(precision));

        return [name, value];
      }));
  }

  return indent ? JSON.stringify(value, null, 2) : JSON.stringify(value);
};

export const toLog = (...values: any): string => {
  return values.map(value => logSafe(value)).join(" ");
};

export const toLogF = (options: LogSafeOptions, ...values: any): string => {
  return values.map(value => logSafe(value, options)).join(" ");
};

type LogFn = (...values: any[]) => void;

export const logToLines = (set: LogFn, lineLimit: number) => {
  const lines: string[] = [];

  return (...values: any[]) => {
    const message = toLog(...values);
    const newLines = message.split("\n");
    newLines.forEach(line => lines.push(line));

    // FIFO action
    if(lines.length > lineLimit)
      lines.splice(0, lines.length - lineLimit);

    set(lines.join("\n"));
  };
};
