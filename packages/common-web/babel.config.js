// babel.config.js — used by babel-jest to transpile TS tests (mirrors common).
module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    "@babel/preset-typescript",
  ],
};
