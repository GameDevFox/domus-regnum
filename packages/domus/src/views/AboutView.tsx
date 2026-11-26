// The public "About" tab. The app is hosted at domus.gamedevfox.org, so this is the newcomer's
// context: a one-paragraph pitch + the devlog walkthrough, before they poke the live demos.
const WALKTHROUGH_ID = "3vLh54-ZU-o";

export const AboutPanel = () => (
  <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 pt-2 text-center">
    <ul className="text-muted-foreground mx-auto flex max-w-xl flex-col gap-3 text-left text-base leading-relaxed">
      <li className="flex gap-3">
        <span aria-hidden className="text-primary mt-0.5 shrink-0 select-none">◆</span>
        <span>
          Master the art of <strong className="text-foreground font-medium">Victorian-era Hospitality</strong> in
          your own Grand Manor filled with <strong className="text-foreground font-medium">Maids and Servants</strong>{" "}
          at your beck and call.
        </span>
      </li>
      <li className="flex gap-3">
        <span aria-hidden className="text-primary mt-0.5 shrink-0 select-none">◆</span>
        <span>
          <strong className="text-foreground font-medium">A Retired Alchemy Professor</strong>, compelled to balance
          Noble Galas and Dinner Parties to win royal tolerance for his illegal research.
        </span>
      </li>
      <li className="flex gap-3">
        <span aria-hidden className="text-primary mt-0.5 shrink-0 select-none">◆</span>
        <span>
          <strong className="text-foreground font-medium">A Bright Young Woman</strong>, searching for her own
          purpose in life, uncovers an elaborate tapestry of secrets and mysteries.
        </span>
      </li>
    </ul>

    {/* Privacy-enhanced embed (no tracking cookies until play). 16:9 responsive. */}
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border shadow-[var(--shadow-soft)]">
      <iframe
        className="absolute inset-0 h-full w-full border-0"
        src={`https://www.youtube-nocookie.com/embed/${WALKTHROUGH_ID}`}
        title="Domus Regnum — walkthrough"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>

    <p className="text-muted-foreground text-sm">
      An early proof-of-concept walkthrough
    </p>
  </div>
);
