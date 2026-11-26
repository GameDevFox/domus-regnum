import { Buffer } from "buffer";

import { mapValues } from "lodash";

import { names } from "./node-id-names";

export type Id = Buffer;

export type Edge = {
  head: Id,
  tail: Id,
};

export type EdgeWithId = Edge & {
  id: Id,
};

export type EdgeT<T> = {
  id?: T,
  head: T,
  tail: T,
};

export const Edge = (head: Id, tail: Id) => ({ head, tail }) as Edge;

export const base64ToId = (base64: string): Id =>
  Buffer.from(
    base64.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );

export const idToBase64 = (id: Id): string =>
  id.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

export const idToString = (id: Id): string => {
  const b64 = idToBase64(id);
  return `<: ${names[b64] ? `$${names[b64]}` : `#${b64}`} :>`;
};

export const edgeToObj = (edge: EdgeWithId): EdgeT<string> => {
  return {
    ...(edge.id ? { id: idToBase64(edge.id) } : {}),
    head: idToBase64(edge.head),
    tail: idToBase64(edge.tail),
  };
};

export const isEqual = (a: Id, b: Id): boolean => a.equals(b);

export const compare = (a: Id, b: Id): number => a.compare(b);

export const sortIds = (ids: Id[]): Id[] => [...ids].sort(compare);

export const mapIdsToStr = (map: Record<string, Id>) => mapValues(map, idToBase64);
