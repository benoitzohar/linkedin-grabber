# LinkedIn Grabber

Chrome extension that collects open LinkedIn profile tabs and copies a bullet list with clickable profile links for pasting into Google Docs.

<!-- latest-zip-link:start -->
**Latest ZIP:** [linkedin-grabber-v1.0.3.zip](https://github.com/benoitzohar/linkedin-grabber/raw/refs/heads/main/dist/linkedin-grabber-v1.0.3.zip)
<!-- latest-zip-link:end -->

## Install from GitHub (for users)

1. Go to the repository page on GitHub.
2. Click the **Latest ZIP** link above to download directly from GitHub (or use GitHub Releases).
3. Unzip it locally.
4. Open Chrome and go to `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the extracted folder that contains `manifest.json` (for example `linkedin-grabber-v1.0.1/`).

## Create a new versioned ZIP (for maintainers)

The project includes a Yarn action that auto-increments the extension version and builds a versioned ZIP.

```bash
yarn install
yarn release
```

What this does:

1. Bumps `manifest.json` version automatically (patch bump by default).
2. Syncs `package.json` version to match.
3. Creates `dist/linkedin-grabber-vX.Y.Z.zip`.
4. Removes the temporary staging folder, so only the ZIP remains in `dist/`.

Optional bump type:

```bash
yarn release minor
yarn release major
```

After generating a new ZIP, commit the version changes and publish/upload the ZIP so users can download and install it with **Load unpacked** after extraction.
