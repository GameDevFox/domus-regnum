import { HexColorInput, HexColorPicker } from "react-colorful";
import { createRoot } from "react-dom/client";

// The colour picker the old Color Demo used (packages/domus, `/maids`): react-colorful's square of
// shade and brightness over a bar of hues, with the colour's number to type under it and a row of
// ready colours. The rest of this page is not written in React; this is a small island of it,
// mounted where the picker is wanted and told the colour to show.

type PickerProps = { color: string; presets: string[]; onChange: (hex: string) => void };

const Picker = ({ color, presets, onChange }: PickerProps) => (
  <div className="colour-picker">
    <HexColorPicker color={color} onChange={onChange} />
    <label className="colour-number">
      <span>#</span>
      <HexColorInput color={color} onChange={onChange} aria-label="The colour's number" />
    </label>
    <div className="colour-presets">
      {presets.map((hex) => (
        <button key={hex} type="button" className={hex.toLowerCase() === color.toLowerCase() ? "colour-preset on" : "colour-preset"} style={{ backgroundColor: hex }} title={hex} aria-label={hex} onClick={() => onChange(hex)} />
      ))}
    </div>
  </div>
);

export type ColourPicker = { /** Show a colour as the one picked. */ show: (color: string) => void; unmount: () => void };

/** Put the picker in an element of the page. `onChange` is told each colour picked; the picker shows what it is told to. */
export const mountColourPicker = (host: HTMLElement, { presets, onChange }: Omit<PickerProps, "color">): ColourPicker => {
  const root = createRoot(host);
  return { show: (color) => root.render(<Picker color={color} presets={presets} onChange={onChange} />), unmount: () => root.unmount() };
};
