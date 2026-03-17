# LinkedIn Grabber

Chrome extension that collects open LinkedIn profile tabs and copies a bullet list with clickable profile links for pasting into Google Docs.

## Install from GitHub (for users)

1. Go to the repository page on GitHub.
2. Download a release ZIP from the `dist/` artifact committed in the repo or from GitHub Releases (for example: `linkedin-grabber-v1.0.1.zip`).
3. Unzip it locally.
4. Open Chrome and go to `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the extracted folder that contains `manifest.json` (for example `linkedin-grabber-v1.0.1/`).

## Create a new versioned ZIP (for maintainers)

The project includes a Yarn action that auto-increments the extension version and builds a versioned ZIP.

```bash
yarn install
yarn release:zip
```

What this does:

1. Bumps `manifest.json` version automatically (patch bump by default).
2. Syncs `package.json` version to match.
3. Creates a versioned folder in `dist/` containing extension files.
4. Creates `dist/linkedin-grabber-vX.Y.Z.zip`.

Optional bump type:

```bash
yarn release:zip minor
yarn release:zip major
```

After generating a new ZIP, commit the version changes and publish/upload the ZIP so users can download and install it with **Load unpacked** after extraction.
