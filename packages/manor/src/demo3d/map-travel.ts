import { PLACES, wayTo } from "../game";
import type { MapPoint, Outing, Whereabouts } from "../game";
import { PIECES } from "./map-art";
import { wanderAt } from "./map-wander";

// Where someone out of doors is drawn on the map. On the way she walks the way as it is drawn:
// from where it leaves the house's piece to where it meets the piece of the place she is bound
// for, and not from the middle of the one to the middle of the other, so that she is not seen
// over a place she has not yet reached, nor over the house she has left. (The author's asking,
// 2026-11-14.) A place she only passes through she crosses. At the place she walks in from the
// end of the way and goes about it (map-wander.ts); and she sets off home from wherever in it
// she had got to. Turned round on the road, she walks from where she was turned, by the road the
// rules give her (road.ts), and comes into the place at the end of that road.

const apart = (a: MapPoint, b: MapPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The point so far along a line of points, as a share of its whole length: 0 at its first point and 1 at its last. */
export const alongLine = (line: MapPoint[], share: number): MapPoint => {
  const whole = line.slice(1).reduce((sum, to, n) => sum + apart(line[n], to), 0);
  let left = Math.min(1, Math.max(0, share)) * whole;
  for (let n = 1; n < line.length; n++) {
    const length = apart(line[n - 1], line[n]);
    if (left <= length || n === line.length - 1) {
      const along = length > 0 ? Math.min(1, left / length) : 1;
      return { x: line[n - 1].x + (line[n].x - line[n - 1].x) * along, y: line[n - 1].y + (line[n].y - line[n - 1].y) * along };
    }
    left -= length;
  }
  return line[0];
};

/** Where a way from one place towards another leaves the first: the edge of its piece, on that side. */
const edgeOf = (from: MapPoint, towards: MapPoint, clear: number): MapPoint => {
  const length = apart(from, towards);
  return length > 0 ? { x: from.x + ((towards.x - from.x) / length) * clear, y: from.y + ((towards.y - from.y) / length) * clear } : from;
};

/**
 * The line walked from the house to a place: from the edge of the house's piece, through the
 * middle of any place on the way, to the edge of the place itself. (The place is reckoned at
 * the size its piece is once it is found, so that she does not start when it is.)
 */
export const wayLine = (to: Outing["to"]): MapPoint[] => {
  const way = wayTo(to);
  const points = way.map((id) => PLACES[id].at);
  if (points.length < 2) return points;
  const last = points.length - 1;
  return [edgeOf(points[0], points[1], PIECES[way[0]].clear), ...points.slice(1, last), edgeOf(points[last], points[last - 1], PIECES[way[last]].clear)];
};

/** Where she comes into a place, from the place's own point: the end of the way to it. */
export const gateOf = (to: Outing["to"]): MapPoint => {
  const line = wayLine(to);
  const end = line[line.length - 1];
  return { x: end.x - PLACES[to].at.x, y: end.y - PLACES[to].at.y };
};

/** Where on the way as it is drawn someone so far along a way between two places is: between the edges of their pieces. */
const roadPoint = (where: Whereabouts): MapPoint => {
  if ("at" in where) return PLACES[where.at].at;
  const [a, b] = [PLACES[where.from].at, PLACES[where.to].at];
  return alongLine([edgeOf(a, b, PIECES[where.from].clear), edgeOf(b, a, PIECES[where.to].clear)], where.along);
};

/** The line walked by someone turned round on the road: from where she was turned, through the middle of any place on her road, to the edge of the place she is bound for. */
const turnedLine = ({ from, via }: NonNullable<Outing["turned"]>): MapPoint[] => {
  const start = roadPoint(from);
  const points = [start, ...via.map((id) => PLACES[id].at)];
  const last = points.length - 1;
  return [...points.slice(0, last), edgeOf(points[last], points[last - 1], PIECES[via[via.length - 1]].clear)];
};

/** Where someone on an outing is drawn at a moment of the clock, and how far her step lifts her; null while she is in the house. */
export const drawnAt = (outing: Outing, clock: number): (MapPoint & { lift: number }) | null => {
  if (outing.state !== "away" || outing.left === null) return null;
  const line = wayLine(outing.to);
  const walked = outing.turned ? turnedLine(outing.turned) : line;
  if (clock < outing.arrive) return { ...alongLine(walked, (clock - outing.left) / (outing.arrive - outing.left)), lift: 0 };
  const centre = PLACES[outing.to].at;
  const end = walked[walked.length - 1];
  const gate = { x: end.x - centre.x, y: end.y - centre.y };
  /** Where in the place she is, so long after she came into it. */
  const about = (minutes: number): MapPoint & { lift: number } => {
    const stray = wanderAt(outing.who, outing.to, minutes, gate);
    return { x: centre.x + stray.x, y: centre.y + stray.y, lift: stray.lift };
  };
  // Until she turns for home she is about the place, whatever the clock.
  if (clock < outing.depart || !outing.homeward) return about(clock - outing.arrive);
  // Homeward: from where she stood when she turned for home, by the way she came.
  const from = about(outing.depart - outing.arrive);
  const home = [{ x: from.x, y: from.y }, ...[...line].reverse().slice(1)];
  return { ...alongLine(home, (clock - outing.depart) / (outing.back - outing.depart)), lift: 0 };
};
