import type { Visitor } from "../sim/types";

// A caller, a patron or a guest, drawn in the same hand as the household: a small figure whose
// coat, hair and hat come from who she is, so a queue reads as people and not as a row of tokens.

const SKINS = ["#f3d6bd", "#e8c2a0", "#d9a982", "#f6dfcc", "#c99672"];
const COATS = ["#5b6b8a", "#7a5a4a", "#4f6b52", "#8a4a5a", "#6a5a7a", "#a8763e", "#3f5a66", "#93604a"];
const HAIRS = ["#3a2a22", "#6b4a2e", "#a0703c", "#d9c08a", "#8f8a86", "#b0503a", "#1f1a18"];
const HEAD_R = 7.2;

/** A stable scatter of small numbers from a visitor's id. */
const pick = (id: number, salt: number, n: number): number => (((id * 2654435761 + salt * 40503) >>> 0) >>> 4) % n;

type Props = { v: Visitor; seated: boolean };

export const VisitorFigure = ({ v, seated }: Props) => {
  const woman = pick(v.id, 1, 2) === 0;
  const skin = SKINS[pick(v.id, 2, SKINS.length)];
  const coat = v.honour ? "#8e3140" : v.kind === "order" ? "#2f3b52" : COATS[pick(v.id, 3, COATS.length)];
  const hair = HAIRS[pick(v.id, 4, HAIRS.length)];
  const hat = pick(v.id, 5, 3);
  // Seated figures are drawn from the lap up; standing ones full length.
  const hem = seated ? -8 : -1;
  const headY = seated ? -31 : -37;
  const shoulder = headY + 8;
  return (
    <g>
      {!seated && <ellipse cx={0} cy={0} rx={8} ry={2.2} fill="#000" opacity={0.16} />}
      {v.honour && <circle cx={0} cy={headY + 4} r={19} fill="#ffe08a" opacity={0.42} />}
      {woman ? (
        <path d={`M -5.5 ${shoulder} L 5.5 ${shoulder} L ${seated ? 9 : 10.5} ${hem} L ${seated ? -9 : -10.5} ${hem} Z`} fill={coat} />
      ) : (
        <path d={`M -6.5 ${shoulder} L 6.5 ${shoulder} L 7.5 ${hem} L -7.5 ${hem} Z`} fill={coat} />
      )}
      {!woman && <path d={`M -2 ${shoulder} L 2 ${shoulder} L 0 ${shoulder + 7} Z`} fill="#fbf6ec" />}
      {v.honour && <path d={`M -6 ${shoulder + 1} L 6 ${shoulder + 12} L 6 ${shoulder + 15} L -6 ${shoulder + 4} Z`} fill="#e8c56a" />}
      <circle cx={0} cy={headY} r={HEAD_R} fill={skin} />
      {woman ? (
        <path d={`M -8 ${headY + 6} Q -9.5 ${headY - 10} 0 ${headY - 9.5} Q 9.5 ${headY - 10} 8 ${headY + 6} L 5.5 ${headY + 2} L 5.5 ${headY - 3} Q 0 ${headY - 6} -5.5 ${headY - 3} L -5.5 ${headY + 2} Z`} fill={hair} />
      ) : (
        <path d={`M -7.3 ${headY - 1} Q -8 ${headY - 9.5} 0 ${headY - 9} Q 8 ${headY - 9.5} 7.3 ${headY - 1} Q 4 ${headY - 5} 0 ${headY - 4.5} Q -4 ${headY - 5} -7.3 ${headY - 1} Z`} fill={hair} />
      )}
      <circle cx={-2.5} cy={headY + 1} r={0.8} fill="#3a2a22" />
      <circle cx={2.5} cy={headY + 1} r={0.8} fill="#3a2a22" />
      {/* Hats: a bonnet or a topper for some, bare heads for the rest. */}
      {woman && hat === 0 && <path d={`M -8.5 ${headY - 3} Q 0 ${headY - 15} 8.5 ${headY - 3} Q 0 ${headY - 8} -8.5 ${headY - 3} Z`} fill={coat} stroke="#00000022" strokeWidth={0.5} />}
      {!woman && hat !== 2 && (
        <g fill={v.honour ? "#2b1f19" : "#3a322d"}>
          <rect x={-5} y={headY - (hat === 0 ? 17 : 13)} width={10} height={hat === 0 ? 10 : 6} rx={1} />
          <rect x={-8} y={headY - 8} width={16} height={2} rx={1} />
        </g>
      )}
      {v.kind === "order" && (
        <g transform={`translate(8 ${shoulder + 6})`}>
          <rect x={0} y={-6} width={8} height={10} rx={1} fill="#fffaf0" stroke="#8a7458" strokeWidth={0.7} />
          <path d="M 1.5 -3 L 6.5 -3 M 1.5 -1 L 6.5 -1 M 1.5 1 L 5 1" stroke="#8a7458" strokeWidth={0.6} />
        </g>
      )}
    </g>
  );
};
