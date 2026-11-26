import { toKSON } from "./kson";

const alpha = { hello: 'world' };
const beta = 123;
const delta = "I am Delta!";
const omega = { alpha: "omega", value: 1 };
const bool = true;

const object = {
  alpha,
  beta,
  delta,
  another: {
    guess: 100,
    deepAlpha: alpha,
    deeper: [456, "hello", alpha],
    omega,
    bool,
  },
  fun: () => {},
};

const array: any[] = [
  alpha, beta, delta, object,
  [alpha, "hello", 456], bool,
];

// Create circular object references
object['sub'] = object;
object['arr'] = array

array.push(array);
array.push(object);

describe("KSON", () => {

  it('should parse as JSON if not object or array', () => {
    expect(toKSON("Hello")).toEqual("\"Hello\""); // String
    expect(toKSON(123)).toEqual("123"); // Number
    expect(toKSON(true)).toEqual("true"); // Boolean
  });

  it('should work on objects', () => {
    const kson = toKSON(object, null, 2);

    expect(JSON.parse(kson)).toEqual({
      "@0": {
        alpha: { type: "reference", id: "@1" },
        another: { type: "reference", id: "@2" },
        arr: { type: "reference", id: "@5" },
        beta: 123,
        delta: "I am Delta!",
        sub: { type: "reference", id: "@0" },
      },
      "@1": { hello: "world" },
      "@2": {
        bool: true,
        deepAlpha: { type: "reference", id: "@1" },
        deeper: { type: "reference", id: "@3" },
        guess: 100,
        omega: { type: "reference", id: "@4" },
      },
      "@3": [
        456,
        "hello",
        { type: "reference", id: "@1" },
      ],
      "@4": {
        alpha: "omega",
        value: 1,
      },
      "@5": [
        { type: "reference", id: "@1" },
        123,
        "I am Delta!",
        { type: "reference", id: "@0" },
        { type: "reference", id: "@6" },
        true,
        { type: "reference", id: "@5" },
        { type: "reference", id: "@0" },
      ],
      "@6": [
        { type: "reference", id: "@1" },
        "hello",
        456
      ],
    });

    // const original = fromKSON(kson);

    // Note: This will throw a "Circular JSON structure error"
    // You'll just have to manually verify that these are equal

    // expect(original).toEqual(object);
  });

  it('should work on arrays', () => {
    const kson = toKSON(array, null, 2);

    expect(JSON.parse(kson)).toEqual({
      "@0": [
        { type: "reference", id: "@1" },
        123,
        "I am Delta!",
        { type: "reference", id: "@2" },
        { type: "reference", id: "@6" },
        true,
        { type: "reference", id: "@0" },
        { type: "reference", id: "@2" },
      ],
      "@1": { hello: "world" },
      "@2": {
        alpha: { type: "reference", id: "@1" },
        another: { type: "reference", id: "@3" },
        arr: { type: "reference", id: "@0" },
        beta: 123,
        delta: "I am Delta!",
        sub: { type: "reference", id: "@2" },
      },
      "@3": {
        bool: true,
        deepAlpha: { type: "reference", id: "@1" },
        deeper: { type: "reference", id: "@4" },
        guess: 100,
        omega: { type: "reference", id: "@5" },
      },
      "@4": [
        456,
        "hello",
        { type: "reference", id: "@1" },
      ],
      "@5": {
        alpha: "omega",
        value: 1,
      },
      "@6": [
        { type: "reference", id: "@1" },
        "hello",
        456
      ],
    });

    // const original = fromKSON(kson);

    // Note: This will throw a "Circular JSON structure error"
    // You'll just have to manually verify that these are equal

    // expect(original).toEqual(object);
  });
});
