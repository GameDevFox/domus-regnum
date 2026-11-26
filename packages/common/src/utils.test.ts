import { Edge, idToBase64 } from "./id";
import { HEAD, TAIL } from "./node-ids";
import { edgeToBase64, times, timesStr, toAsync } from "./utils";

describe("utils", () => {
  it("test", async () => {
    const sequence: string[] = [];

    const myAsync = toAsync((hello: string, world: number) => {
      sequence.push("async");
      return `${hello}, ${world}!`;
    });


    sequence.push("start");
    const promise = myAsync("Hello", 123);
    sequence.push("end");

    const result = await promise;

    expect(sequence).toEqual(["start", "end", "async"]);
    expect(result).toEqual("Hello, 123!");
  });

  it("edgeToBase64", () => {
    const edge = Edge(HEAD, TAIL);

    const base64 = edgeToBase64(edge);
    expect(base64).toEqual({
      "head": idToBase64(HEAD),
      "tail": idToBase64(TAIL),
    });
  });

  it("times", () => {
    const result = times(5, n => Math.pow(2, n));
    expect(result).toEqual([1, 2, 4, 8, 16]);
  });

  it("timesStr", () => {
    const result = timesStr(4, "test");
    expect(result).toEqual([
      "test",
      "test",
      "test",
      "test",
    ]);
  });
});
