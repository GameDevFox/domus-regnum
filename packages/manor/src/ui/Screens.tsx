import { useEffect, useState } from "react";

import { GOODS, RECIPES, ROOM_DEFS } from "../sim/content/house";
import { HIRED, hiredCost, isHired } from "../sim/content/hired";
import { ORNAMENTS } from "../sim/content/ornaments";
import { MAID_DEFS, TRAITS, TWIN_OF } from "../sim/content/people";
import { OCCASIONS, TWISTS } from "../sim/content/world";
import { chapterLength, donationCost, epilogue, invitations, par, standing } from "../sim/flow";
import { hearthLevel } from "../sim/house";
import { rerollCost } from "../sim/offers";
import { DONATION_HEARTH, SHORTFALL_HEARTH, TRIUMPH_FACTOR } from "../sim/tuning";
import type { Game, Offer, RoomKind } from "../sim/types";
import { Portrait } from "./Portrait";
import { fmt } from "./TopBar";
import { dispatch, newGame, setUi } from "./store";

// The screens between the running days: the invitation, the evening's offers, the result of an
// occasion, the Sabbath, and the end of the season.

/** A figure to two significant places, for a number that is only a guide. */
const roundish = (n: number): number => {
  if (n <= 0) return 0;
  const unit = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
  return Math.round(n / unit) * unit;
};

/** What a card asks of a house nobody has heard of. */
const usual = (id: string): number => OCCASIONS.find((o) => o.id === id)?.target ?? 0;

/** "three times as much", "about the same", "a third as much": a target against the last score, in words. */
const ratio = (r: number): string => {
  const WORDS = ["", "", "twice", "three times", "four times", "five times", "six times", "seven times", "eight times", "nine times", "ten times"];
  if (r >= 1.5) return `${r < 10.5 ? WORDS[Math.round(r)] : `${Math.round(r)} times`} as much`;
  if (r > 0.75) return "about as much";
  if (r > 0.4) return "half as much";
  if (r > 0.28) return "a third as much";
  return `a ${Math.round(1 / r)}th as much`;
};

export const Invite = ({ g }: { g: Game }) => {
  const options = invitations(g);
  const last = g.results.length > 0 ? g.results[g.results.length - 1].score : null;
  return (
    <div className="modal">
      <div className="sheet wide">
        <h2>{options.length > 2 ? "Three cards on the hall table" : options.length > 1 ? "Two cards on the hall table" : "A card on the hall table"}</h2>
        <p className="lede">Each chapter ends in an occasion. Its score is Comfort × Grace × Hearth; every guest takes each kind on the menu once.</p>
        <div className="cards">
          {options.map((o) => (
            <div key={o.id} className={`offer ${o.grade}`}>
              <div className="tag">{o.grade === "royal" ? "The royal invitation" : o.grade === "grand" ? "The grander invitation" : options.length > 1 ? "The humbler invitation" : "Invitation"}</div>
              <h3>{o.name}</h3>
              <p className="intro">{o.intro}</p>
              <p>
                <span className="face">{o.honourFace}</span> <b>{o.honourName}</b> and {o.guests - 1} other{o.guests - 1 === 1 ? "" : "s"}.
              </p>
              <p className="rule">
                <i>{TWISTS[o.twist].name}.</i> {TWISTS[o.twist].rule}
              </p>
              <p className="target">
                Target <b>{fmt(o.target)}</b>
              </p>
              {o.target > usual(o.id) && <p className="quiet">Word of the last evening has gone round. Of most houses this card asks {fmt(usual(o.id))}; of this one, people hope for more.</p>}
              {last !== null && <p className="quiet">That is {ratio(o.target / last)} as the house scored last time.</p>}
              <button className="primary" onClick={() => dispatch({ kind: "invite", grade: o.grade })}>
                Accept
              </button>
            </div>
          ))}
        </div>
        <p className="lede small">
          {last !== null
            ? `Last time the house scored ${fmt(last)}. On that form it might manage about ${fmt(roundish(par(g, g.chapter)))} this time. `
            : "A first occasion usually scores somewhere between 500 and 20,000. "}
          Twice a card's target is a triumph. There are {chapterLength(g.chapter)} days to get ready.
        </p>
        {g.chapter <= 4 && options.length < 3 && (
          <p className="quiet">
            {g.chapter === 1 ? "Do well and grander cards follow. " : ""}
            {options.length === 1 && g.chapter > 1 ? "Society sends the grander card only to a house whose last occasion went well. " : ""}
            {options.length === 2 ? "The royal card comes only after a triumph: twice the target. " : ""}
          </p>
        )}
      </div>
    </div>
  );
};

/** Traits that only work in one kind of room: worth saying before the wages are agreed. */
const NEEDS_ROOM: Record<string, RoomKind> = { greenThumb: "conservatory" };

const OfferCard = ({ g, offer, index }: { g: Game; offer: Offer; index: number }) => {
  const afford = g.coin >= offer.cost;
  let title = "";
  let tag = "";
  let body: React.ReactNode = null;
  if (offer.kind === "hire") {
    const def = MAID_DEFS[offer.ref];
    const trait = TRAITS[def.trait];
    const twin = TWIN_OF[offer.ref];
    tag = "Seeking a place";
    title = twin ? `${def.name} & ${MAID_DEFS[twin].name}` : def.name;
    body = (
      <>
        <p className="intro">{def.blurb}</p>
        <p className="rule">
          <b>{trait.name}.</b> {trait.effect}
        </p>
        {NEEDS_ROOM[def.trait] && !g.rooms.some((r) => r.kind === NEEDS_ROOM[def.trait]) && <p className="warn">The house has no {ROOM_DEFS[NEEDS_ROOM[def.trait]].name.toLowerCase()} yet, so this would do nothing for now.</p>}
      </>
    );
  } else if (offer.kind === "room") {
    const def = ROOM_DEFS[offer.ref as RoomKind];
    tag = "Fit out a room";
    title = `${def.glyph} ${def.name}`;
    body = <p className="rule">{def.blurb}</p>;
  } else if (offer.kind === "recipe") {
    const r = RECIPES[offer.ref];
    const good = GOODS[r.makes];
    const needs = Object.entries(r.needs);
    tag = "A recipe";
    title = `${good.glyph} ${good.name}`;
    body = (
      <>
        <p className="rule">{good.note}</p>
        <p>
          <i className={good.pole ?? ""}>{good.pole === "comfort" ? "Comfort" : "Grace"} {good.value}</i> · sells for {good.price}
        </p>
        {needs.length > 0 && <p>Each batch needs {needs.map(([id, n]) => `${n} ${GOODS[id].glyph} ${GOODS[id].name.toLowerCase()}`).join(", ")}.</p>}
      </>
    );
  } else if (offer.kind === "luxury") {
    const good = GOODS[offer.ref];
    tag = "The grocer's van";
    title = `${good.glyph} ${good.name} × ${offer.qty}`;
    body = (
      <>
        <p className="rule">{good.note}</p>
        <p>
          <i className={good.pole ?? ""}>{good.pole === "comfort" ? "Comfort" : "Grace"} {good.value}</i> each · one for every guest
        </p>
        <p className="quiet">Set by for the occasion as soon as it is bought.</p>
      </>
    );
  } else {
    tag = "The house";
    title = `Open the ${offer.ref} wing`;
    body = <p className="rule">Four more rooms, under dust sheets since the old Master's day.</p>;
  }
  const noRoom = offer.kind === "room" && !g.rooms.some((r) => r.kind === "empty");
  const buy = (): void => {
    if (offer.kind === "room") setUi({ placing: index });
    else if (dispatch({ kind: "buy", index }) && offer.kind === "wing") setUi({ peek: true });
  };
  return (
    <div className={offer.sold ? "offer sold" : "offer"}>
      <div className="tag">{tag}</div>
      <h3>{title}</h3>
      {body}
      <button className="primary" disabled={offer.sold || !afford || noRoom} onClick={buy} title={noRoom ? "There is no empty room to fit out." : ""}>
        {offer.sold ? "Taken" : noRoom ? "No empty room" : `🪙 ${offer.cost}`}
      </button>
    </div>
  );
};

export const Offers = ({ g }: { g: Game }) => (
  <div className="modal">
    <div className="sheet wide">
      <h2>Evening</h2>
      <p className="lede">
        Sold {g.today.sold} · earned 🪙 {g.today.coinEarned}
        {g.today.lost > 0 ? ` · ${g.today.lost} went away unserved` : ""} · supper: {g.lastSupper === "none" ? "none" : g.lastSupper === "shared" ? "shared" : "a feast"} · Hearth ×{hearthLevel(g.hearth)}
      </p>
      <div className="cards">
        {g.offers.map((o, i) => (
          <OfferCard key={i} g={g} offer={o} index={i} />
        ))}
        {g.offers.length === 0 && <p className="quiet">Nobody called this evening.</p>}
      </div>
      {g.upcoming && !(g.occasion !== null && g.occasion.done) && (
        <div className="sake">
          <h4>Engaged for {g.upcoming.name} only</h4>
          <div className="chips">
            {HIRED.map((h) => {
              const taken = isHired(g, h.id);
              const cost = hiredCost(g, h.id);
              return (
                <button key={h.id} className={taken ? "chip on" : "chip"} disabled={taken || g.coin < cost} title={h.effect} onClick={() => dispatch({ kind: "engage", id: h.id })}>
                  {h.glyph} {h.name} · {taken ? "engaged" : `🪙 ${cost}`}
                </button>
              );
            })}
          </div>
          <p className="quiet">A quartet doubles Grace for the evening, a chef doubles Comfort, footmen are two more pairs of hands.</p>
        </div>
      )}
      <div className="sake">
        <h4>For its own sake · these do nothing at all</h4>
        <div className="chips">
          {ORNAMENTS.filter((o) => !(g.ornaments ?? []).includes(o.id)).map((o) => (
            <button
              key={o.id}
              className="chip"
              disabled={g.coin < o.cost}
              title={o.blurb}
              onClick={() => {
                if (dispatch({ kind: "ornament", id: o.id })) setUi({ peek: true });
              }}
            >
              {o.glyph} {o.name} · 🪙 {o.cost}
            </button>
          ))}
          {ORNAMENTS.every((o) => (g.ornaments ?? []).includes(o.id)) && <span className="quiet">The house has everything.</span>}
        </div>
      </div>
      <div className="row">
        <span className="purse">🪙 {fmt(g.coin)}</span>
        <button onClick={() => dispatch({ kind: "donate" })} disabled={g.coin < donationCost(g)} title="Coin into Hearth. Each gift costs half as much again as the last.">
          A gift to the parish · 🪙 {donationCost(g)} · Hearth +{DONATION_HEARTH}
        </button>
        <button onClick={() => dispatch({ kind: "reroll" })} disabled={g.coin < rerollCost(g)}>
          Ask around again · 🪙 {rerollCost(g)}
        </button>
        <button onClick={() => setUi({ peek: true })} title="Close this sheet and look at the house.">
          Look at the house
        </button>
        <button className="primary" onClick={() => dispatch({ kind: "nextDay" })}>
          Good night →
        </button>
      </div>
    </div>
  </div>
);

const RESULT_TEXT = {
  triumph: { stamp: "A triumph", line: "They will be talking about it for a month." },
  success: { stamp: "It went well", line: "The carriages left late, which is the only compliment that counts." },
  shortfall: { stamp: "It fell short", line: "Nobody said anything unkind. Nobody said very much at all." },
};

const COUNT_SECONDS = 1.4;

/** A number that runs up to its value when it first appears. */
const useCountUp = (value: number): number => {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / (COUNT_SECONDS * 1000));
      // Ease out: fast at first, settling on the figure.
      setShown(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
};

export const Result = ({ g }: { g: Game }) => {
  const occ = g.occasion;
  const shown = useCountUp(occ?.score ?? 0);
  if (!occ || !occ.tier) return null;
  const text = RESULT_TEXT[occ.tier];
  return (
    <div className="modal">
      <div className={`sheet result ${occ.tier}`}>
        <div className="tag">{occ.def.name}</div>
        <h2>{text.stamp}</h2>
        <div className="sum big">
          <span className="comfort">
            Comfort <b>{fmt(occ.comfort)}</b>
          </span>
          <span className="times">×</span>
          <span className="grace">
            Grace <b>{fmt(occ.grace)}</b>
          </span>
          <span className="times">×</span>
          <span className="hearthx">
            Hearth <b>{occ.level}</b>
          </span>
        </div>
        <div className="final">
          {fmt(shown)} <span>against a target of {fmt(occ.def.target)}</span>
        </div>
        <p className="lede">{text.line}</p>
        {occ.tier === "shortfall" ? (
          <p>The household sat up in the kitchen afterwards with what was left, and nobody went to bed until it had been laughed about. <b>Hearth +{SHORTFALL_HEARTH}.</b> Society will send the humbler card next time.</p>
        ) : (
          <p>
            Renown: more people will come to the shop, and the grander invitation will be on the table next time.
            {occ.tier === "success" ? ` (Twice the target, ${fmt(occ.def.target * TRIUMPH_FACTOR)}, would have been a triumph, and brought the royal card.)` : " The Master has gone straight back to the laboratory with an idea."}
          </p>
        )}
        {occ.served > 0 && (
          <p className="quiet">
            {occ.served} servings · {occ.fancies} {occ.fancies === 1 ? "fancy" : "fancies"} caught{occ.fancies > 0 ? ", each counting threefold" : ""}
          </p>
        )}
        {occ.served === 0 && <p className="warn">Nothing was served at all. Guests are only served in rooms where a maid is posted, and only what is in the house.</p>}
        <button className="primary" onClick={() => dispatch({ kind: "continue" })}>
          Continue
        </button>
      </div>
    </div>
  );
};

export const Sabbath = ({ g }: { g: Game }) => (
  <div className="modal night">
    <div className="sheet">
      <div className="tag">The day after</div>
      <h2>The Sabbath</h2>
      <Portrait g={g} />
      <p className="lede">{g.log.filter((l) => l.text.startsWith("The Sabbath")).slice(-1)[0]?.text ?? "A day of rest."}</p>
      <p>Cuts and bruises are mended. Hearth +1.</p>
      <button className="primary" onClick={() => dispatch({ kind: "continue" })}>
        Monday morning
      </button>
    </div>
  </div>
);

export const Ended = ({ g }: { g: Game }) => {
  const e = epilogue(g);
  return (
    <div className="modal night">
      <div className="sheet wide">
        <div className="tag">The season is over</div>
        <h2>{e.title}</h2>
        <Portrait g={g} />
        <p className="lede">{e.text}</p>
        <ul className="results">
          {g.results.map((r, i) => (
            <li key={i} className={r.tier}>
              <b>{r.occasion}</b> <i>({r.grade})</i> — {RESULT_TEXT[r.tier].stamp.toLowerCase()} · {fmt(r.score)} / {fmt(r.target)}
            </li>
          ))}
        </ul>
        <p className="standing">
          Standing <b>{standing(g)}</b> <span>of a possible 17</span>
        </p>
        <p>
          Hearth ×{hearthLevel(g.hearth)} · {g.stats.feasts} feasts and {g.stats.suppers} plain suppers together · {g.stats.sold} sold · 🪙 {fmt(g.stats.coinEarned)} earned · {g.maids.length - 1} in service
        </p>
        <div className="row">
          <button onClick={() => newGame()}>A new season, a new house</button>
          <button className="primary" onClick={() => dispatch({ kind: "continue" })}>
            Carry on: another season, harder
          </button>
        </div>
      </div>
    </div>
  );
};

export const Help = () => (
  <div className="modal">
    <div className="sheet wide help">
      <div className="tag">Domus · Open House</div>
      <h2>How the house works</h2>
      <p className="lede">Lord Ambrose would like to be left alone with his laboratory. He has one maid, a shop nobody is minding, and a card on the hall table.</p>
      <div className="cols">
        <div>
          <h4>By day</h4>
          <p>
            <b>Drag anyone into a room</b> and they work it: bake in the kitchen, sell at the shop counter, serve in the parlour, run goods from the pantry. There are never enough hands, so the day is spent moving them to where the need is.
          </p>
          <p>Click a room to choose what it makes: pick several and it rotates between them. In the larder list each good is <b>sell</b> or <b>keep</b>, and <b>menu</b> strikes it off the guests' menu. The guests' share is never sold.</p>
          <p>
            The Master would rather be in the <b>laboratory</b>, where his time becomes inventions. Each invention takes one chore off the maids for good.
          </p>
          <p>A patron at a tea table may show a 💭 too: click it and she buys that as well, at three times the price.</p>
        </div>
        <div>
          <h4>The occasion</h4>
          <p>
            Every chapter ends with guests. The score is <b className="comfort">Comfort</b> × <b className="grace">Grace</b> × <b className="hearthx">Hearth</b>, against a target you are shown in advance.
          </p>
          <p>Each guest takes each kind on the menu once, so <b>more kinds</b> matter more than more loaves. Bread is Comfort, tea is Grace. One without the other multiplies to nothing.</p>
          <p>
            Guests sit with <b>the Master</b> first: put him in the parlour for the evening. When a guest shows a <b>💭 fancy</b>, click it and it is brought next, counting threefold. Unnoticed, it counts for nothing extra.
          </p>
          <p>You choose which card to accept. Fall short and nothing ends: the household is closer for it, and the next card is the humble one. Do far better than a card asked and the grander cards ask more next time; the humble one never asks more than half of what you last did.</p>
        </div>
        <div>
          <h4>The Hearth</h4>
          <p>Each night the household eats together: one of every food there is enough of for all. <b>One point for every kind on the table.</b> Its level multiplies every occasion. Supper is set aside before the shop sells.</p>
          <p>Coin buys hires, rooms and recipes in the evening — and, late on, champagne by the case and a quartet for the night.</p>
          <h4>Keys</h4>
          <p>
            <kbd>Space</kbd> pause · <kbd>Tab</kbd> speed · <kbd>1</kbd>–<kbd>7</kbd> select someone · <kbd>M</kbd> sound · <kbd>Esc</kbd> deselect
          </p>
        </div>
      </div>
      <button className="primary" onClick={() => setUi({ showHelp: false })}>
        Open the door
      </button>
    </div>
  </div>
);
