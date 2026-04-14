# Local PDF Manager for Zotero

[![CI](https://github.com/WeiCheng14159/local-pdf-manager-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/WeiCheng14159/local-pdf-manager-plugin/actions/workflows/ci.yml)
[![Release](https://github.com/WeiCheng14159/local-pdf-manager-plugin/actions/workflows/release.yml/badge.svg)](https://github.com/WeiCheng14159/local-pdf-manager-plugin/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Zotero 7](https://img.shields.io/badge/Zotero-7-green.svg)](https://www.zotero.org/)
[![Version](https://img.shields.io/badge/version-0.1.0-orange.svg)](https://github.com/WeiCheng14159/local-pdf-manager-plugin/releases)

A Zotero plugin that lets you batch download or remove local PDF copies for items in your library — without losing any bibliographic metadata.

## Features

- **Download PDFs** for selected items or your entire library in one click
- **Remove local copies** to reclaim disk space while keeping metadata and cloud sync intact
- **Progress tracking** with real-time feedback (item count and total file size)
- **Safe batch operations** — failures on individual items are logged but do not block the rest
- **Localization** — English (`en-US`) and Simplified Chinese (`zh-CN`) supported

## Installation

1. Download the latest `.xpi` file from the [Releases](https://github.com/WeiCheng14159/local-pdf-manager-plugin/releases) page.
2. In Zotero, go to **Tools → Add-ons**.
3. Click the gear icon and choose **Install Add-on From File…**
4. Select the downloaded `.xpi` file.

**Compatibility:** Zotero 7+ (6.999 – 8.\*)

## Usage

### Download PDFs

| Action                               | How                                           |
| ------------------------------------ | --------------------------------------------- |
| Download PDFs for selected items     | Right-click selected items → **Download PDF** |
| Download PDFs for the entire library | **Tools → Download All PDFs in Library**      |

When triggered, the plugin searches for items without a local PDF attachment and attempts to download one using Zotero's built-in PDF resolver. A progress window shows `Downloading PDFs: X/Y (size)` as each item completes.

### Remove Local PDFs

| Action                                 | How                                                |
| -------------------------------------- | -------------------------------------------------- |
| Remove local copies for selected items | Right-click selected items → **Remove Local PDFs** |
| Remove all local copies in the library | **Tools → Remove All Local PDFs in Library**       |

Removing a local copy deletes the PDF file from disk but leaves the Zotero record and all metadata (title, authors, DOI, etc.) untouched. The completion dialog reports total disk space freed.

> **Tip:** This is useful before switching to Zotero cloud sync — strip local copies first, then let Zotero re-download them on demand.

## Development

### Prerequisites

- Node.js 18+
- A local Zotero 7 installation (for live testing)

### Setup

```bash
git clone https://github.com/WeiCheng14159/local-pdf-manager-plugin.git
cd local-pdf-manager-plugin
npm install
cp .env.example .env   # configure your local Zotero profile path
```

### Commands

| Command              | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `npm start`          | Start dev server with hot reload                     |
| `npm run build`      | Production build (outputs XPI to `.scaffold/build/`) |
| `npm test`           | Run tests                                            |
| `npm run lint:check` | Check formatting and linting                         |
| `npm run lint:fix`   | Auto-fix formatting and linting issues               |
| `npm run release`    | Bump version, build, and publish a GitHub release    |

### Project Structure

```
src/
├── index.ts          # Plugin entry point
├── addon.ts          # Addon base class
├── hooks.ts          # Lifecycle hooks and all core functionality
├── modules/
│   └── preferenceScript.ts
└── utils/
    ├── locale.ts     # i18n helpers
    ├── prefs.ts      # Preference helpers
    └── ztoolkit.ts   # Toolkit initialization

addon/
├── bootstrap.js      # Firefox extension lifecycle handler
├── manifest.json     # Plugin manifest
├── locale/
│   ├── en-US/        # English strings
│   └── zh-CN/        # Simplified Chinese strings
└── content/
    └── preferences.xhtml
```

## CI/CD

This project uses GitHub Actions for automated quality checks and releases.

### Continuous Integration (`ci.yml`)

Runs on every push and pull request to `main`:

- **lint** — Prettier + ESLint checks
- **build** — TypeScript compilation + XPI bundling
- **test** — Integration tests (depends on build)

### Release (`release.yml`)

Triggered automatically when a version tag (`v*`) is pushed:

```sh
# Bump version, tag, and push — CI will build and release
npm run release
```

The release workflow builds the plugin, packages the `.xpi`, and publishes it to GitHub Releases. It also generates `update.json` (stable) or `update-beta.json` (pre-release, versions containing `-`) so Zotero can deliver automatic updates.

### Dependabot

Weekly automated dependency updates with minor and patch bumps grouped into a single PR.

## Contributing

1. Fork the repo and create a feature branch.
2. Make your changes and ensure `npm run lint:check` and `npm test` pass.
3. Open a pull request against `main`.

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/WeiCheng14159/local-pdf-manager-plugin/issues).

## License

[AGPL-3.0-or-later](LICENSE)
