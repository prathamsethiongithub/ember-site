# ember — the island

the launch site for **ember**, a minecraft launcher built differently.
full rebuild (v2): the old text-on-black skeleton is gone. this version opens with a
floating voxel island in full-viewport 3D, flies the camera through it on scroll, and
shows the real app — not mockups.

**live:** https://prathamsethiongithub.github.io/ember-site/

## what's here

| file | role |
|---|---|
| `index.html` | the page — hero island, oracle, character demo, the app, under the hood, receipts, smp |
| `styles.css` | the design system: fire-in-the-dark palette, editorial serif + Inter, glass cards |
| `scene.js` | **the island** — ~500 instanced voxel blocks, a tree, glowing ember cubes + halo sprites, real shadow map, the character (42-cube rig) who tracks your cursor, camera flight on scroll, intro assembly |
| `character.js` | the S2 live demo — the same rig, alone in his room, always tracking your cursor |
| `main.js` | scroll reveals + hero copy handoff (GSAP, scrub-only) |
| `assets/` | **real app screenshots** (captured from the actual electron build via CDP), build-rendered fallbacks |
| `scripts/sync-evidence.mjs` | deploy-time evidence: runs the launcher's test suite, injects the real numbers into #check-count / #crash-count. not green → dash stays |
| `scripts/serve.mjs` | local preview server |
| `scene-build.mjs` | renders the fallback images + captures the journey (headless Edge over CDP) |
| `verify.mjs` | the protocol: reduced-motion, no-JS, perf sweep, mobile pass |

## run

```bash
npm run serve        # → http://localhost:4173   (or open index.html — all deps vendored, file:// works)
npm run deploy       # sync evidence → commit → push (the only way to deploy)
```

## the numbers on this page

`#check-count` / `#crash-count` are read from the launcher repo **at deploy time** by
`scripts/sync-evidence.mjs` — the full unit suite must be green or the dash stays.
`evidence.json` is the receipt (date, branch, commit, values). no hardcoded numbers.

## performance (measured, this machine)

| mode | p95 | verdict |
|---|---|---|
| real GPU (headless Edge, hardware) | **16.9ms** | locked 60fps, 0 frames > 20ms |
| software rendering (swiftshader, worst case) | ~100ms | the floor — no real machine runs this |

cuts made for weight, none visible in the final render: AA off on the island canvas
(block edges don't need it), 512px shadow map, only grass/tree cast shadows, 64 embers.

## motion & fallbacks

- reduced motion → static fully-formed island + character, no tracking, no RAF
- no WebGL / no JS → build-rendered fallback images (the page never breaks)
- `file://` works — everything vendored (gsap, scrolltrigger, three r128 UMD)

## known gaps (honest)

- no bloom post-processing (r128 UMD has no EffectComposer) — the ember halos are sprite-based instead
- discord invite links are `#` placeholders pending the director
- the download button points at `github.com/prathamsethiongithub/mu-launcher` — **the repo must be made public before launch** (currently private → 404 for visitors)
