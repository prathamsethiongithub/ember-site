#!/usr/bin/env node
/* ============================================================
   ember-site · scripts/sync-evidence.mjs

   runs at DEPLOY time (wired into `npm run deploy`, not optional).
   reads the launcher repo's REAL test results, injects the numbers
   into index.html, and writes an evidence receipt.

   THE ONE LAW: no hardcoded numbers. a stale number is a lying chip.
   if the count cannot be read TODAY (repo unavailable, tests fail),
   the em-dash stays. honest absence beats stale data.

   usage:
     node scripts/sync-evidence.mjs
     EMBER_REPO=/path/to/mu-launcher node scripts/sync-evidence.mjs
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

/* ---------- helpers ---------- */

function sh(cmd, args, opts = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { shell: true, ...opts });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => res({ code, out, err }));
  });
}

async function repoFacts() {
  const branch = await sh("git branch --show-current", [], { cwd: REPO });
  const commit = await sh("git rev-parse --short HEAD", [], { cwd: REPO });
  return {
    branch: branch.out.trim() || "unknown",
    commit: commit.out.trim() || "unknown",
  };
}

/* ---------- read the test truth ---------- */

async function readTestTruth() {
  if (!existsSync(join(REPO, "package.json"))) {
    log(`repo not found at ${REPO} — injecting nothing (honest absence)`);
    return null;
  }
  const vitest = join(REPO, "node_modules", ".bin", "vitest");
  if (!existsSync(vitest)) {
    log("vitest not installed in the repo — injecting nothing");
    return null;
  }

  const outFile = join(mkdtempSync(join(tmpdir(), "ember-ev-")), "results.json");
  log("running the launcher's unit suite (this is the slow part)…");
  const run = await sh(`"${vitest}" run --reporter=json --outputFile="${outFile}"`, [], {
    cwd: REPO,
    timeout: 600000,
  });
  if (!existsSync(outFile)) {
    log("suite produced no JSON report — injecting nothing");
    log((run.err || run.out).slice(0, 300));
    return null;
  }

  let j;
  try {
    j = JSON.parse(readFileSync(outFile, "utf8"));
  } catch (e) {
    log("could not parse the JSON report — injecting nothing");
    return null;
  }
  rmSync(dirname(outFile), { recursive: true, force: true });

  const total = j.numTotalTests ?? 0;
  const failed = j.numFailedTests ?? 0;
  const passed = j.numPassedTests ?? 0;

  // the oracle-corpus suite: proof for the second line
  const corpusFile = (j.testResults || []).find((t) => /oracle-corpus/i.test(t.name || ""));
  const corpusPassed = !!corpusFile && corpusFile.status === "passed";

  return { total, failed, passed, corpusPassed };
}

/* ---------- corpus facts (the named-crash count) ---------- */

function readCorpusCount() {
  const manifestPath = join(REPO, "tests", "fixtures", "crash-corpus", "manifest.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    const named = (m.scenarios || []).filter(
      (s) => s.crashed === true && s.groundTruth && s.groundTruth.reason
    ).length;
    return named;
  } catch {
    return null;
  }
}

/* ---------- inject into index.html (idempotent) ---------- */

function inject(checks, namedCrashes, corpusPassed, facts) {
  let html = readFileSync(INDEX, "utf8");
  const source = `repo:${facts.commit}@${NOW.slice(0, 10)}`;

  // #check-count — number only if the whole suite ran green
  const checksVal = checks !== null ? String(checks) : "—";
  html = html.replace(
    /(<span id="check-count"[^>]*>)(.*?)(<\/span>)/s,
    `$1${checksVal}$3`
  );
  html = html.replace(
    /(<span id="check-count")[^>]*>/,
    `$1 data-source="${source}">`
  );

  // #crash-count + the misattribution claim — only if the corpus suite passed
  const crashVal = corpusPassed && namedCrashes !== null ? String(namedCrashes) : "—";
  const claim = corpusPassed ? " zero misattributions." : "";
  html = html.replace(
    /(<p class="evidence-line reveal">\[<span id="crash-count"[^>]*>)(.*?)(<\/span>\] crashes named\.)(?: zero misattributions\.)?(<\/p>)/s,
    `$1${crashVal}$3${claim}$4`
  );
  html = html.replace(
    /(<span id="crash-count")[^>]*>/,
    `$1 data-source="${source}">`
  );

  writeFileSync(INDEX, html);
  log(`injected: checks=${checksVal}  crashes=${crashVal}${claim ? " + claim" : ""}`);
}

/* ---------- main ---------- */

(async () => {
  const facts = await repoFacts();
  log(`reading ${REPO} (branch ${facts.branch}, ${facts.commit})`);

  const truth = await readTestTruth();
  const named = readCorpusCount();

  let checks = null;
  let corpusPassed = false;
  if (truth && truth.failed === 0 && truth.total > 0) {
    checks = truth.total;
    corpusPassed = truth.corpusPassed;
  } else if (truth) {
    log(`suite not green (${truth.passed}/${truth.total} passed) — injecting nothing`);
  }

  inject(checks, named, corpusPassed, facts);

  const receipt = {
    syncedAt: NOW,
    script: "scripts/sync-evidence.mjs",
    repo: REPO,
    branch: facts.branch,
    commit: facts.commit,
    checks: { value: checks, source: checks !== null ? "vitest full suite, all green" : "absent — suite unavailable or not green" },
    oracleCorpus: { passed: corpusPassed, namedCrashes: named, claim: corpusPassed ? "zero misattributions" : "claim omitted" },
    rule: "no hardcoded numbers; honest absence beats stale data",
  };
  writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  log(`receipt written: ${RECEIPT}`);
  process.exit(0); // deploy always proceeds — absence is honest, not fatal
})();
