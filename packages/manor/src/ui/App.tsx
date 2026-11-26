import { useEffect, useState } from "react";

import { ROOM_DEFS } from "../sim/content/house";
import { DEVICES } from "../sim/content/devices";
import { isOccasionDay } from "../sim/flow";
import type { RoomKind } from "../sim/types";
import { ExpeditionCard, ExpeditionPlanner, Pending, TraderCard } from "./Dialogs";
import { House } from "./House";
import { Panel } from "./Panel";
import { Ended, Help, Invite, Offers, Result, Sabbath } from "./Screens";
import { TopBar } from "./TopBar";
import { toggleMute, unlockAudio } from "./sound";
import { cycleSpeed, dispatch, getUi, setUi, togglePause, useUi } from "./store";

const MorningBar = ({ onPlan }: { onPlan: () => void }) => {
  const ui = useUi();
  const g = ui.game;
  const canSend = g.expedition === null && g.maids.some((m) => !m.isLord && !m.away);
  return (
    <div className="morning">
      <div>
        <b>Morning.</b> {isOccasionDay(g) ? "The occasion is tonight: whatever is in the house at nightfall is what the guests get." : "Post the household, choose what each room makes, then open the house."}
      </div>
      <button onClick={onPlan} disabled={!canSend}>
        Send someone out…
      </button>
      <button className="primary" onClick={() => dispatch({ kind: "startDay" })}>
        Open the house ▶
      </button>
    </div>
  );
};

const Hint = () => {
  const ui = useUi();
  if (ui.placing !== null) {
    const offer = ui.game.offers[ui.placing];
    return (
      <div className="hint">
        Click an empty room to fit it out as a {offer ? ROOM_DEFS[offer.ref as RoomKind].name.toLowerCase() : "room"}. <button onClick={() => setUi({ placing: null })}>Cancel</button>
      </div>
    );
  }
  if (ui.installing) {
    return (
      <div className="hint">
        Click a glowing room to install the {DEVICES[ui.installing].name.toLowerCase()}. <button onClick={() => setUi({ installing: null })}>Cancel</button>
      </div>
    );
  }
  return null;
};

export const App = () => {
  const ui = useUi();
  const g = ui.game;
  const [planning, setPlanning] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      unlockAudio();
      const state = getUi();
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        const phase = state.game.phase;
        if (phase === "morning") {
          setUi({ paused: false });
          dispatch({ kind: "startDay" });
        } else if (state.dusk) setUi({ dusk: false, paused: false });
        else if (phase === "day" || phase === "occasion") togglePause();
      } else if (e.code === "Tab") {
        e.preventDefault();
        cycleSpeed();
      } else if (e.code === "KeyM") {
        toggleMute();
        setUi({});
      } else if (e.code === "Escape") {
        setUi({ selection: null, placing: null, installing: null, showHelp: false, peek: false });
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const maid = state.game.maids[Number(e.code.slice(5)) - 1];
        if (maid) setUi({ selection: { kind: "maid", id: maid.id } });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlockAudio);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, []);

  const placing = ui.placing !== null;
  return (
    <div className={`app phase-${g.phase}`}>
      <TopBar />
      <main>
        <div className="stage">
          <House />
          {g.phase === "morning" && !planning && <MorningBar onPlan={() => setPlanning(true)} />}
          <Hint />
          {g.phase === "offers" && ui.peek && !placing && (
            <div className="hint">
              The house, this evening. <button onClick={() => setUi({ peek: false })}>Back to the offers</button>
            </div>
          )}
          {ui.dusk && g.phase === "occasion" && g.occasion && (
            <div className="dusk">
              <div className="line">
                <span className="tag">Dusk</span> <b className="title">{g.occasion.def.name}</b>
                {g.occasion.def.honourFace} {g.occasion.def.honourName} and {g.occasion.def.guests - 1} more are at the door. They sit with the Master first.
              </div>
              <p className="quiet">
                Post a maid in every room that has guests, and someone in the pantry to run things up. When a guest shows a 💭, click it: it is brought next and counts threefold.{" "}
                <button className="primary" onClick={() => setUi({ dusk: false, paused: false })}>
                  Show them in ▶
                </button>
              </p>
            </div>
          )}
          <div className="toasts">
            {ui.toasts.map((t) => (
              <div key={t.id} className="toast">
                {t.text}
              </div>
            ))}
          </div>
          <ExpeditionCard g={g} />
          <TraderCard g={g} />
          {ui.paused && !ui.dusk && (g.phase === "day" || g.phase === "occasion") && <div className="paused">Paused — you can still move people. Space to resume.</div>}
        </div>
        <Panel />
      </main>
      {g.phase === "invite" && !ui.showHelp && <Invite g={g} />}
      {g.phase === "offers" && !placing && !ui.peek && g.pending.length === 0 && <Offers g={g} />}
      {g.phase === "result" && g.pending.length === 0 && <Result g={g} />}
      {g.phase === "sabbath" && <Sabbath g={g} />}
      {g.phase === "ended" && <Ended g={g} />}
      {g.pending.length > 0 && g.phase !== "result" && <Pending g={g} />}
      {g.phase === "result" && g.pending.length > 0 && <Result g={g} />}
      {planning && <ExpeditionPlanner g={g} onClose={() => setPlanning(false)} />}
      {ui.showHelp && <Help />}
    </div>
  );
};
