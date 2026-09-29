# Security policy

## Supported versions

The latest release is the supported one. Fixes land on `main` and go out with the next
version (see [Publishing releases](https://jigonzalez930209.github.io/md-view/deployment/releases)).

## Reporting a vulnerability

Open a **private security advisory** on GitHub:
<https://github.com/jigonzalez930209/md-view/security/advisories/new>

Please don't use a public issue. Include the version, your platform and a small document or
set of steps that triggers the problem; a proof of concept helps more than a description.

## What is in scope

- The Tauri backend commands (`src-tauri/src/lib.rs`): file reads and writes, the folder tree,
  the asset-protocol scope and the recent/draft files.
- The rendering pipeline (`src/lib/`): markdown-it + DOMPurify, Mermaid, KaTeX, the export
  formats and the MDX preprocessing.
- The release pipeline: workflows, signing, checksums and the APT repository.

Rendering is sanitized with DOMPurify (skipped only when the Markdown has no raw HTML at all,
where markdown-it already escapes), Mermaid runs with `securityLevel: 'strict'`, the window CSP
only allows the app's own scripts, and the asset protocol scope starts empty (the app grants
the folders you open). Details in
[Security](https://jigonzalez930209.github.io/md-view/reference/security).

## What is not in scope

- Automated reports from scanners without a working reproduction.
- Malicious content in *your own* documents that you have to click first (for example a link
  you open on purpose).
- Vulnerabilities in the Python or shell tooling used to build the project (not shipped).
