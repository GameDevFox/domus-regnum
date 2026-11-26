import { useEffect, useState } from "react";

// A number/text field that edits locally and commits on blur or Enter — so typing doesn't spam
// the undo stack with one history entry per keystroke. Shared by the node inspector and the
// canvas nodes' inline fields (pass className="nodrag …" there so editing doesn't drag the node).
export const LiteralField = ({
  type,
  value,
  onCommit,
  className,
  ariaLabel,
  title,
}: {
  type: "number" | "string";
  value: string;
  onCommit: (raw: string) => void;
  className?: string;
  ariaLabel?: string;
  title?: string; // hover tooltip (e.g. which half of a measure pair this is)
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]); // outside edits (undo, other fields) refresh the draft
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      type={type === "number" ? "number" : "text"}
      className={`border-input bg-background rounded border px-2 py-0.5 text-xs ${className ?? "w-24"}`}
      value={draft}
      aria-label={ariaLabel}
      title={title}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
};
