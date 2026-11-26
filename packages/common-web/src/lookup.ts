export const lookup = (record: Record<string, any>, value: any) => {
  const entry = Object.entries(record).find(([_key, lookupValue]) => lookupValue === value);

  if(entry === undefined)
    return undefined;

  // Return the `key` from the entry
  return entry[0];
};
