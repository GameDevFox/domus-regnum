// Which layers the floor chooser stacks, for a house of any height: the arithmetic, apart from the drawing.

export type LayerKind = "roof" | "upper" | "ground" | "cellar";

export type Layer<Id extends string> = { id: Id | "house"; kind: LayerKind; label: string };

type StoreyLike<Id extends string> = { id: Id; name: string; y: number };

/**
 * The layers from the top down: the roof (which stands for the whole house), every storey at or
 * above ground from the highest to the ground floor, then every storey below ground from the
 * shallowest to the deepest. The ground floor is the lowest storey that is not below ground.
 */
export const layersOf = <Id extends string>(storeys: StoreyLike<Id>[]): Layer<Id>[] => {
  const highestFirst = [...storeys].sort((a, b) => b.y - a.y);
  const above = highestFirst.filter((s) => s.y >= 0);
  const below = highestFirst.filter((s) => s.y < 0);
  return [
    { id: "house", kind: "roof", label: "Whole house" },
    ...above.map((s, n): Layer<Id> => ({ id: s.id, kind: n === above.length - 1 ? "ground" : "upper", label: s.name })),
    ...below.map((s): Layer<Id> => ({ id: s.id, kind: "cellar", label: s.name })),
  ];
};
