/* eslint-disable */
import { pick } from "lodash";

describe("types", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });
});

// This is where we can play around with tests and
// keep a record for later reference
{
  type SwapType<T> = T extends string ? number : string;

  const swap = <T extends string | number, R = SwapType<T>>(value: T): R => {
    if (typeof value === "string")
      return parseFloat(value) as any;

    if (typeof value === "number")
      return value.toString() as any;

    throw new Error("Must pass a string or a number");
  }

  const aNumber = swap("hello");
  const aString = swap(123);
  // const anError = swap(false)
}

/////////////////////////////////////////////////////////

{
  const neverArg = (x: never) => {
    console.log("Hello, World!");
  }

  // neverArg();
  // neverArg(123 as any);
}

/////////////////////////////////////////////////////////

{
  type A = string | number | boolean
  type B = string | boolean | RegExp

  // INTERSECTION
  type X1 = Extract<A, B>
  type X2 = Extract<B, A>
  type X3 = A & B;

  // The type hint shows at `string | boolean`
  const hello1: X1 = "hello";
  const hello2: X1 = false;
  // The type hint shows as `A & B`
  const hello3: X3 = "hello";
  const hello4: X3 = false;

  // SET DIFFERENCE
  type Y1 = Exclude<A, B>
  type Y2 = Exclude<B, A>

  const aNumber: Y1 = 123;
  const aRegExp: Y2 = /hello/;
  // const mismatchA: Y1 = "hello";
  // const mismatchB: Y2 = "hello";
}

/////////////////////////////////////////////////////////

{
  type Test<T> = T extends (...args: infer A) => any ? A : never;

  const testFn = (hello: string, world: number) => {
    return `${hello}, ${world}!`;
  };

  type Args = Test<typeof testFn>;
}

/////////////////////////////////////////////////////////

{
  type TupleToUnion<T extends any[]> = T extends [infer U, ...infer _Rest]
    ? U
    : never;

  function getTupleHead<T extends any[]>(tuple: [...T]): TupleToUnion<T> {
    return tuple[0];
  }

  const resultX = getTupleHead([]); // result1 is inferred as string | number
  const result0 = getTupleHead([42]); // result1 is inferred as string | number
  const result1 = getTupleHead(["hello", 42]); // result1 is inferred as string | number
  const result2 = getTupleHead([true, false, true]); // result2 is inferred as boolean
}

/////////////////////////////////////////////////////////

const myObj = {
  a: 123,
  b: "two",
  c: true,
};

// type MyType = keyof typeof myObj;

// type MyPick<T extends MyType> = Pick<typeof myObj, T>;

const getValues = <T extends keyof typeof myObj>(keys: T[]): ({ [P in T]: (typeof myObj)[P] }) => {
  return pick(myObj, keys);
};

const values = getValues(["a", "c"]);

// TODO: Turn this into a test?
// console.log("values", values);
