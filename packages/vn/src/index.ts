// @kitsune/vn — a web-native visual-novel engine.
//
// Public surface. The core (ast + runtime) is framework-agnostic and dependency-free; the
// Three.js compositor and React dialogue UI ship as separate, optional entry points (added later)
// so a consumer can use just the runtime, or bring their own renderer. See README.md and the
// design notes in packages/domus/docs/design/12-vn-engine.md.

export * from "./ast";
export * from "./runtime";

// DOM renderer (dependency-free; `document` is only touched inside functions, so this is safe to
// import in node). The Three.js / React render layers will ship as separate optional entry points.
export * from "./dom/actor-events";
export * from "./dom/stage";
