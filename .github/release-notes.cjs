// Generate GitHub release notes for the current extension version.
//
// Primary source is the curated entry in data/changelog.json, since that is what
// users see in the extension itself. Commits since the previous release are added
// as supporting detail so nothing shipped silently.
//
// Written as CommonJS because this repository ignores *.mjs outside local tooling.
//
// Usage:
//   node .github/release-notes.cjs --repo <owner/name> --out <file> [--prev-tag <tag>] [--commits <file>]
//
// Reads the version from manifest.json and its matching changelog entry.
// --prev-tag is the previous release tag as resolved from git. It is only passed
// when a previous release tag really exists, so the commit range and compare link
// are never emitted for the first release.

const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

function readFlag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

const repoRoot = process.cwd();
const repoSlug = readFlag("repo") || "";
const outPath = readFlag("out");
const commitsPath = readFlag("commits");
const previousTag = readFlag("prev-tag");

const manifest = JSON.parse(readFileSync(join(repoRoot, "manifest.json"), "utf8"));
const version = manifest.version;
const tag = `v${version}`;

let entry = null;
try {
  const changelog = JSON.parse(readFileSync(join(repoRoot, "data", "changelog.json"), "utf8"));
  const releases = Array.isArray(changelog.releases) ? changelog.releases : [];
  entry = releases.find((r) => r && String(r.version) === String(version)) || null;
} catch {
  entry = null;
}

const lines = [];

// --- Header -----------------------------------------------------------------
lines.push(`## AutopilotSBC FC27 ${tag}`);
lines.push("");

if (entry) {
  if (entry.headline) {
    lines.push(`**${String(entry.headline).trim()}**`);
    lines.push("");
  }
  if (entry.summary) {
    lines.push(String(entry.summary).trim());
    lines.push("");
  }
  const details = Array.isArray(entry.details) ? entry.details.filter(Boolean) : [];
  if (details.length) {
    lines.push("### What's new");
    lines.push("");
    for (const detail of details) lines.push(`- ${String(detail).trim()}`);
    lines.push("");
  }
} else {
  // No curated entry: fall back to the commit list so the release is still useful.
  lines.push(`_No changelog entry found for version ${version}._`);
  lines.push("");
}

// --- Install ----------------------------------------------------------------
lines.push("### Install");
lines.push("");
lines.push(
  "- Install or update from the [Chrome Web Store](https://chromewebstore.google.com/detail/autopilotsbc-fc26-sbc-sol/gkcjhdebgfhdbkecahbnpmcaobapcfbh?hl=en).",
);
lines.push(
  `- Or download \`autopilotsbc-fc27-${tag}.zip\` below and load it unpacked via \`chrome://extensions\`.`,
);
lines.push("");

// --- Commits since the previous release -------------------------------------
let commitLines = [];
if (commitsPath && existsSync(commitsPath)) {
  commitLines = readFileSync(commitsPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

if (commitLines.length && previousTag) {
  lines.push(`<details>`);
  lines.push(`<summary>Commits since ${previousTag} (${commitLines.length})</summary>`);
  lines.push("");
  for (const line of commitLines) lines.push(`- ${line}`);
  lines.push("");
  lines.push(`</details>`);
  lines.push("");
}

// --- Compare link -----------------------------------------------------------
if (repoSlug && previousTag) {
  lines.push(
    `**Full changelog:** https://github.com/${repoSlug}/compare/${previousTag}...${tag}`,
  );
  lines.push("");
}

const body = lines.join("\n").trimEnd() + "\n";

if (outPath) writeFileSync(outPath, body);
else process.stdout.write(body);

// Helpful for the workflow log.
console.error(
  `release-notes: version=${version} curated=${entry ? "yes" : "no"} prevTag=${previousTag || "none"} commits=${commitLines.length}`,
);
