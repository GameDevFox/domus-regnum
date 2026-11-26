import { Buffer } from "buffer";

export const LSB = -1;
export const MSB = 1;

export type Endianness = typeof LSB | typeof MSB;

const VALUE_FACTOR        = 0;
const VALUE_SIZE_FACTOR   = 1;
const ELEMENT_SIZE_FACTOR = 2;

const bufferListCount = (result: number, buffer: Buffer) => {
  return result + buffer.length;
};

export const Kana = (endianness: Endianness, blockSize = 8) => {
  const blockValue = Math.pow(2, blockSize);
  const fullBlock = blockValue - 1;

  const prefix = (factor: number) => {
    if(
      factor < 0 ||
      factor > blockSize ||
      !Number.isInteger(factor)
    )
      throw new Error(
        "Factor must be an integer between 0 and " +
        `the BLOCK_SIZE (${blockSize}) inclusive: ${factor}`
      );

    return fullBlock ^ (Math.pow(2, blockSize - factor) - 1);
  };

  const maxPrefixValue = (factor: number) => {
    if(
      factor < 0 ||
      factor > blockSize - 1 ||
      !Number.isInteger(factor)
    )
      throw new Error(
        "Factor must be an integer between 0 and " +
        `the BLOCK_SIZE - 2 (${blockSize - 2}) inclusive: ${factor}`
      );

    return Math.pow(2, blockSize - factor - 1);
  };

  // const valuePrefix       = prefix(VALUE_FACTOR);        // 0000 0000
  // const valueSizePrefix   = prefix(VALUE_SIZE_FACTOR);   // 1000 0000
  // const elementSizePrefix = prefix(ELEMENT_SIZE_FACTOR); // 1100 0000

  const VALUE_PREFIX_SIZE        = maxPrefixValue(VALUE_FACTOR);
  const VALUE_SIZE_PREFIX_SIZE   = maxPrefixValue(VALUE_SIZE_FACTOR);
  const ELEMENT_SIZE_PREFIX_SIZE = maxPrefixValue(ELEMENT_SIZE_FACTOR);

  const setPrefix = (bufferList: Buffer[], factor: number) => {
    if(bufferList.length === 0)
      throw new Error("Can't set prefix on empty buffer list");

    const pfx = prefix(factor);

    const isLSB = endianness === LSB;
    const bufferIndex = isLSB ? bufferList.length - 1 : 0;
    const firstBuffer = bufferList[bufferIndex];

    const blockIndex = isLSB ? firstBuffer.length - 1 : 0;
    firstBuffer[blockIndex] |= pfx;
  };

  const fitToBlock = (buffer: Buffer, factor: number) => {
    // We might have to add an extra block to make enough room for the prefix
    if(endianness !== LSB && endianness !== MSB)
      throw new Error("Endianness must be LSB or MSB");

    const result = [buffer];

    const isLSB = endianness === LSB;
    const index = isLSB ? buffer.length - 1 : 0;
    const mask = prefix(factor + 1);

    const needsExtraBlock = (buffer[index] & mask) !== 0;

    if(needsExtraBlock) {
      if(isLSB)
        result.push(Buffer.from([0]));
      else
        result.unshift(Buffer.from([0]));
    }

    return result;
  }

  const split = (value: number) => {
    if(value === 0)
      return [0];

    if(
      value < 0 || // Negative
      !Number.isInteger(value) // Non-integer
    )
      throw new Error("Value must be a positive integer: " + value);

    const result: number[] = [];

    while(value) {
      const remainder = value % blockValue;
      result.push(remainder);
      value -= remainder;
      value /= blockValue;
    }

    if(endianness === MSB)
      result.reverse();

    return result;
  };

  const toBuffer = (value: number) => {
    return Buffer.from(split(value));
  }

  const writeValue = (value: Buffer): Buffer[] => {
    if(value.length === 1 && value[0] < VALUE_PREFIX_SIZE)
      return [Buffer.from(value)];

    const bufferSize = value.length;
    const result = writeValueSize(bufferSize);

    result.push(value);

    return result;
  };

  const writeNumber = (value: number) => {
    const buffer = toBuffer(value);
    return writeValue(buffer);
  };

  const writeString = (value: string) => {
    // TODO: This only works if block size is 8. Rewrite to
    // make compatible with other block sizes
    const buffer = Buffer.from(value, "utf8");
    return writeValue(buffer);
  };

  const writeValueSize = (blockCount: number) => {
    let result: Buffer[] = [];

    // Subtract 1 from value size as per the specifications
    const actualSize = blockCount - 1;

    let valueSize;
    if(actualSize < VALUE_SIZE_PREFIX_SIZE) {
      valueSize = writeNumber(actualSize);
    } else {
      const valueSizeBuffer = toBuffer(actualSize);
      valueSize = fitToBlock(valueSizeBuffer, VALUE_SIZE_FACTOR);

      const valueSizeSize = valueSize.reduce(bufferListCount, 0);
      const elementSize = writeElementSize(valueSizeSize);

      result = result.concat(elementSize);
    }

    setPrefix(valueSize, VALUE_SIZE_FACTOR);
    result = result.concat(valueSize);

    return result;
  };

  const writeElementSize = (blockCount: number) => {
    let result: Buffer[] = [];

    // Subtract 2 from element size as per the specifications
    const actualSize = blockCount - 2;

    let elementSize;
    if(actualSize < ELEMENT_SIZE_PREFIX_SIZE) {
      elementSize = writeNumber(actualSize);
    } else {
      const elementSizeBuffer = toBuffer(actualSize);
      elementSize = fitToBlock(elementSizeBuffer, ELEMENT_SIZE_FACTOR);

      const elementSizeSize = elementSize.reduce(bufferListCount, 0);
      const firstElementSize = writeElementSize(elementSizeSize);

      result = result.concat(firstElementSize);
    }

    setPrefix(elementSize, ELEMENT_SIZE_FACTOR)
    result = result.concat(elementSize)

    return result;
  };

  return { split, toBuffer, writeValue, writeNumber, writeString }
};
