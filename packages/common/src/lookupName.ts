import { type Id, idToBase64 } from "./id";
import { names } from "./node-id-names";

export const lookupName = (id: Id) => names[idToBase64(id)];
