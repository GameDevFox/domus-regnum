import { TWISTS } from "../sim/content/world";
import { daysToOccasion, isOccasionDay, occasionScore } from "../sim/flow";
import { hearthLevel, hearthNext } from "../sim/house";
import { DAY_SECONDS, HEARTH_LEVELS, TRIUMPH_FACTOR } from "../sim/tuning";
import type { Game } from "../sim/types";
import { isRush } from "../sim/visitors";
import { isMuted, toggleMute } from "./sound";
import { SPEEDS, dispatch, newGame, setSpeed, setUi, togglePause, useUi } from "./store";

// The strip across the top: the day and its clock, the purse, the Hearth, and the occasion the
// chapter is building toward — or, on the night itself, the score as it climbs.

export const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

const RUSH_START = 0.35;
const RUSH_END = 0.6;

const Clock = ({ g }: { g: Game }) => {
  const f = g.phase === "day" ? g.t / DAY_SECONDS : g.phase === "morning" || g.phase === "invite" ? 0 : 1;
  const label = g.phase === "morning" || g.phase === "invite" ? "Early morning" : g.phase !== "day" ? "Evening" : isRush(g.t) ? "The midday rush" : f < RUSH_START ? "Morning" : "Afternoon";
  return (
    <div className="clock" title="The shop is busiest in the middle of the day.">
      <div className="clockbar">
        <div className="rush" style={{ left: `${RUSH_START * 100}%`, width: `${(RUSH_END - RUSH_START) * 100}%` }} />
        <div className="hand" style={{ left: `${f * 100}%` }} />
      </div>
      <span>{label}</span>
    </div>
  );
};

const Hearth = ({ g }: { g: Game }) => {
  const level = hearthLevel(g.hearth);
  const next = hearthNext(g.hearth);
  const base = HEARTH_LEVELS[level - 1];
  const f = next ? (g.hearth - base) / (next - base) : 1;
  return (
    <div className="stat hearth" title="Hearth multiplies every occasion. It grows when the household eats together: one point for every kind of food on the supper table.">
      <span className="big">🔥 ×{level}</span>
      <div className="bar">
        <div className="fill" style={{ width: `${f * 100}%` }} />
      </div>
      <span className="small">Hearth{next ? ` · ${next - g.hearth} to ×${level + 1}` : ""}</span>
    </div>
  );
};

const Upcoming = ({ g }: { g: Game }) => {
  const def = g.upcoming;
  if (!def || (g.occasion !== null && g.occasion.done)) return null;
  const d = daysToOccasion(g);
  return (
    <div className="upcoming" title={`${def.intro}\n\nScore = Comfort × Grace × Hearth. Each guest takes each kind on the menu once.`}>
      <div className="when">{isOccasionDay(g) ? "Tonight" : d === 1 ? "Tomorrow evening" : d === 2 ? "The evening after next" : `In ${d} days' time`}</div>
      <div className="what">
        <span className="name">
          <b>{def.name}</b> · {def.guests} guests
        </span>
        <span className="aim">
          target <b>{fmt(def.target)}</b>
        </span>
      </div>
      <div className="twist">
        {def.honourFace} <i>{TWISTS[def.twist].name}:</i> {TWISTS[def.twist].rule}
      </div>
    </div>
  );
};

const Evening = ({ g }: { g: Game }) => {
  const occ = g.occasion;
  if (!occ) return null;
  const score = occasionScore(g);
  const level = hearthLevel(g.hearth);
  const full = occ.def.target * TRIUMPH_FACTOR;
  return (
    <div className="evening">
      <div className="sum">
        <span className="comfort">
          Comfort <b>{fmt(occ.comfort)}</b>
        </span>
        <span className="times">×</span>
        <span className="grace">
          Grace <b>{fmt(occ.grace)}</b>
        </span>
        <span className="times">×</span>
        <span className="hearthx">
          Hearth <b>{level}</b>
        </span>
        <span className="times">=</span>
        <span className={score >= occ.def.target ? "score made" : "score"}>{fmt(score)}</span>
        <span className="left" title="How long the evening has left. It ends sooner if there is nothing more anyone would take.">
          🕯️ {Math.max(0, Math.ceil(occ.length - occ.t))}s
        </span>
      </div>
      <div className="targetbar">
        <div className="fill" style={{ width: `${Math.min(100, (score / full) * 100)}%` }} />
        <div className="mark" style={{ left: "50%" }}>
          <span>target {fmt(occ.def.target)}</span>
        </div>
        <div className="timeleft" style={{ width: `${(occ.t / occ.length) * 100}%` }} />
      </div>
      <button
        className="carriages"
        onClick={() => {
          if (window.confirm("Call the carriages and end the evening now, with the score as it stands?")) dispatch({ kind: "carriages" });
        }}
        title="End the evening now, with the score as it stands."
      >
        Call the carriages
      </button>
    </div>
  );
};

export const TopBar = () => {
  const ui = useUi();
  const g = ui.game;
  const live = g.phase === "day" || g.phase === "occasion";
  return (
    <header className="topbar">
      <div className="brand">
        <b>Domus</b>
        <span>Open House</span>
      </div>
      <div className="stat">
        <span className="big">Day {g.day}</span>
        <span className="small">Chapter {g.chapter}</span>
      </div>
      {g.phase === "occasion" ? <Evening g={g} /> : <Clock g={g} />}
      <div className="speeds">
        <button className={ui.paused && live ? "on" : ""} onClick={togglePause} title="Pause (Space)" disabled={!live}>
          ⏸
        </button>
        {SPEEDS.map((s) => (
          <button key={s} className={!ui.paused && ui.speed === s ? "on" : ""} onClick={() => setSpeed(s)} title={`Speed ${s}×`}>
            {s}×
          </button>
        ))}
      </div>
      <div className="stat coin" title="Coin: from the shop and from patrons. Spent on provisions and on the evening's offers.">
        <span className="big">🪙 {fmt(g.coin)}</span>
        <span className="small">coin</span>
      </div>
      <Hearth g={g} />
      {g.phase !== "occasion" && <Upcoming g={g} />}
      <div className="menu">
        <button
          onClick={() => {
            toggleMute();
            setUi({});
          }}
          title="Sound (M)"
        >
          {isMuted() ? "🔇" : "🔊"}
        </button>
        <button onClick={() => setUi({ showHelp: true })} title="How to play">
          ?
        </button>
        <button
          onClick={() => {
            if (window.confirm("Start a new season? This one will be lost.")) newGame();
          }}
          title="New game"
        >
          ↺
        </button>
      </div>
    </header>
  );
};
