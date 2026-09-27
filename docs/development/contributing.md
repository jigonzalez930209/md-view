# Contributing

Thanks for taking the time. md-view is a small project; the most useful contributions are bug
reports with a reproduction, documentation fixes and focused pull requests.

## Before you start

- For a **bug**, open an issue with: what you did, what you expected, what happened, the
  document that triggers it (a few lines are enough) and your platform.
- For a **feature**, open an issue first so we can agree on the scope. md-view deliberately
  stays small: no plugins, no cloud, no Markdown extensions beyond GitHub.
- For **translations**, see [Languages](/guide/languages); adding a dictionary is a
  self-contained change.

## Setting up

```bash
git clone https://github.com/jigonzalez930209/md-view
cd md-view
pnpm install
pnpm app
```

See [Development setup](/development/setup) for requirements and the browser mode.

## Pull requests

1. Branch from `main`: `feat/short-description` or `fix/short-description`.
2. Keep the change focused; unrelated cleanups go in their own PR.
3. Run the gates:

   ```bash
   pnpm typecheck
   pnpm build
   (cd src-tauri && cargo fmt --check && cargo test)
   pnpm docs:build     # if you touched docs/
   ```

4. Use [Conventional Commits](https://www.conventionalcommits.org/) and describe the *why* in
   the body.
5. Update the documentation when behavior changes: the relevant page under `docs/guide` or
   `docs/reference`, and the `README.md` if it's user-visible.

## Where to touch what

| You want to change… | Start in |
| --- | --- |
| Title bar, tabs, formatting bar, status bar | `src/components/*.tsx` |
| Markdown commands (bold, lists…) | `src/editor/format.ts` |
| Preview rendering or post-processing | `src/lib/markdown*.ts`, `src/lib/enhance.ts`, `src/lib/mermaid.ts` |
| Export formats | `src/lib/export.ts` |
| Performance thresholds | `src/lib/limits.ts` |
| Colors | `src/styles/theme.css` (palette blocks) |
| Translations | `src/lib/i18n.ts` |
| File system commands | `src-tauri/src/lib.rs` |
| Documentation | `docs/` |

## Good first issues

- Translate the code comments to English (they are in Spanish today).
- Add a palette (Dracula's Alucard is already there; a fourth one is a CSS-only change).
- Add a language dictionary.
- Improve the KaTeX rendering of a specific construct in the demo document.

## License

By contributing you agree that your work is released under the MIT license, like the rest of
the project.
