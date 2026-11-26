import { Buffer } from "buffer";

import { Edge, Id } from "./id";

export type GraphUpdate = {
  add?: Edge[],
  remove?: Id[],
};

export type GraphEnumerate = {
  enumerate: (
    next: (edge: Edge) => void,
    done: () => void,
    error: (e: any) => void,
  ) => void,
};

export type GraphReadable = {
  read: (
    ids: Buffer[],
    next: (edge: Edge) => void,
    done: () => void,
    error: (e: any) => void,
  ) => void,
};

export type GraphWriteable = {
  write: (
    update: GraphUpdate,
    done: () => void,
    error: (e: any) => void,
  ) => void,
};

// export type GraphListHeadTails = {
//   listHeads: (
//     tail: Id,
//     next: (head: Id) => void,
//     error: (e: any) => void,
//   ) => void,

//   listTails: (
//     head: Id,
//     next: (tail: Id) => void,
//     error: (e: any) => void,
//   ) => void,
// };
