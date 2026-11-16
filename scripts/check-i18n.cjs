const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { translate, formatTranslation, languageOptions, catalogs } = require('../packages/shared/src/i18n/catalog.ts');
const { french } = require('../packages/shared/src/i18n/fr.ts');
const { frenchExtra } = require('../packages/shared/src/i18n/fr-extra.ts');
const { generated } = require('../packages/shared/src/i18n/generated.ts');
const { reviewed } = require('../packages/shared/src/i18n/reviewed.ts');
const { templates } = require('../packages/shared/src/i18n/templates.ts');
const required = require('../packages/shared/src/i18n/required-copy.json');
assert.equal(languageOptions.length, 8);
const address = '0x0123456789abcdef';
for (const { id } of languageOptions) {
  if (id === 'en') continue;
  const dictionaries = [reviewed[id], templates[id], generated[id], ...catalogs.map(c => c[id]), ...(id === 'fr' ? [french, frenchExtra] : [])].filter(Boolean);
  const missing = required.filter(key => !dictionaries.some(d => Object.hasOwn(d, key) && typeof d[key] === 'string' && d[key].trim()));
  assert.deepEqual(missing, [], `${id}: missing copy`);
  for (const [key, value] of Object.entries(templates[id])) {
    assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), (key.match(/\{\w+\}/g) || []).sort(), `${id}: changed placeholders in ${key}`);
  }
  assert(formatTranslation(id, 'Open / save {name}', { name: 'invoice.pdf' }).includes('invoice.pdf'));
  assert(formatTranslation(id, 'Connected {address}', { address }).includes(address));
  assert.equal(translate(id, '37 days'), formatTranslation(id, '{count} days', { count: 37 }));
  assert.equal(translate(id, 'USDT'), 'USDT');
  assert.equal(translate(id, '2Pescrow'), '2Pescrow');
  assert.equal(translate(id, 'constructor'), 'constructor');
  assert.equal(translate(id, 'A unique user message 8c65'), 'A unique user message 8c65');
  assert.equal(translate(id, ' Language '), ` ${translate(id, 'Language')} `);
}
console.log(`All eight languages cover ${required.length} interface/editorial keys; placeholders, names, tokens, and fallbacks verified.`);
