import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const DIST_DIR = resolve(REPO_ROOT, "dist");
const MANIFEST_PATH = resolve(REPO_ROOT, "manifest.json");
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json");
const README_PATH = resolve(REPO_ROOT, "README.md");
const BUMP_TYPE = (process.argv[2] || "patch").toLowerCase();

const EXTENSION_ITEMS = ["manifest.json", "popup", "lib", "icons"];
const OPTIONAL_ITEMS = ["README.md"];
const README_LATEST_ZIP_START = "<!-- latest-zip-link:start -->";
const README_LATEST_ZIP_END = "<!-- latest-zip-link:end -->";

const VALID_BUMP_TYPES = new Set(["major", "minor", "patch"]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseVersion(version) {
  const match = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid semver version "${version}". Expected format: x.y.z`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function bumpVersion(version, type) {
  const parsed = parseVersion(version);
  if (type === "major") {
    return `${parsed.major + 1}.0.0`;
  }
  if (type === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function ensureZipAvailable() {
  try {
    execFileSync("zip", ["-v"], { stdio: "ignore" });
  } catch (_error) {
    throw new Error('The "zip" command is required but was not found on PATH.');
  }
}

function copyItemIntoStaging(item, stagingDir) {
  const sourcePath = resolve(REPO_ROOT, item);
  if (!existsSync(sourcePath)) {
    return;
  }
  const targetPath = resolve(stagingDir, item);
  cpSync(sourcePath, targetPath, { recursive: true });
}

function updateReadmeLatestZipLink(releaseFolderName) {
  if (!existsSync(README_PATH)) {
    return;
  }

  const currentReadme = readFileSync(README_PATH, "utf8");
  const latestZipBlock = [
    README_LATEST_ZIP_START,
    `**Latest ZIP:** [${releaseFolderName}.zip](./dist/${releaseFolderName}.zip)`,
    README_LATEST_ZIP_END
  ].join("\n");

  const markerPattern = new RegExp(
    `${README_LATEST_ZIP_START}[\\s\\S]*?${README_LATEST_ZIP_END}`
  );

  let nextReadme;
  if (markerPattern.test(currentReadme)) {
    nextReadme = currentReadme.replace(markerPattern, latestZipBlock);
  } else {
    const installHeading = "## Install from GitHub (for users)";
    if (currentReadme.includes(installHeading)) {
      nextReadme = currentReadme.replace(
        installHeading,
        `${latestZipBlock}\n\n${installHeading}`
      );
    } else {
      nextReadme = `${currentReadme.trimEnd()}\n\n${latestZipBlock}\n`;
    }
  }

  if (nextReadme !== currentReadme) {
    writeFileSync(README_PATH, nextReadme, "utf8");
  }
}

function run() {
  if (!VALID_BUMP_TYPES.has(BUMP_TYPE)) {
    throw new Error(
      `Invalid bump type "${BUMP_TYPE}". Use one of: major, minor, patch`
    );
  }

  const manifest = readJson(MANIFEST_PATH);
  const packageJson = readJson(PACKAGE_JSON_PATH);
  const currentVersion = manifest.version;
  const nextVersion = bumpVersion(currentVersion, BUMP_TYPE);

  manifest.version = nextVersion;
  packageJson.version = nextVersion;
  writeJson(MANIFEST_PATH, manifest);
  writeJson(PACKAGE_JSON_PATH, packageJson);

  ensureZipAvailable();
  mkdirSync(DIST_DIR, { recursive: true });

  const releaseFolderName = `linkedin-grabber-v${nextVersion}`;
  const stagingDir = resolve(DIST_DIR, releaseFolderName);
  const zipPath = resolve(DIST_DIR, `${releaseFolderName}.zip`);

  updateReadmeLatestZipLink(releaseFolderName);

  rmSync(stagingDir, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  mkdirSync(stagingDir, { recursive: true });

  for (const item of EXTENSION_ITEMS) {
    copyItemIntoStaging(item, stagingDir);
  }

  for (const item of OPTIONAL_ITEMS) {
    copyItemIntoStaging(item, stagingDir);
  }

  try {
    execFileSync("zip", ["-r", zipPath, releaseFolderName], {
      cwd: DIST_DIR,
      stdio: "inherit"
    });
  } finally {
    // Keep dist clean: ZIP is the artifact, staging folder is temporary.
    rmSync(stagingDir, { recursive: true, force: true });
  }

  console.log("");
  console.log(`Version bumped: ${currentVersion} -> ${nextVersion}`);
  console.log(`ZIP created: ${zipPath}`);
}

run();
