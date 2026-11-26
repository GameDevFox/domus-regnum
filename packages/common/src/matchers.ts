import { Buffer } from "buffer";

import { matcherHint, printDiffOrStringify } from "jest-matcher-utils";

const EXPECTED_LABEL = "Expected";
const RECEIVED_LABEL = "Received";

declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualHex(hex: string): R;
    }
  }
}

// TODO: Revisit this

expect.extend({
  toEqualHex: function(buffer, expected) {
    const options = {
      isNot: this.isNot,
      promise: this.promise,
    };

    if(Array.isArray(buffer))
      buffer = Buffer.concat(buffer)

    const received = buffer.toString("hex");
    const pass = received === expected;

    const message = () =>
      matcherHint("toEqualHex", undefined, undefined, options) +
      "\n\n" +
      printDiffOrStringify(
        expected, received,
        EXPECTED_LABEL, RECEIVED_LABEL,
        this.expand !== false
      );

    return { pass, message };
  }
});
