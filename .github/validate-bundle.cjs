// Validate a staged extension bundle before it is zipped for the Chrome Web Store.
//
// Checks that every file the manifest references actually exists in the bundle,
// that the solver module graph is complete, that no development-only files
// leaked in, and that the manifest version matches the newest changelog entry.
//
// Written as CommonJS because this repository ignores *.mjs outside local tooling.
//
// Usage: node .github/validate-bundle.cjs <bundleDir>

const { readFileSync, existsSync, readdirSync, statSync } = require("node:fs");
const { join, relative, sep, posix } = require("node:path");

const RELATIVE_IMPORT_RE = /from\s+["'](\.[^"']+\.js)(?:\?[^"']*)?["']/g;

const bundleDir = process.argv[2];
if (!bundleDir) {
  console.error("Usage: node .github/validate-bundle.cjs <bundleDir>");
  process.exit(2);
}
if (!existsSync(bundleDir)) {
  console.error(`Bundle directory not found: ${bundleDir}`);
  process.exit(2);
}

const problems = [];
const notes = [];

const toPosix = (p) => p.split(sep).join("/");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Resolve a relative import specifier against the file that contains it. */
function resolveModule(fromRel, spec) {
  const baseDir = fromRel.includes("/")
    ? fromRel.slice(0, fromRel.lastIndexOf("/"))
    : "";
  return posix.normalize(posix.join(baseDir, spec));
}

// --- Read the manifest -------------------------------------------------------
const manifestPath = join(bundleDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("manifest.json is missing from the bundle root.");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (err) {
  console.error(`manifest.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

// --- Collect every file the manifest depends on ------------------------------
const required = new Set(["manifest.json"]);

for (const value of Object.values(manifest.icons || {})) {
  if (typeof value === "string") required.add(value);
}
for (const value of Object.values((manifest.action && manifest.action.default_icon) || {})) {
  if (typeof value === "string") required.add(value);
}
if (manifest.background && manifest.background.service_worker) {
  required.add(manifest.background.service_worker);
}
if (manifest.background && manifest.background.page) {
  required.add(manifest.background.page);
}
for (const entry of manifest.content_scripts || []) {
  for (const js of entry.js || []) required.add(js);
  for (const css of entry.css || []) required.add(css);
}
for (const entry of manifest.web_accessible_resources || []) {
  for (const resource of entry.resources || []) required.add(resource);
}

const requiredList = [...required].sort();
for (const rel of requiredList) {
  if (!existsSync(join(bundleDir, rel))) {
    problems.push(`manifest references a missing file: ${rel}`);
  }
}

// --- Verify the solver module graph is complete ------------------------------
// background.js imports ./solver/solver.js, which imports the rest of the solver
// modules. A missing module only surfaces at runtime, so check it here.
if (existsSync(join(bundleDir, "background.js"))) {
  const background = readFileSync(join(bundleDir, "background.js"), "utf8");
  const seen = new Set();
  const queue = [];

  const enqueue = (rel) => {
    const normalized = posix.normalize(rel);
    if (!seen.has(normalized)) queue.push(normalized);
  };

  for (const match of background.matchAll(RELATIVE_IMPORT_RE)) {
    enqueue(resolveModule("background.js", match[1]));
  }

  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);

    const full = join(bundleDir, rel);
    if (!existsSync(full)) {
      problems.push(`module graph references a missing file: ${rel}`);
      continue;
    }
    const source = readFileSync(full, "utf8");
    for (const match of source.matchAll(RELATIVE_IMPORT_RE)) {
      enqueue(resolveModule(rel, match[1]));
    }
  }

  const missing = [...seen].filter((rel) => !existsSync(join(bundleDir, rel)));
  notes.push(
    `checked ${seen.size} solver module(s) reachable from background.js` +
      (missing.length ? ` (${missing.length} missing)` : ""),
  );
}

// --- Reject development-only files ------------------------------------------
const walked = walk(bundleDir).map((f) => toPosix(relative(bundleDir, f)));
const forbidden = [
  { test: (f) => f.endsWith(".test.mjs"), why: "test file" },
  { test: (f) => f.endsWith(".map"), why: "source map" },
  { test: (f) => /(^|\/)\.git/.test(f), why: "git metadata" },
  { test: (f) => f.startsWith("artifacts/"), why: "build artifact" },
  { test: (f) => f.startsWith("docs/") || f.startsWith("prototypes/"), why: "development docs" },
  { test: (f) => f.startsWith("benchmark-runs/"), why: "benchmark output" },
  { test: (f) => /^replay-.*\.json$/.test(f), why: "replay capture" },
  {
    test: (f) => f.startsWith("data/") && f !== "data/changelog.json",
    why: "development data file",
  },
];
for (const file of walked) {
  for (const rule of forbidden) {
    if (rule.test(file)) {
      problems.push(`development file leaked into bundle: ${file} (${rule.why})`);
    }
  }
}

// --- Version alignment ------------------------------------------------------
const changelogPath = join(bundleDir, "data", "changelog.json");
if (existsSync(changelogPath)) {
  try {
    const changelog = JSON.parse(readFileSync(changelogPath, "utf8"));
    const newest =
      (changelog.releases && changelog.releases[0] && changelog.releases[0].version) || null;
    if (newest && newest !== manifest.version) {
      problems.push(
        `manifest version ${manifest.version} does not match newest changelog entry ${newest}`,
      );
    } else if (newest) {
      notes.push(`manifest version ${manifest.version} matches the newest changelog entry`);
    }
  } catch (err) {
    problems.push(`data/changelog.json is not valid JSON: ${err.message}`);
  }
} else {
  problems.push("data/changelog.json is missing from the bundle");
}

// --- Report -----------------------------------------------------------------
const totalBytes = walked.reduce((sum, f) => {
  try {
    return sum + statSync(join(bundleDir, f)).size;
  } catch {
    return sum;
  }
}, 0);

console.log(`Bundle: ${manifest.name} v${manifest.version}`);
console.log(`Files: ${walked.length} (${(totalBytes / 1024 / 1024).toFixed(2)} MB before zip)`);
console.log(`Manifest dependencies: ${requiredList.length}`);
for (const note of notes) console.log(`  note: ${note}`);

if (problems.length) {
  console.error("\nBundle validation failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log("\nBundle validation passed.");
