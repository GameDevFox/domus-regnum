// The one helper every part of the page is built with: an element of a kind, with its class and, if it has any, its words.
// (It is here, and not with any one part of the page, so that two parts that each use the other's pieces do not have to load one another first.)
/** A control's name and its tooltip, in the same words. */
export const named = (control: HTMLElement, words: string): void => {
  control.title = words;
  control.setAttribute("aria-label", words);
};

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
