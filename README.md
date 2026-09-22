# ember — launch site

phase 1/5 · visual skeleton. typography + scroll rhythm only.
3D, particles, real copy, dynamic data, and motion polish are reserved for later phases.

## run

no build step — pure static (rationale: a skeleton this size gains nothing from
Vite; zero tooling means the director can open it from disk, and every later
phase stays a single-file concern).

```bash
# any static server works; file:// also works (all assets are local except fonts)
cd ember-site
python -m http.server 4173     # → http://localhost:4173
```

gsap + scrolltrigger are **vendored** in `vendor/` — the site runs offline.
google fonts (instrument serif + instrument sans) load from the network with
system fallbacks (`georgia` / `segoe ui`) if unavailable.

## files

| file | role |
|---|---|
| `index.html` | all 7 sections, semantic, placeholder copy marked |
| `styles.css` | tokens, type scale, section rhythm, reduced-motion, mobile |
| `main.js` | scroll timeline skeleton (scrub), reduced-motion + no-JS guards |
| `vendor/` | gsap 3.12.5 + scrolltrigger 3.12.5 (local) |

## interface reservation points (phases 2–5)

| phase | mount point | contract |
|---|---|---|
| ~~2 · 3D materialization~~ | ~~`#s1 .materialize-frame`~~ | ✅ **shipped** — dust converges into the wordmark on scroll; canvas mounts inside the frame; main.js keeps the only pin. |
| 3 · oracle output | `#s2 .beat` blocks | replace `.beat-line` placeholder copy; structure (number/title/line) is fixed. |
| 5 · evidence data | `#s3 #check-count` | inject the repository's REAL test count at build time. hardcoding is forbidden; the em dash `—` is the honest unknown state. |
| 4 · motion polish | `main.js` | the scrub grammar is final; phase 4 may add atmosphere only where it serves the narrative. |

## phase 2 notes (the materialize — coal ignition, rework 1)

the first implementation (particle text converging) was rejected — "dots spelling a word" is not fire. rebuilt as **coal ignition**:

- **no WebGL at all** — three.js deleted. the word is HTML type; scroll drives one CSS scalar (`--p`) across the pin range. pure DOM/CSS + 6-10 rising ember elements.
- **the journey** (`materialize.js` + styles): p=0 faint warm blur (heat shimmer, barely a word) → p=.5 frosted-glass suggestion → p=1 crisp warm-white core with a temperature-laddered glow and ambient radial spill, breathing at ~3.6s.
- **three layers**: ambient bloom (radial spill, breathing) / glow (blurred amber type, amber→deep-orange→dark shadow ladder) / crisp core (warm white, rock-steady — crispness comes from the core out-reading the halo).
- **rising embers**: spawn from the word's body, drift up with horizontal wander, fade; rate peaks mid-formation (`sin(π·p)`), settles at rest; ≤10 alive.
- reduced motion → no embers, static resolved word. no JS → `--p` defaults to 1, word renders resolved.
- `file://` safe — no modules, no GL, no network.

## phase 3 notes (real copy — every word provable)

all placeholder copy replaced with system truth. claims audit lives in the phase-3 delivery report; every line traces to the launcher repo:

- beat copy sourced from master's actual code (`crash-diagnostic.ts`, `PlayerDirector.ts`, `mod-data.ts`, `modpack-installer.ts`, `server-injector.ts`)
- oracle evidence block = the real corpus record (`tests/fixtures/crash-corpus/corrupt-jar.txt` + manifest groundTruth)
- recovery beat honestly says **"coming with v1"** — the repair loop (`b5d1fc7`) is NOT merged to master (verified via `git merge-base --is-ancestor`)
- S3 keeps em-dash mounts (`#check-count`, `#crash-count`) — phase 5 wires real numbers; hardcoding is forbidden
- SMP name + meta from `server-injector.ts` ("Masters' Union SMP", injected into servers.dat at launch)
- mono is the site's third face (exemption, documented): micro-labels + evidence only
- TODO for the director: discord invite links (2 places), and the repo must be made PUBLIC before launch — the download button points at `github.com/prathamsethiongithub/mu-launcher`, which is currently private (404 for visitors)

## phase 4 notes (motion polish — refine, don't add)

no new sections, effects, or claims. every change is a refinement of existing motion:

- **S0**: "come closer." breathes (opacity 0.88↔0.93, 3s, CSS-only). nothing else in S0 has idle motion — verified.
- **S1**: unchanged visually (re-verified warm at 25/50/75/100%). the spark rAF loop now runs ONLY while S1 is on screen (IntersectionObserver) and pauses in a hidden tab — the perf receipt.
- **S2**: beats share one entrance family (number → title → line, internal stagger), the evidence block settles in LAST as the heaviest element of the procession (y 14, no flourish).
- **S5**: the signature lands in three beats — `designed.` (y 22) → `engineered.` (y 30) → `shipped.` (y 40, the longest settle window). the third lands hardest.
- **mobile**: evidence at 12px + hanging indent (terminal wrap reads as subordinate); builder type bumped to `clamp(2.4rem, 11vw, 3.4rem)` so the signature carries desktop weight at 390px.

### the cut list (performance receipt)

measured first, then cut: full-page scroll sweep, rAF frame times — **p95 16.8ms, max 16.8ms, 0 of 147 frames over 20ms** (software rendering, the worst case). no frame drops found, so no narrative animation was sacrificed. the one cut made was invisible and preventive:

1. **spark rAF loop gated** — previously ran forever from page load; now only while S1 is in the viewport, paused on `visibilitychange`. zero narrative cost.

## the deploy ritual (this is the law)

**the site never maintains its own truth. it reads the repo at deploy time.**

```bash
npm run deploy        # THE ONLY WAY TO DEPLOY
```

`npm run deploy` runs, in order:
1. `scripts/sync-evidence.mjs` — reads the launcher repo, runs the **full unit suite** (`vitest run --reporter=json`), and injects:
   - `#check-count` ← the real total, **only if the suite is green** (currently read: see `evidence.json`)
   - `#crash-count` + the "zero misattributions" claim ← only if the **oracle-corpus suite passes** and the manifest carries ground truth
   - if either cannot be proven TODAY → the em-dash stays. honest absence beats stale data.
2. `git add/commit/push` — GitHub Pages rebuilds from the pushed tree.

`evidence.json` is the receipt: date, repo path, branch, commit, both numbers, and which claims shipped. it is committed with every deploy — the deployed site's numbers are auditable against it.

the sync reads the **working tree at `EMBER_REPO`** (default: the desktop checkout). deploy when that checkout is on the branch you intend to represent publicly.

### deploy target: GitHub Pages — why

zero accounts, zero cost, zero CI config, and the repo we're already reading (and already have `gh` auth for) becomes the host. a static site with no runtime fetches has nothing Vercel's edge could improve; Pages gives us the custom 404, canonical URL, and HTTPS for free. if the site ever grows a server component, revisit.

### files

- `404.html` — "nothing here. still burning somewhere else." (GitHub Pages serves this automatically)
- `favicon.svg` — the whole brand in 16px: one ember dot on `#070608`
- `evidence.json` — the deploy receipt (auditable)

## phase 6 notes (the spectacle — the 3D character)

S1 replaced: the coal-ignition text is gone; a real WebGL scene stands there now.

- **the rig**: 42 cubes, Minecraft proportions, generated in code (no model files). torso 12 · arms 6 · legs 6 · head 8 · hat 6 (face open) · eyes 2.
- **formation**: scroll-scrubbed — torso (0.10–0.45) → limbs (0.30–0.70) → head (0.60–0.95). deterministic scatter (seeded). cubes fly with a **near-black albedo + saturated ember emission** that quench into their real colors as they lock — fire settling into flesh. (ACES desaturates saturated emissives; dark albedo is what makes an ember read as an ember. measured at 50%: 19,753 orange pixels = 43% of the lit frame.)
- **idle**: breathing (torso ±1.5%, 3s) + head cursor-tracking (damped, ±15° yaw / ±10° pitch) — the PlayerDirector moment, web edition.
- **lighting**: amber point key with real distance falloff (r128 quirk: `distance:0` disables attenuation — it was acting as a 16× directional until fixed) + cool fill + rim + a warm additive ground pool. measured vertical luminance gradient: 318 → 408 (chest) → 246 (feet).
- **camera**: scroll-synced dolly (z 8.6 → 3.7). portrait framing widens fov.
- **fallback**: `assets/character-fallback.png` rendered at build time by `scene-build.mjs` (frozen scene, page-coordinate clip). no WebGL / no JS → the image shows; the page never breaks.
- **reduced motion** → one static fully-formed frame, no tracking, no RAF.
- **subordinate depth**: S2 eyebrow/numbers drift at ~0.9× scroll; S4 carries 4 dim ember-cubes (<15% opacity) — the fire follows you down.

### amber budget (updated by phase 6, legal at 4)

1. download button · 2. **S1 scene** (ember cubes + key light + ground pool — one location) · 3. S3 number · 4. "still burning."

### the cut list (performance receipt)

full-page scroll sweep with the live scene: **p95 16.8ms, max 16.8ms, 0 of 149 frames over 20ms** (software rendering, worst case). nothing had to be cut. held in reserve, unused: mobile cube-count reduction, spark-loop gating (already in place from phase 4).

**known gap (honest):** no bloom — the vendored r128 UMD build has no EffectComposer; emissive glow reads as color, not halo. a future phase could vendor the postprocessing addons.

## design laws (inherited from the launcher's EMBER system)

- one accent (`#C88735`) — used in exactly 4 locations (see below); never decorative
- near-black ground `#070608`, two grays, no third hue
- lowercase honest copy; unknown values render as `—`, never simulated data
- hairlines, not boxes; boxes are for interaction only
- motion is grammar: scrub only, three durations elsewhere, one easing
- `prefers-reduced-motion: reduce` → fully static, layout intact
- no JS → everything visible (hidden states are gated behind `html.js`)

## amber locations (all four at rest, exhaustive)

1. `download` button (hero) — the only filled element on the site
2. **S1 rising embers** — the only amber in the ignition at rest; the word itself resolves to warm WHITE (budget call, stated)
3. `#check-count` number (S3 evidence)
4. `still burning.` (footer word)

(during the ignition journey the blurred glow is amber — that's the narrative itself, not a resting accent; the coal cools to warm white as it resolves. footer link hover resolves to full ink.)

## verification checklist (phases 1–2 rework acceptance)

- [x] zero console errors (verified headless, both motion modes)
- [x] desktop + mobile layouts (1440 / 390 verified)
- [x] reduced-motion → static resolved word, no embers, layout intact
- [x] ignition journey screenshots at 25 / 50 / 75 / 100% (`ember-ign-*.png`)
- [x] "ember" crisp + ambient spill at 100% — reads as lit coal, not pasted text
- [x] no WebGL anywhere — three.js deleted, dependency surface reduced
- [ ] director's review: "does this feel like approaching a fire in the dark?"
