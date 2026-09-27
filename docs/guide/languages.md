# Languages

The interface is in **English by default**. **Spanish** is included, and the whole UI is
translated through a single dictionary file, ready for more languages.

## Switching

**Settings → Appearance → Language** (English / Español). The choice is stored with the rest
of the preferences and applies instantly, without reloading.

The `<html lang>` attribute follows the selected language, so hyphenation and screen readers
stay correct.

## How the translation works

All the visible text lives in `src/lib/i18n.ts`:

```ts
const en = {
  'header.open': 'Open',
  'status.words.one': '{count} word',
  'status.words.other': '{count} words',
  // ...
} as const;

const es: Record<TranslationKey, string> = {
  'header.open': 'Abrir',
  'status.words.one': '{count} palabra',
  'status.words.other': '{count} palabras',
  // ...
};
```

- React components use `useI18n()` (`const { t, plural } = useI18n()`), so changing the
  language re-renders them — including memoized components, because the value comes from a
  context.
- Modules that are not React (export pipeline, preview post-processing, backend bridge) use
  the `t()` helper with the active language, which the provider sets before rendering.
- `{name}` placeholders are interpolated; `plural('key', count)` picks `key.one` or
  `key.other`.

## Adding a language

1. Add the language to `LANGUAGES` in `src/lib/i18n.ts`:

   ```ts
   { id: 'pt', label: 'Portuguese', native: 'Português' },
   ```

2. Copy the `en` dictionary, translate the values and add it to `dictionaries`:

   ```ts
   const dictionaries: Record<Language, Record<TranslationKey, string>> = {
     en,
     es,
     pt,
   };
   ```

3. That's it: the language selector and the persisted preference pick it up automatically.
   The docs site is prepared the same way (see `docs/.vitepress/config.ts` → `locales`).

## What is *not* translated

The error messages returned by the Rust backend (`read_document`, `write_document`, …) are in
English regardless of the UI language. They are rare paths (a file that disappeared, a folder
without permissions) and are listed as a known limitation.
