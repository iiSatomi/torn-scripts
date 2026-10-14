const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '../src/script-hub-forms.cjs');
assert.ok(fs.existsSync(modulePath), 'the reusable forms module must exist');
const { normalizeHubPage, validateHubSettings } = require(modulePath);
const page = fields => ({ id: 'settings', title: 'Settings', sections: [{ id: 'general', title: 'General', fields }] });
const field = (id, type, rest = {}) => ({ id, type, label: id, ...rest });

// Losing the allowlist would permit executable schemas or accidental secret defaults.
const secret = Array.from({ length: 30 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
const raw = page([field('token', 'secret', { default: secret }), field('name', 'text', { default: 'hello', html: '<script>bad()</script>', pattern: '.*' })]);
const normalized = normalizeHubPage(raw);
assert.equal(normalized.sections[0].fields[0].default, undefined);
assert.equal(normalized.sections[0].fields[1].html, undefined);
assert.equal(normalized.sections[0].fields[1].pattern, undefined);
assert.equal(JSON.stringify(normalized).includes(secret), false);
assert.equal(raw.sections[0].fields[0].default, secret, 'normalization does not mutate registration data');
assert.throws(() => normalizeHubPage(page([field('x', 'html')])), TypeError);
assert.throws(() => normalizeHubPage(page([field('x', 'text'), field('x', 'checkbox')])), TypeError);
assert.throws(() => normalizeHubPage(page([field('__proto__', 'text')])), TypeError);
assert.throws(() => normalizeHubPage(page(Array.from({ length: 101 }, (_, i) => field('f' + i, 'text')))), TypeError);
assert.throws(() => normalizeHubPage({ ...page([]), description: '💠'.repeat(18000) }), TypeError);
assert.throws(() => normalizeHubPage(page([field('x', 'text', { visibleWhen: { field: 'missing', equals: true } })])), TypeError);
assert.throws(() => normalizeHubPage(page([field('x', 'number', { min: 4, max: 2 })])), TypeError);
assert.throws(() => normalizeHubPage(page([field('x', 'text', { format: 'custom-code' })])), TypeError);

// Numeric conversion must preserve numbers and reject truncation, NaN and step mismatch.
const numbers = normalizeHubPage(page([field('count', 'integer', { min: 0, max: 10 }), field('ratio', 'number', { min: 0.1, max: 1, step: 0.1 }), field('enabled', 'toggle')]));
assert.deepEqual(validateHubSettings(numbers, { count: '0', ratio: '0.3', enabled: false, extra: 'ignored' }), { ok: true, values: { count: 0, ratio: 0.3, enabled: false }, errors: {} });
for (const count of ['2.5', '2x', Infinity, {}, true, '11']) assert.equal(validateHubSettings(numbers, { count, ratio: 0.3, enabled: false }).ok, false);
assert.equal(validateHubSettings(numbers, { count: 1, ratio: 0.35, enabled: false }).ok, false);
assert.equal(validateHubSettings(numbers, { count: 1, ratio: 0.3, enabled: 'false' }).ok, false);

const choices = normalizeHubPage(page([field('mode', 'select', { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' }), field('radio', 'radio', { options: ['one', 'two'] })]));
assert.deepEqual(validateHubSettings(choices, { radio: 'two' }).values, { mode: 'a', radio: 'two' });
assert.equal(validateHubSettings(choices, { mode: 'other', radio: 'one' }).ok, false);

const formats = normalizeHubPage(page([field('mail', 'text', { required: true, format: 'email' }), field('link', 'text', { format: 'url' }), field('color', 'color'), field('day', 'date'), field('time', 'time'), field('note', 'textarea', { minLength: 2, maxLength: 8 })]));
assert.equal(validateHubSettings(formats, { mail: 'name@example.test', link: 'https://example.test', color: '#aabbcc', day: '2024-02-29', time: '23:59', note: 'hello' }).ok, true);
for (const [key, value] of [['mail', ' '], ['link', 'javascript:alert(1)'], ['color', 'red'], ['day', '2023-02-29'], ['time', '24:00'], ['note', 'longer than eight']]) {
  const values = { mail: 'name@example.test', link: '', color: '', day: '', time: '', note: 'ok', [key]: value };
  assert.ok(validateHubSettings(formats, values).errors[key], key + ' must report its own error');
}

const conditional = normalizeHubPage(page([field('enabled', 'checkbox'), field('detail', 'text', { required: true, visibleWhen: { field: 'enabled', equals: true } }), field('token', 'password', { default: secret })]));
assert.deepEqual(validateHubSettings(conditional, { enabled: false, detail: '', token: secret }).values, { enabled: false });
assert.equal(validateHubSettings(conditional, { enabled: true, detail: '' }).ok, false);
assert.equal(validateHubSettings(conditional, { enabled: true, detail: 'ok', token: secret }).values.token, undefined);
assert.equal(JSON.stringify(validateHubSettings(conditional, { enabled: true, detail: 'ok', token: secret })).includes(secret), false);

// Large step counts must not widen tolerance enough to accept half-step values.
const largeSteps = normalizeHubPage(page([field('count', 'integer', { min: 0, max: 1e12, step: 2 })]));
assert.equal(validateHubSettings(largeSteps, { count: 200000001 }).ok, false, 'an odd integer cannot satisfy an even step');
assert.equal(validateHubSettings(largeSteps, { count: 200000002 }).ok, true);
const fractionalLargeSteps=normalizeHubPage(page([field('count','number',{min:0,max:1e16,step:2})]));
assert.equal(validateHubSettings(fractionalLargeSteps,{count:1000000000000000.5}).ok,false,'representable fractional values cannot satisfy a whole step');
assert.equal(validateHubSettings(fractionalLargeSteps,{count:1000000000000002}).ok,true);

// Bound the whole UTF-8 patch, not only individual field string lengths.
const boundedPatch = normalizeHubPage(page([field('one', 'text'), field('two', 'text'), field('token', 'secret'), field('otherToken', 'password')]));
const publicOverflow = validateHubSettings(boundedPatch, { one: '💠'.repeat(5000), two: '💠'.repeat(5000) });
assert.equal(publicOverflow.ok, false, 'combined settings must fit the 32 KiB public patch limit');
assert.ok(publicOverflow.errors.one || publicOverflow.errors.two, 'oversized public patch explains the field error');
const secretOverflow = validateHubSettings(boundedPatch, { token: secret.repeat(700), otherToken: secret.repeat(700) });
assert.equal(secretOverflow.ok, false, 'combined new write-only secrets must fit a separate 32 KiB patch limit');
assert.ok(secretOverflow.errors.token || secretOverflow.errors.otherToken, 'oversized secret patch explains the field error');
assert.equal(JSON.stringify(secretOverflow).includes(secret), false);
assert.equal(validateHubSettings(boundedPatch, { one: 'a'.repeat(10000), two: 'b'.repeat(10000), token: secret.repeat(300), otherToken: secret.repeat(300) }).ok, true, 'public and secret patch limits are independent');
const readonlyPage = normalizeHubPage(page([field('enabled', 'checkbox', { readOnly: true }), field('detail', 'text', { visibleWhen: { field: 'enabled', equals: true } })]));
assert.deepEqual(validateHubSettings(readonlyPage, { enabled: true, detail: 'editable' }), { ok: true, values: { detail: 'editable' }, errors: {} }, 'read-only authoritative values drive dependencies but never enter the save patch');
console.log('script-hub-forms: normalization and typed validation passed');
