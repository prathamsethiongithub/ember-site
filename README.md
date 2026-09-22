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

## the real skin (the launcher's own mechanic)

the character is not flat colours — it's **the actual Minecraft skin**, rendered the
way the launcher renders it: a proper 64×64 skin texture mapped onto per-face UV
regions (head/body/arms/legs × 6 faces each), **including the overlay layer**
(hat / jacket / sleeves / pants).

- `skinchar.js` — the builder: `window.buildSkinCharacter()` → `{ root, groups, ready }`
- the skin is **gigamegachad's own**, fetched from Mojang and embedded as a data URL
  in `assets/skin-data.js` (base64) so it renders from `file://` too — an http texture
  would taint the WebGL canvas there
- `render-character-fallback.html` + `test-skin.html` — isolated renderers used to
  build the fallback image and to verify UV mapping on a plain background
- to re-skin: replace `assets/skin-data.js` (or pass `textureUrl` to the builder)

## brand assets (the real ones)

- `assets/brand/logo-full.png` — the amber ribbon-S mark (transparent) — topbar, footer
- `assets/brand/favicon-256.png` — the mark squared (1:1, 12% padding) for the favicon
- `assets/brand/intro.mp4` — **the launcher's own splash video**, now the site's intro veil
  (plays once per session, lifts on end / click / scroll / 3.4s; skipped entirely under reduced motion).
  the source video's `seedance.io` watermark was **cropped out for real** (ffmpeg `crop=496:496:167:0`)
  and the result is **1:1 (496x496)**; the untouched original is kept as `intro-original.mp4`
- `assets/brand/logo-reveal.mp4` — the lighting reveal, held in reserve
- `assets/brand/*.svg` — **the launcher's cursor set**, wired as the site's cursors:
  main → default, hand → links/buttons, type → text (viewBox + 32px added for CSS use)
- `test-skin.html` · `render-character-fallback.html` · `viewer.html` — isolated asset/skin test pages

## known gaps (honest)

- no bloom post-processing (r128 UMD has no EffectComposer) — the ember halos are sprite-based instead
- discord invite links are `#` placeholders pending the director
- the download button points at `github.com/prathamsethiongithub/mu-launcher` — **the repo must be made public before launch** (currently private → 404 for visitors)
