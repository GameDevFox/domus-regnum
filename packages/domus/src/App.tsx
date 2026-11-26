import "./App.css";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";

import { useApp } from "@kitsune/common-web/src/react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AkiPanel } from "./aki/AkiView";
import { DomusAppCanvas } from "./domus-app/DomusAppCanvas";
import { scenarios } from "./domus-app/path-debug";
import { domusApp, gameLoading } from "./domus-app/three-app";
import { AboutPanel } from "./views/AboutView";
import { CuePanel } from "./tea/CueView";
import { PatternBuilder } from "./tea/PatternBuilder";
import { TeaDemo } from "./tea/TeaDemo";
import { CanvasLoader } from "./views/CanvasLoader";
import { CameraControlsLegend, ControlsCard } from "./views/controls-card";
import { GameControls } from "./views/GameControls";
import { HouseStatus } from "./views/HouseStatus";
import { LevelEditorPanel } from "./views/LevelEditorView";
import { ManorDemos } from "./views/ManorDemos";
import { MaidColorPanel } from "./views/MaidColorView";
import { PathDebugPanel } from "./views/PathDebugView";
import { useClickOutside } from "./views/use-click-outside";
import { useTogglePanel } from "./views/use-toggle-panel";
import { VnDialogue } from "./views/VnDialogue";

// Tab ↔ route table — the single place the mapping lives (both directions derive from it).
// Order matters: the first prefix match wins (/tea/emote before /tea); "game" is the "/" fallback.
const TAB_ROUTES: { tab: string; prefix: string; path: string }[] = [
  { tab: "debug", prefix: "/path-debug", path: "/path-debug" }, // path overridden with the last scenario
  { tab: "build", prefix: "/build", path: "/build" },
  { tab: "maids", prefix: "/maids", path: "/maids" },
  { tab: "about", prefix: "/about", path: "/about" },
  { tab: "aki", prefix: "/aki", path: "/aki" },
  { tab: "emote", prefix: "/tea/emote", path: "/tea/emote" },
  { tab: "pattern", prefix: "/tea/builder", path: "/tea/builder" },
  { tab: "tea", prefix: "/tea", path: "/tea" }, // the composited Scene (old /tea/demo links still match the prefix)
];

// Secondary tabs, tucked into the "More" dropdown to keep the main bar to the four primary destinations.
const MORE_TABS = [
  { value: "aki", label: "Aki" },
  { value: "debug", label: "Path Demo" },
  { value: "emote", label: "Emote Demo" },
  { value: "pattern", label: "Pattern Builder" },
  { value: "maids", label: "Color Demo" },
] as const;

// A tab-bar-styled dropdown for the secondary tabs. Navigates via the shared `onSelect` (changeTab), so
// routing/scenario handling stays in one place. Reflects the active secondary tab in its label + a check.
const MoreMenu = ({ tab, onSelect }: { tab: string; onSelect: (value: string) => void }) => {
  const menu = useTogglePanel();
  const ref = useClickOutside<HTMLDivElement>(menu.open, menu.close, { escape: true });

  const active = MORE_TABS.find((t) => t.value === tab);
  return (
    <div ref={ref} className="relative flex h-full items-center">
      <button
        type="button"
        onClick={menu.toggle}
        className={`inline-flex h-[calc(100%-1px)] cursor-pointer items-center gap-1 rounded-md border border-transparent px-4 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
      >
        {active ? active.label : "More"}
        <ChevronDown className="size-3.5 opacity-70" />
      </button>
      {menu.open && (
        <div className="bg-card absolute top-full right-0 z-50 mt-1 min-w-[9rem] rounded-lg border p-1 shadow-md">
          {MORE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                onSelect(t.value);
                menu.close();
              }}
              className={`block w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-sm ${t.value === tab ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/60"
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const App = () => {
  const app = useApp(domusApp);
  const navigate = useNavigate();
  const location = useLocation();
  const match = useMatch("/path-debug/:id");
  const buildMatch = useMatch("/build/:roomId");
  const frameRef = useRef<HTMLDivElement>(null);

  const tab =
    TAB_ROUTES.find((r) => location.pathname.startsWith(r.prefix))?.tab ?? "game"; // "/" stays the Game Demo (the default landing)
  const scenarioId = match?.params.id;
  const roomId = buildMatch?.params.roomId;

  // Remember the last debug scenario so returning to the Path Debug tab restores it.
  const lastScenario = useRef(scenarios[0].id);
  useEffect(() => {
    if (scenarioId && scenarios.some((s) => s.id === scenarioId)) lastScenario.current = scenarioId;
  }, [scenarioId]);

  const changeTab = (next: string) =>
    navigate(
      next === "debug"
        ? `/path-debug/${lastScenario.current}`
        : (TAB_ROUTES.find((r) => r.tab === next)?.path ?? "/"),
    );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center gap-6 px-4 py-8">
      <header className="flex flex-col items-center gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Domus Regnum</h1>
      </header>

      <Tabs value={tab} onValueChange={changeTab} className="w-full">
        <TabsList className="mx-auto">
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="game">Game Demo</TabsTrigger>
          <TabsTrigger value="tea">Tea Time</TabsTrigger>
          <TabsTrigger value="build">Builder</TabsTrigger>
          <MoreMenu tab={tab} onSelect={changeTab} />
        </TabsList>

        <TabsContent value="about" className="pt-2">
          <AboutPanel />
        </TabsContent>

        <TabsContent value="tea" className="pt-2">
          <TeaDemo />
        </TabsContent>

        <TabsContent value="emote" className="pt-2">
          <CuePanel />
        </TabsContent>

        <TabsContent value="pattern" className="flex flex-col items-center gap-2 pt-2">
          <PatternBuilder />
        </TabsContent>

        <TabsContent value="aki" className="pt-2">
          <AkiPanel />
        </TabsContent>

        <TabsContent value="game" className="flex flex-col items-center gap-4 pt-2">
          <ManorDemos />
          <div ref={frameRef} className="domus-frame relative w-fit max-w-full">
            <DomusAppCanvas />
            {/* Not gated on `app`: the game constructs async, so the loader must show during that
                construction (before `app` resolves), driven by the module-level session. */}
            <CanvasLoader loading={gameLoading} />
            {app && <GameControls app={app} frameRef={frameRef} />}
            {app && <HouseStatus app={app} />}
            {app && <VnDialogue app={app} />}
          </div>
          <ControlsCard>
            <CameraControlsLegend />
            <li className="flex items-center gap-2.5">
              <Kbd>C</Kbd> Toggle camera mode{" "}
              <em className="opacity-70">(Controlled / Click &amp; Drag)</em>
            </li>
            <li className="flex items-center gap-2.5">
              <Kbd>I</Kbd> Toggle items
            </li>
            <li className="flex items-center gap-2.5">
              <Kbd>B</Kbd> Toggle the Builder Room
            </li>
            <li className="flex items-center gap-2.5">
              <Kbd>H</Kbd> Run trash-haul sim
            </li>
            <li className="flex items-center gap-2.5">
              <Kbd>T</Kbd> Run Tidy House sim
            </li>
            <li className="flex items-center gap-2.5">
              <Kbd>M</Kbd> Toggle maids <em className="opacity-70">(2D billboards / 3D models)</em>
            </li>
            <li className="flex items-center gap-2.5">
              <Kbd>V</Kbd> Play VN cutscene <em className="opacity-70">(over the live house)</em>
            </li>
            <li className="flex items-center gap-2.5">
              <Kbd>F</Kbd> Fullscreen
            </li>
          </ControlsCard>
        </TabsContent>

        <TabsContent value="build" className="flex flex-col items-center gap-2 pt-2">
          <LevelEditorPanel roomId={roomId} />
        </TabsContent>

        <TabsContent value="maids" className="flex flex-col items-center gap-2 pt-2">
          <MaidColorPanel />
        </TabsContent>

        <TabsContent value="debug" className="flex flex-col items-center gap-2 pt-2">
          <PathDebugPanel scenarioId={scenarioId} />
        </TabsContent>
      </Tabs>

      <Separator />

      <section className="flex w-full flex-col items-center gap-4">
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-medium">Concept Images</h2>
          <p className="text-muted-foreground text-sm">
            (AI generated with{" "}
            <a className="underline" target="_blank" rel="noreferrer" href="https://sora.chatgpt.com">
              Sora
            </a>
            )
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-6">
          <img
            className="w-[min(100%,460px)] rounded-lg border shadow-[var(--shadow-soft)]"
            alt="first concept"
            src="/concept-images/a.png"
          />
          <img
            className="w-[min(100%,460px)] rounded-lg border shadow-[var(--shadow-soft)]"
            alt="second concept"
            src="/concept-images/b.png"
          />
        </div>
      </section>

      <Separator />

      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Credits</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
          <span>
            Item Icons —{" "}
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href="https://cyangmou.itch.io/pixel-fantasy-rpg-icons-survival-alchemy-mining-32x32"
            >
              cyangmou.itch.io
            </a>
          </span>
          <span>
            Mascot (Aki) —{" "}
            <a className="underline" target="_blank" rel="noreferrer" href="https://shizukodesu.carrd.co/">
              ShizukoDesu
            </a>
          </span>
          <span>
            Mini mascot —{" "}
            <a className="underline" target="_blank" rel="noreferrer" href="https://www.etsy.com/shop/GloristicArt">
              GloristicArt
            </a>
          </span>
          <span>
            Textures —{" "}
            <a className="underline" target="_blank" rel="noreferrer" href="https://opengameart.org/content/lpc-interiors">
              OpenGameArt — LPC interiors
            </a>
          </span>
          <span>
            Backgrounds —{" "}
            <a className="underline" target="_blank" rel="noreferrer" href="https://spiralatlas.itch.io/victorian-backgrounds">
              Spiral Atlas
            </a>
          </span>
        </CardContent>
      </Card>

      <footer className="text-muted-foreground w-full max-w-xl pt-2 text-center text-xs leading-relaxed">
        This site uses{" "}
        <a className="underline" target="_blank" rel="noreferrer" href="https://umami.is">
          Umami
        </a>
        {" "}a privacy-friendly analytics system with no cookies, no personal data, and no cross-site tracking.{" "}
        <a className="underline" target="_blank" rel="noreferrer" href="https://umami.is/docs/faq">
          See what is collected
        </a>
        .
      </footer>
    </div>
  );
};
