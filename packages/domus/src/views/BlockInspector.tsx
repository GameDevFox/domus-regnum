import { useValue } from "@kitsune/common-web/src/react";

import { Button } from "@/components/ui/button";

import { paramValue, propertiesFor, VIEW_SIDE } from "../blocks/properties";
import { EditorApp } from "../domus-app/level-editor";

import { LiteralField } from "./LiteralField";

// The Builder property inspector: type-specific, editable properties for the selected block. Reads
// the selected placement's kind, looks up its schema (blocks/properties.ts), and renders a control
// per field. Editing writes back through `app.setSelectedParam` (storing a value at its default as
// "omitted", so data stays minimal). Renders nothing when there's no selection or the kind has no
// editable properties. `enum` and `number` widgets render today; the rest land when needed.
export const BlockInspector = ({ app }: { app: EditorApp }) => {
  const selected = useValue(app.selected);
  const manual = useValue(app.manual); // selection indices point into the manual (hand-placed) list

  const placement = selected != null ? manual[selected] : undefined;
  if (!placement) return null;
  const schema = propertiesFor(placement.block);
  if (schema.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground text-xs font-medium capitalize">
        {placement.block} properties
      </div>
      {schema.map((field) => {
        const current = paramValue(placement.params, field);
        if (field.type === "number")
          return (
            <div key={field.key} className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 shrink-0 text-xs">{field.label}</span>
              <LiteralField
                type="number"
                value={String(current)}
                ariaLabel={field.label}
                className="w-16"
                onCommit={(raw) => {
                  const v = Number(raw);
                  if (!Number.isFinite(v)) return;
                  const clamped = Math.min(
                    field.max ?? Infinity,
                    Math.max(field.min ?? -Infinity, v),
                  );
                  app.setSelectedParam(field.key, clamped === field.default ? undefined : clamped);
                }}
              />
            </div>
          );
        if (field.type !== "enum") return null; // boolean/color widgets land when a kind needs them
        return (
          <div key={field.key} className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0 text-xs">{field.label}</span>
            <div className="flex items-center gap-1">
              {field.options.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={opt.value === current ? "default" : "secondary"}
                  onClick={() =>
                    app.setSelectedParam(
                      field.key,
                      opt.value === field.default ? undefined : opt.value,
                    )
                  }
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {field.key === VIEW_SIDE && (
              <span className="text-muted-foreground text-xs opacity-70">
                Front = the side the block faces (flips when you rotate it with R)
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
