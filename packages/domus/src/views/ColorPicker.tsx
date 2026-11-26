import { HexColorInput, HexColorPicker } from "react-colorful";

import { useClickOutside } from "./use-click-outside";
import { useTogglePanel } from "./use-toggle-panel";

// A swatch button that opens a popover picker (saturation/hue + hex field + preset grid). Modeled on
// the kitsune-os ColorPicker, ported from react-color/Chakra to react-colorful/Tailwind — react-color
// relies on findDOMNode and breaks on React 19. Works in hex strings to match the recolor core.
type Props = {
  color: string;
  onChange: (hex: string) => void;
  presets?: string[];
};

export const ColorPicker = ({ color, onChange, presets = [] }: Props) => {
  const picker = useTogglePanel();
  const ref = useClickOutside<HTMLDivElement>(picker.open, picker.close);

  return (
    <div ref={ref} className="relative w-fit">
      <button
        type="button"
        onClick={picker.toggle}
        className="h-10 w-16 cursor-pointer rounded-md border shadow-[var(--shadow-soft)]"
        style={{ backgroundColor: color }}
        aria-label="Pick color"
      />

      {picker.open && (
        <div
          role="dialog"
          aria-label="Color picker"
          className="bg-popover absolute top-12 left-0 z-20 flex flex-col gap-3 rounded-lg border p-3 shadow-[var(--shadow-soft)]"
        >
          <HexColorPicker color={color} onChange={onChange} />

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">#</span>
            <HexColorInput
              color={color}
              onChange={onChange}
              className="bg-muted w-24 rounded px-2 py-1 text-sm uppercase tabular-nums outline-none"
            />
          </div>

          {presets.length > 0 && (
            <div className="grid grid-cols-8 gap-1.5">
              {presets.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onChange(hex)}
                  title={hex}
                  aria-label={hex}
                  className={`h-5 w-5 rounded border transition-transform hover:scale-110 ${
                    color.toLowerCase() === hex.toLowerCase()
                      ? "ring-foreground ring-2 ring-offset-1"
                      : ""
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
