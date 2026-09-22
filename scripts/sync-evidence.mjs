#!/usr/bin/env node
/* ============================================================
   ember-site · scripts/sync-evidence.mjs (v2)
   deploy-time evidence: read the launcher repo's REAL test results,
   inject into #check-count / #crash-count. no green suite => no number.
   honest absence beats stale data.
   ============================================================ */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const SITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = join(SITE_ROOT, "index.html");
const RECEIPT = join(SITE_ROOT, "evidence.json");
const DEFAULT_REPO =
  "C:/Users/fortn/Desktop/check this ai agents this desktop folder is for you outside of this are my games/mu-launcher";
const REPO = process.env.EMBER_REPO || DEFAULT_REPO;
const NOW = new Date().toISOString();
const log = (...a) => console.log("[sync-evidence]", ...a);

function sh(cmd, args, opts = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { shell: true, ...opts });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => res({ code, out, err }));
  });
}

(async () => {
  let branch = "unknown", commit = "unknown", checks = null, named = null, corpusPassed = false;

  if (existsSync(join(REPO, "package.json"))) {
    const b = await sh("git branch --show-current", [], { cwd: REPO });
    const c = await sh("git rev-parse --short HEAD", [], { cwd: REPO });
    branch = b.out.trim() || branch;
    commit = c.out.trim() || commit;
    log(`reading ${REPO} (${branch}, ${commit})`);

    const vitest = join(REPO, "node_modules", ".bin", "vitest");
    if (existsSync(vitest)) {
      const outFile = join(mkdtempSync(join(tmpdir(), "ember-ev-")), "r.json");
      log("running the unit suite…");
      await sh(`"${vitest}" run --reporter=json --outputFile="${outFile}"`, [], { cwd: REPO, timeout: 600000 });
      if (existsSync(outFile)) {
        try {
          const j = JSON.parse(readFileSync(outFile, "utf8"));
          if ((j.numFailedTests ?? 1) === 0 && (j.numTotalTests ?? 0) > 0) {
            checks = j.numTotalTests;
            const corpus = (j.testResults || []).find((t) => /oracle-corpus/i.test(t.name || ""));
            corpusPassed = !!corpus && corpus.status === "passed";
          } else {
            log(`suite not green (${j.numPassedTests}/${j.numTotalTests}) — injecting nothing`);
          }
        } catch { log("could not parse report — injecting nothing"); }
        rmSync(dirname(outFile), { recursive: true, force: true });
      }
    }

    const mPath = join(REPO, "tests", "fixtures", "crash-corpus", "manifest.json");
    if (corpusPassed && existsSync(mPath)) {
      try {
        const m = JSON.parse(readFileSync(mPath, "utf8"));
        named = (m.scenarios || []).filter((s) => s.crashed === true && s.groundTruth && s.groundTruth.reason).length;
      } catch {}
    }
  } else {
    log(`repo not found at ${REPO} — injecting nothing`);
  }

  let html = readFileSync(INDEX, "utf8");
  const source = `repo:${commit}@${NOW.slice(0, 10)}`;
  html = html.replace(/(<span class="stat-num" id="check-count")[^>]*>.*?(<\/span>)/s,
    `$1 data-source="${source}">${checks !== null ? checks : "—"}$2`);
  html = html.replace(/(<span class="stat-num" id="crash-count")[^>]*>.*?(<\/span>)/s,
    `$1 data-source="${source}">${corpusPassed && named !== null ? named : "—"}$2`);
  writeFileSync(INDEX, html);
  log(`injected: checks=${checks ?? "—"} crashes=${corpusPassed && named !== null ? named : "—"}`);

  writeFileSync(RECEIPT, JSON.stringify({
    syncedAt: NOW, script: "scripts/sync-evidence.mjs", repo: REPO, branch, commit,
    checks: { value: checks, source: checks !== null ? "vitest full suite, green" : "absent" },
    oracleCorpus: { passed: corpusPassed, namedCrashes: named },
    rule: "no hardcoded numbers; honest absence beats stale data",
  }, null, 2) + "\n");
  log("receipt written");
  process.exit(0);
})();
