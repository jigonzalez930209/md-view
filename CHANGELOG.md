# Changelog

All notable changes to md-view are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-09-29

### Added

- recover from render errors and finish the empty states (da344a6)
- disable PDF with an explanation where printing is unavailable (3cd7d0f)
- keyboard tree, live status, accessible tabs and splitters (a6c3460)
- find in preview and headings outline (d5c5e5b)
- persist window and layout, restore session, autosave drafts (48cf37e)
- translate backend errors with stable codes (25b32e3)
- detect outside changes and reload from disk (997c0c4)
- offer Save and Save all before closing dirty documents (5c54f49)
- add new command for generating WebP and update README image size (ff454ab)
- add script for animated WebP generation from video input (7f5ff4b)

### Fixed

- grant the asset protocol only the folders you open (97f17f0)
- cap document and embed reads before loading them (0b5a0e0)
- never export a large document silently truncated (97ab98b)
- keep the file encoding when saving (fb696d9)
- update folder dialog handling to improve user experience (191ca76)
- optimize frame duration handling and adjust compression level (16f8d05)

### Documentation

- known limitations, published roadmap and truth pass (251edb6)
- third-party notices, security and privacy policies, templates (d8e47e6)
- add the roadmap to 1.0 (eaed5dc)
- update release process documentation and workflow details (4533572)
- add instructions for generating animated WebP and update README media references (b7ce0b4)

### Tests

- move the smoke suites into the repository and CI (be7caf4)

### Maintenance

- checksums, SBOM, pinned actions and optional signed tags (de34c24)
- lint, clippy, advisories, dependabot and version check (9bba4c3)
- arm64 Linux and a lower glibc floor (ab0a1c8)

**Full changelog**: https://github.com/jigonzalez930209/md-view/compare/v0.3.1...v0.7.0

## [0.3.1] - 2026-09-28

### Added

- add detailed changelog for version 0.3.0 and introduce promo video documentation (3d0a4f8)
- add video hero component and custom styles (2148dd7)

### Changed

- improve code formatting and readability in lib.rs (6eb88b4)

### Documentation

- update README and CHANGELOG for improved clarity and media integration (31686e4)

**Full changelog**: https://github.com/jigonzalez930209/md-view/compare/v0.3.0...v0.3.1

## [0.3.0] - 2026-09-28

### Added

- add background color handling and improve window visibility (0b186b4)
- update markdown styles for print and zoom functionality (37aaff8)
- implement light theme for print functionality (81f756f)
- implement zoom functionality for preview component (0ac9e8b)
- improve menu interaction timing and update app launch behavior (d14c979)
- implement git baseline retrieval for committed file versions (6360cac)
- enhance editor state with baseline and change statistics (89812e1)
- enhance Mermaid diagram styling for loading and stale states (6de75a8)
- add new status and enhancement messages for Git branch and diagram rendering (4703e44)
- enhance diagram rendering with caching and error handling (7b41453)
- add gitBaseline function to retrieve committed file version (a993f81)
- integrate change indicator into editor state creation (5bc0c11)
- implement change indicators for document modifications (e2e9d81)
- add Git branch and change stats display to status bar (5025c7a)
- enhance theme and palette selection with persistent menu state (79d505e)
- enhance Editor component with baseline comparison and change stats (f5f7418)
- add Tauri mock runtime for layout probing (eafbff6)
- add HTML layout for promo stage (43b8621)
- create script.mjs for promo video storyboard and assets (db9cdcb)
- add script for recording LinkedIn promo video (cec5798)
- add layout probing script for frontend measurement (e47314e)

### Fixed

- wrap path display in `<bdi>` element for consistent text direction (d1e2854)
- update path display to ensure proper text direction (7cfb3f4)
- always build the Pages deployment from main (e3e38e7)
- resolve the output directory to an absolute path (eea56ff)

### Changed

- streamline theme handling and improve print export logic (6db22c1)
- update state management for rendered HTML and document path (969750e)

### Documentation

- add the APT repository to the README (f67ba38)

### Maintenance

- update pnpm-workspace.yaml to allow ffmpeg-static binary download (b1d7685)
- update pnpm-lock.yaml to add new package versions (71410cd)
- update package.json to add new scripts and dependencies (24979a5)
- update .gitignore to include pnpm-store and promo output directory (d488686)

### Other

- remove: delete demo.html and demo.svg files from the src-tauri directory (8957907)

**Full changelog**: https://github.com/jigonzalez930209/md-view/compare/v0.2.2...v0.3.0

## [0.2.2] - 2026-09-28

### Added

- DEP-5 copyright and a signed APT repository on Pages (3b7f439)

**Full changelog**: https://github.com/jigonzalez930209/md-view/compare/v0.2.1...v0.2.2

## [0.2.1] - 2026-09-28

### Added

- ship AppStream metadata for app centers (19b6fde)

### Fixed

- actually patch the .deb dependencies in the workflow (d35b24a)

### Documentation

- refresh the test list and the .deb fix step (a2917c3)

### Maintenance

- add the MIT license file and package metadata (e24dada)

**Full changelog**: https://github.com/jigonzalez930209/md-view/compare/v0.2.0...v0.2.1

## [0.2.0] - 2026-09-27

- First release.

