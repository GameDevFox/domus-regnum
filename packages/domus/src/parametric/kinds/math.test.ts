import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";
import { describe, expect, it } from "vitest";

import { BuildContext } from "../types";

import { mathKind } from "./math";

const calc = (op: string, a: number, b: number): number =>
  mathKind
    .build(Scope(), { op: Value(op), a: Value(a), b: Value(b) }, {} as BuildContext)
    .out.peek() as number;

describe("math kind", () => {
  it("computes the four arithmetic ops", () => {
    expect(calc("add", 8.5, 3)).toBe(11.5);
    expect(calc("subtract", 8.5, 3)).toBe(5.5); // the manor split's complement: depth − split
    expect(calc("multiply", 8.5, 0.4)).toBeCloseTo(3.4); // a percentage of the depth
    expect(calc("divide", 9, 3)).toBe(3);
  });

  it("guards divide-by-zero (→ 0)", () => {
    expect(calc("divide", 5, 0)).toBe(0);
  });

  it("falls back to add for an unknown op", () => {
    expect(calc("bogus", 2, 3)).toBe(5);
  });
});
