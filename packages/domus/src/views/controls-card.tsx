import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";

// Shared controls-legend presentation, used by both the Game Demo and Builder tabs (and available to
// any future tab). Kept in one place so every tab's "Controls" card and camera-control hints match.

// A keycap pair like "Shift + Scroll", used in the controls legends.
export const KbdCombo = ({ keys }: { keys: string[] }) => (
  <span className="flex items-center gap-1">
    {keys.map((k, i) => (
      <span key={k} className="flex items-center gap-1">
        {i > 0 && <span className="text-xs">+</span>}
        <Kbd>{k}</Kbd>
      </span>
    ))}
  </span>
);

// The shared camera-control legend — every tab uses the same Blender-style mapping, so it lives in
// one place and both the Game Demo and Builder render it identically.
export const CameraControlsLegend = () => (
  <>
    <li className="flex items-center gap-2.5">
      <Kbd>Right-drag</Kbd> Orbit camera
    </li>
    <li className="flex items-center gap-2.5">
      <KbdCombo keys={["Ctrl", "Right-drag"]} /> Pan{" "}
      <span className="opacity-70">(⌘ on Mac)</span>
    </li>
    <li className="flex items-center gap-2.5">
      <KbdCombo keys={["Shift", "Scroll"]} /> Zoom
    </li>
  </>
);

// The shared "Controls" card shell, so both tabs match.
export const ControlsCard = ({ children }: { children: React.ReactNode }) => (
  <Card className="mx-auto w-full max-w-xl">
    <CardHeader>
      <CardTitle className="text-base">Controls</CardTitle>
    </CardHeader>
    <CardContent className="text-muted-foreground text-sm">
      <ul className="flex flex-col gap-2">{children}</ul>
    </CardContent>
  </Card>
);
