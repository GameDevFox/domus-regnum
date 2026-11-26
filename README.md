# Domus Regnum

A household-sim game, in development. Play the current builds at
[domus.gamedevfox.org](https://domus.gamedevfox.org/).

| Package | What it is |
| --- | --- |
| [`packages/manor`](packages/manor) | **The game.** The 3D household sim (`demo3d.html`), plus the frozen 2D "Open House" prototype (`index.html`). |
| [`packages/domus`](packages/domus) | The first prototype — **deprecated**, kept runnable as a reference. |
| [`packages/vn`](packages/vn) | `@kitsune/vn`, a web-native visual-novel engine used by domus. |
| [`packages/common`](packages/common), [`packages/common-web`](packages/common-web) | Shared libraries, including the reactive Three.js scene lib ([docs/three-hmr.md](docs/three-hmr.md)). |

## Running

Node 24 (`.nvmrc`), Yarn 4.

```bash
yarn install                     # also builds common + common-web (postinstall)
yarn start                       # manor dev server, port 3011
yarn workspace domus start       # the old prototype, port 3003
yarn test                        # every package's tests
yarn lint                        # ESLint, from the repo root
```

## License

[AGPL-3.0-only](LICENSE).
