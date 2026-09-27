# Code style

## TypeScript and React

- **Strict TypeScript**. `noUnusedLocals` and `noUnusedParameters` are on: dead code fails the
  build.
- Function components with hooks; no classes. `useCallback`/`useMemo` where identity matters
  (handlers passed to memoized children, expensive derivations).
- The heavy components (`Preview`, `FormatBar`, `TabBar`, `FileTree`) are wrapped in
  `React.memo`; keep their props stable when you touch them.
- Imports use the `@/` alias (`@/lib/...`, `@/components/...`).
- No state duplication: derive from `tabs` and `activeId` instead of keeping copies.

## UI

- **Tailwind v4** (CSS-first: tokens in `@theme`, no `tailwind.config.js`) for every class.
- **shadcn/ui** components live in `components/ui` and are copied in, not imported from a
  package; edit them like any other file in the repo.
- **lucide-react** for icons. The only hand-drawn icon is the Markdown logo in `Welcome.tsx`.
- Colors always come from CSS variables (`--background`, `--muted-foreground`, `--border`…) so
  all three palettes work without component changes.
- The preview (`styles/markdown.css`) is the exception: it styles generated HTML with plain
  CSS class selectors, but consumes the same variables.

## Comments and naming

- **File names, identifiers and every user-facing string are in English.**
- Comments are currently written in **Spanish** (the project started in Spanish); translating
  them is a welcome, self-contained contribution. Keep the "why", not the "what".
- Keep comments close to the code they explain and prefer a short paragraph over a wall of
  bullet points.

## Rust

- `cargo fmt` is enforced by CI; run `cargo fmt` before committing.
- Commands that touch the file system are `async` so they never block the interface.
- Errors are `Result<_, String>` with a message meant for the user.
- Long walks (the folder tree) have explicit limits (`TREE_MAX_ENTRIES`, `TREE_MAX_DEPTH`) and
  tests.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`,
`refactor:`, `docs:`, `chore:`, `test:`. Subject in the imperative, under 72 characters; the
body only when the *why* isn't obvious. Releases are tagged as `chore(release): vX.Y.Z` by
`scripts/release.sh`.

## Documentation

- Documentation lives in `docs/` (VitePress). File and folder names in English.
- Every user-visible behavior should be documented in the relevant guide page.
- `pnpm docs:build` fails on dead links, so run it before pushing documentation changes.
