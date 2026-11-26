import './matchers';

import { Buffer } from "buffer";

import { Kana, LSB, MSB } from "./kana";

describe('kana', () => {
  it('split(number)', () => {
    const { split: splitLSB } = Kana(LSB);
    const { split: splitMSB } = Kana(MSB);

    expect(splitLSB(0)).toEqual([0]);
    expect(splitLSB(1)).toEqual([1]);
    expect(splitLSB(255)).toEqual([255]);
    expect(splitMSB(255)).toEqual([255]);

    expect(splitLSB(256)).toEqual([0, 1]);
    expect(splitMSB(256)).toEqual([1, 0]);

    expect(splitLSB(1234567890)).toEqual([210, 2, 150, 73]);
    expect(splitMSB(1234567890)).toEqual([73, 150, 2, 210]);
  });

  it('split(number) edge cases', () => {
    const errorMsg = 'Value must be a positive integer';

    const { toBuffer } = Kana(LSB);

    expect(() => toBuffer(-5)).toThrow(errorMsg);
    expect(() => toBuffer(12.345)).toThrow(errorMsg);
    expect(() => toBuffer(NaN)).toThrow(errorMsg);
    expect(() => toBuffer(Infinity)).toThrow(errorMsg);
  });

  it('writeNumber(number)', () => {
    const { writeNumber: writeNumberLSB } = Kana(LSB);
    const { writeNumber: writeNumberMSB } = Kana(MSB);

    expect(writeNumberLSB(0)).toEqualHex('00');
    expect(writeNumberLSB(100)).toEqualHex('64');
    expect(writeNumberLSB(127)).toEqualHex('7f');
    expect(writeNumberMSB(127)).toEqualHex('7f');

    expect(writeNumberLSB(128)).toEqualHex('80'+'80');
    expect(writeNumberLSB(234)).toEqualHex('80'+'ea');
    expect(writeNumberLSB(255)).toEqualHex('80'+'ff');
    expect(writeNumberMSB(255)).toEqualHex('80'+'ff');

    expect(writeNumberLSB(1000)).toEqualHex('81'+'e803');
    expect(writeNumberMSB(1000)).toEqualHex('81'+'03e8');

    expect(writeNumberLSB(65535)).toEqualHex('81'+'ffff');
    expect(writeNumberMSB(65535)).toEqualHex('81'+'ffff');

    expect(writeNumberLSB(1234567890)).toEqualHex('83'+'d2029649');
    expect(writeNumberMSB(1234567890)).toEqualHex('83'+'499602d2');
  });

  it('writeNumber(number) - 4-bit', () => {
    const { writeNumber: writeNumberLSB } = Kana(LSB, 4);
    const { writeNumber: writeNumberMSB } = Kana(MSB, 4);

    expect(writeNumberLSB(0)).toEqualHex('00');
    expect(writeNumberLSB(4)).toEqualHex('04');
    expect(writeNumberLSB(7)).toEqualHex('07');
    expect(writeNumberMSB(7)).toEqualHex('07');

    expect(writeNumberLSB(8)).toEqualHex('08'+'08');
    expect(writeNumberLSB(10)).toEqualHex('08'+'0a');
    expect(writeNumberLSB(15)).toEqualHex('08'+'0f');
    expect(writeNumberMSB(15)).toEqualHex('08'+'0f');

    expect(writeNumberLSB(16)).toEqualHex('09'+'0001');
    expect(writeNumberMSB(16)).toEqualHex('09'+'0100');

    expect(writeNumberLSB(255)).toEqualHex('09'+'0f0f');
    expect(writeNumberMSB(255)).toEqualHex('09'+'0f0f');

    expect(writeNumberLSB(1234567890)).toEqualHex('0c'+'0708'+'020d020006090904');
    expect(writeNumberMSB(1234567890)).toEqualHex('0c'+'0807'+'0409090600020d02');
  });

  it('writeNumber(number) - 3-bit', () => {
    const { writeNumber: writeNumberLSB } = Kana(LSB, 3);
    const { writeNumber: writeNumberMSB } = Kana(MSB, 3);

    expect(writeNumberLSB(0)).toEqualHex('00');
    expect(writeNumberLSB(3)).toEqualHex('03');
    expect(writeNumberLSB(4)).toEqualHex('04'+'04');
    expect(writeNumberMSB(4)).toEqualHex('04'+'04');

    expect(writeNumberLSB(7)).toEqualHex('04'+'07');
    expect(writeNumberLSB(8)).toEqualHex('05'+'0001');
    expect(writeNumberMSB(8)).toEqualHex('05'+'0100');

    expect(writeNumberLSB(63)).toEqualHex('05'+'0707');
    expect(writeNumberLSB(64)).toEqualHex('06'+'0204'+'000001');
    expect(writeNumberMSB(64)).toEqualHex('06'+'0402'+'010000');

    expect(writeNumberLSB(256)).toEqualHex('06'+'0204'+'000004');
    expect(writeNumberMSB(256)).toEqualHex('06'+'0402'+'040000');

    const num1 = 2048 * 2048 * 2048 * 2048 * 8;
    const num2 = num1 * 2;

    expect(writeNumberMSB(num1)).toEqualHex('06'+'0507'+         '04000000000000000000000000000000');
    expect(writeNumberMSB(num2)).toEqualHex('06'+'0601'+'040200'+'0100000000000000000000000000000000');
  });

  it('writeString(string)', () => {
    const { writeValue: writeValueLSB, writeString: writeStringLSB } = Kana(LSB);
    const { writeValue: writeValueMSB, writeString: writeStringMSB } = Kana(MSB);

    expect(writeStringLSB('a')).toEqualHex('61');

    const HELLO_WORLD_BYTES = '8a'+'48656c6c6f20576f726c64';
    expect(writeValueLSB(Buffer.from('Hello World'))).toEqualHex(HELLO_WORLD_BYTES);
    expect(writeValueMSB(Buffer.from('Hello World'))).toEqualHex(HELLO_WORLD_BYTES);
    expect(writeStringLSB('Hello World')).toEqualHex(HELLO_WORLD_BYTES);
    expect(writeStringMSB('Hello World')).toEqualHex(HELLO_WORLD_BYTES);

    const stringHex =
      '48656c6c6f20576f726c642121204974' +
      '2069732061206772656174206461792e' +
      '20546865206c656e677468206f662074' +
      '68697320737472696e6720697320';

    // Short enough to only require a VALUE_SIZE header
    const shortString = "Hello World!! It is a great day. The length of this string is 64";
    expect(shortString.length).toEqual(64);
    expect(writeStringLSB(shortString))
      .toEqualHex(`bf${stringHex}3634`);

    // Long enough to require a ELEMENT_SIZE header
    const longString = "Hello World!! It is a great day. The length of this string is 65!";
    expect(longString.length).toEqual(65);
    expect(writeStringLSB(longString))
      .toEqualHex('c0'+'4080'+stringHex+'363521');
    expect(writeStringMSB(longString))
      .toEqualHex('c0'+'8040'+stringHex+'363521');
  });

  it.skip('writeString(string) - 4-bit', () => {
    const { writeString: writeStringLSB } = Kana(LSB, 4);
    const { writeString: writeStringMSB } = Kana(MSB, 4);

    expect(writeStringLSB('a')).toEqualHex('080106');
    expect(writeStringMSB('a')).toEqualHex('080601');
    expect(writeStringLSB('Hello World')).toEqualHex('8a48656c6c6f20576f726c64');

    const stringHex =
      '48656c6c6f20576f726c642121204974' +
      '2069732061206772656174206461792e' +
      '20546865206c656e677468206f662074' +
      '68697320737472696e6720697320';

    // Short enough to only require a VALUE_SIZE header
    const shortString = "Hello World!! It is a great day. The length of this string is 64";
    expect(shortString.length).toEqual(64);
    expect(writeStringLSB(shortString))
      .toEqualHex(`0c0f0b${stringHex}06030403`);

    // Long enough to require a ELEMENT_SIZE header
    const longString = "Hello World!! It is a great day. The length of this string is 65!";
    expect(longString.length).toEqual(65);
    expect(writeStringLSB(longString))
      .toEqualHex(`0d000408${stringHex}363521`);
    expect(writeStringMSB(longString))
      .toEqualHex(`0d080400${stringHex}363521`);
  });

  // TODO: This
  // it.skip('readNumber()', () => {
  //   const { writeString: writeStringLSB } = Kana(LSB);
  //   const { writeString: writeStringMSB } = Kana(MSB);

  //   fail();
  // });
});
