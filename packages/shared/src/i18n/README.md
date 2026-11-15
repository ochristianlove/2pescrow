# Shared website and native translations

The website and Android app use the same pure catalog. English is the source language;
French, Simplified Chinese, Spanish, Brazilian Portuguese, Russian, Indonesian, and
Vietnamese are available from the header. Language preferences persist locally.

`catalog.ts` retains the existing translations. `fr.ts` and `fr-extra.ts` supply French.
`reviewed.ts` supplies reviewed trade and attachment terminology. `templates.ts` supplies
reviewed variable-bearing text: placeholder names must remain identical in every language.
Additional interface copy and the current public FAQ/articles use precomputed, locally
machine-assisted translations in `generated.ts`. Long-form editorial/legal wording has
not received a professional translator's review. No translation service receives private
trade messages, evidence, names, or terms; translation works offline after installation.

Translate product copy at render time so changing language also updates open dialogs.
Use `t("Open / save {name}", { name })` for variables. Preserve user-authored content;
native `Text` supports `translate={false}`, and web trade terms leave `BlogRichText`'s
translation option disabled. Published blog content explicitly opts into translation.
External wallet apps and the operating system's file picker use their own language settings.

When adding interface copy or changing public articles, update the corresponding entries
in every catalog and `required-copy.json`, then run:

```
node scripts/check-i18n.cjs
node scripts/check-mobile-parity.cjs
```

The coverage manifest records the current interface and published editorial snapshot.
New CMS content requires new catalog entries; an unknown string remains readable in English.
