import { wayBetween, wayLength, wayTo } from "./country";
import type { PlaceId } from "./country";
import type { Outing, Whereabouts } from "./types";

// Where someone on an outing is on the roads, and the road from a point on them to a place.
// She walks out from the house by the ways there are, and home by them again; turned round on
// the road, or sent on from one place to another (outing-send.ts), she walks from where she was.


/** The leg of a way that someone a share of the whole way along it is on, and how far along that leg. */
const legAt = (way: PlaceId[], share: number): Whereabouts => {
  let left = share * wayLength(way);
  for (let n = 1; n < way.length; n++) {
    const leg = wayLength([way[n - 1], way[n]]);
    if (left <= leg || n === way.length - 1) return { from: way[n - 1], to: way[n], along: leg > 0 ? Math.min(1, left / leg) : 1 };
    left -= leg;
  }
  return { at: way[0] };
};

/** Where someone turned round on the road is, a share of the way from where she was turned to where she is bound. */
const alongRoad = ({ from, via }: NonNullable<Outing["turned"]>, share: number): Whereabouts => {
  // First what is left of the way she was on, to the end of it she makes for; then the ways from there.
  const first = "at" in from ? 0 : wayLength([from.from, from.to]) * (via[0] === from.to ? 1 - from.along : from.along);
  const rest = wayLength(via);
  const gone = Math.max(0, Math.min(1, share)) * (first + rest);
  if (!("at" in from) && gone < first) return { from: from.from, to: from.to, along: from.along + (via[0] === from.to ? 1 : -1) * (gone / wayLength([from.from, from.to])) };
  return rest > 0 ? legAt(via, (gone - first) / rest) : { at: via[via.length - 1] };
};

/**
 * Where on the map someone on an outing is, while she is out of the house: null before she has
 * gone out at the door and after she is in again. She is at the place when she is due there
 * however long she took to reach the door: the road is walked the faster for it.
 */
export const whereabouts = (outing: Outing, clock: number): Whereabouts | null => {
  if (outing.state !== "away" || outing.left === null) return null;
  const way = wayTo(outing.to);
  if (clock < outing.arrive) {
    const share = (clock - outing.left) / (outing.arrive - outing.left);
    return outing.turned ? alongRoad(outing.turned, share) : legAt(way, share);
  }
  // Until she turns for home she is at the place, whatever the clock: she does not leave it of herself.
  if (clock < outing.depart || !outing.homeward) return { at: outing.to };
  return legAt([...way].reverse(), (clock - outing.depart) / (outing.back - outing.depart));
};

/** The road from where someone is to a place: the places she makes for, the last of them the place; and how far it is in all, in the map's units. */
export const roadFrom = (where: Whereabouts, to: PlaceId): { via: PlaceId[]; length: number } => {
  if ("at" in where) {
    const via = wayBetween(where.at, to);
    return { via, length: wayLength(via) };
  }
  // By whichever end of the way she is on is the shorter road.
  const leg = wayLength([where.from, where.to]);
  const [back, on] = [wayBetween(where.from, to), wayBetween(where.to, to)];
  const [byBack, byOn] = [where.along * leg + wayLength(back), (1 - where.along) * leg + wayLength(on)];
  return byBack <= byOn ? { via: back, length: byBack } : { via: on, length: byOn };
};
