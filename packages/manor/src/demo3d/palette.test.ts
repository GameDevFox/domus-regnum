import { describe, expect, it } from "vitest";

import { keptColours } from "./palette";

// What this browser kept of the colours picked: read so that nothing kept can stop the page.

describe("keptColours", () => {
  it("reads back what was kept", () => {
    expect(keptColours('{"rose":"#112233","sage":"#AbCdEf"}')).toEqual({ rose: "#112233", sage: "#AbCdEf" });
  });

  it("is nothing when nothing was kept", () => {
    expect(keptColours(null)).toEqual({});
  });

  it("lets go of what is not a list of colours by whose they are", () => {
    for (const kept of ["null", "3", '"#112233"', "[]", '["#112233"]', "{not json"]) expect(keptColours(kept)).toEqual({});
  });

  it("lets go of a colour that is not one, and keeps the rest", () => {
    expect(keptColours('{"rose":"red","sage":"#12345","evelyn":7,"master":null,"x":"#1234567","y":"#00ff00"}')).toEqual({ y: "#00ff00" });
  });
});
