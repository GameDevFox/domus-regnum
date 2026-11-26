import { HEAD, STRING } from "./node-ids";
import { lookupName } from "./lookupName";

describe("lookupName", () => {
  test("should be able to lookup name", () => {
    expect(lookupName(HEAD)).toEqual('HEAD');
    expect(lookupName(STRING)).toEqual('STRING');
  });
});
