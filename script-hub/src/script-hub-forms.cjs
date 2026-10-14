'use strict';

// These functions are bundled into the hub's private userscript scope.
const hubFormTypes = new Set(['text', 'textarea', 'number', 'integer', 'password', 'secret', 'checkbox', 'toggle', 'select', 'radio', 'range', 'color', 'date', 'time']);
const hubFormNumeric = new Set(['number', 'integer', 'range']);
const hubFormSecret = field => field.type === 'password' || field.type === 'secret';
const hubFormBoolean = field => field.type === 'checkbox' || field.type === 'toggle';
const hubFormOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
let hubFormSequence = 0;

function normalizeHubPage(raw) {
  const fail = () => { throw new TypeError('Unsupported or invalid settings page.'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
  let serialized;
  try { serialized = JSON.stringify(raw); } catch (_) { fail(); }
  // Count UTF-8 bytes without relying on Node or an optional browser API.
  if (!serialized || serialized.length > 65536 || encodeURIComponent(serialized).replace(/%[A-F\d]{2}/g, '_').length > 65536) fail();
  const id = value => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) fail();
    return value;
  };
  const text = (value, optional = false) => {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || value.length > 8192) fail();
    return value;
  };
  const scalar = value => typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
  const fields = new Map();
  let count = 0;
  if (!Array.isArray(raw.sections) || raw.sections.length > 100) fail();
  const sectionIds = new Set();
  const sections = raw.sections.map(section => {
    if (!section || typeof section !== 'object' || !Array.isArray(section.fields)) fail();
    const sectionId = id(section.id);
    if (sectionIds.has(sectionId)) fail();
    sectionIds.add(sectionId);
    return { id: sectionId, title: text(section.title), fields: section.fields.map(source => {
      if (!source || typeof source !== 'object' || ++count > 100) fail();
      const fieldId = id(source.id);
      const type = source.type === 'slider' ? 'range' : source.type;
      if (fields.has(fieldId) || !hubFormTypes.has(type)) fail();
      const field = { id: fieldId, type, label: text(source.label) };
      fields.set(fieldId, field);
      if (source.description !== undefined) field.description = text(source.description);
      if (source.unit !== undefined) field.unit = text(source.unit);
      for (const key of ['required', 'readOnly']) {
        if (source[key] !== undefined) {
          if (typeof source[key] !== 'boolean') fail();
          field[key] = source[key];
        }
      }
      for (const key of ['min', 'max', 'step', 'minLength', 'maxLength']) {
        if (source[key] === undefined) continue;
        if (typeof source[key] !== 'number' || !Number.isFinite(source[key])) fail();
        if (key.endsWith('Length') && (!Number.isInteger(source[key]) || source[key] < 0 || source[key] > 32768)) fail();
        if (key === 'step' && source[key] <= 0) fail();
        field[key] = source[key];
      }
      if (field.min > field.max || field.minLength > field.maxLength) fail();
      if (source.format !== undefined) {
        if (!['email', 'url'].includes(source.format) || !['text', 'textarea'].includes(type)) fail();
        field.format = source.format;
      }
      if (type === 'select' || type === 'radio') {
        if (!Array.isArray(source.options) || !source.options.length || source.options.length > 100) fail();
        const optionIds = new Set();
        field.options = source.options.map(option => {
          const value = typeof option === 'string' ? option : option && option.value;
          if (!scalar(value) || optionIds.has(JSON.stringify(value))) fail();
          optionIds.add(JSON.stringify(value));
          return { value, label: text(typeof option === 'string' ? option : option.label) };
        });
      }
      if (source.visibleWhen !== undefined) {
        const condition = source.visibleWhen;
        if (!condition || typeof condition !== 'object' || !scalar(condition.equals)) fail();
        field.visibleWhen = { field: id(condition.field), equals: condition.equals };
      }
      if (hubFormOwn(source, 'default') && !hubFormSecret(field)) {
        if (!scalar(source.default)) fail();
        field.default = source.default;
      }
      return field;
    }) };
  });
  for (const field of fields.values()) {
    const visited = new Set([field.id]);
    let current = field;
    while (current.visibleWhen) {
      const dependency = fields.get(current.visibleWhen.field);
      if (!dependency || hubFormSecret(dependency) || visited.has(dependency.id)) fail();
      visited.add(dependency.id);
      current = dependency;
    }
    if (hubFormOwn(field, 'default') && hubFormFieldValue(field, field.default).error) fail();
  }
  if (raw.actions !== undefined && (!Array.isArray(raw.actions) || raw.actions.length > 100)) fail();
  const actionIds = new Set();
  const actions = (raw.actions || []).map(action => {
    if (!action || typeof action !== 'object') fail();
    const actionId = id(action.id);
    if (actionIds.has(actionId)) fail();
    actionIds.add(actionId);
    return { id: actionId, label: text(action.label) };
  });
  return { id: id(raw.id), title: text(raw.title), description: text(raw.description, true), sections, actions };
}

function hubFormFieldValue(field, raw) {
  const missing = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
  if (missing) {
    if (field.required) return { error: 'This field is required.' };
    return { value: hubFormBoolean(field) ? false : '' };
  }
  if (hubFormBoolean(field)) {
    if (typeof raw !== 'boolean') return { error: 'Choose an enabled or disabled value.' };
    if (field.required && !raw) return { error: 'This field must be enabled.' };
    return { value: raw };
  }
  if (hubFormNumeric.has(field.type)) {
    if (typeof raw !== 'number' && (typeof raw !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()))) return { error: 'Enter a number.' };
    const value = Number(raw);
    if (!Number.isFinite(value) || (field.type === 'integer' && !Number.isSafeInteger(value))) return { error: field.type === 'integer' ? 'Enter a whole number.' : 'Enter a finite number.' };
    if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) return { error: 'Enter a number within the allowed range.' };
    if (field.step !== undefined) {
      const base = field.min || 0;
      const steps = (value - base) / field.step;
      const nearest = base + Math.round(steps) * field.step;
      // Allow operand rounding error, but never a half-step mismatch at any magnitude.
      const tolerance = Math.min(field.step * 1e-9, Number.EPSILON * 4 * Math.max(1, Math.abs(value), Math.abs(base), Math.abs(nearest)));
      if (!Number.isFinite(steps) || !Number.isFinite(nearest) || Math.abs(value - nearest) > tolerance) return { error: 'Enter a number matching the allowed step.' };
    }
    return { value };
  }
  if (field.type === 'select' || field.type === 'radio') {
    const option = field.options.find(item => item.value === raw);
    return option ? { value: option.value } : { error: 'Choose one of the available options.' };
  }
  if (typeof raw !== 'string' || raw.length > 32768) return { error: 'Enter a valid text value.' };
  if ((field.minLength !== undefined && raw.length < field.minLength) || (field.maxLength !== undefined && raw.length > field.maxLength)) return { error: 'Use the allowed text length.' };
  if (field.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { error: 'Enter a valid email address.' };
  if (field.format === 'url') {
    try { const parsed = new URL(raw); if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname) throw new Error(); } catch (_) { return { error: 'Enter an HTTP or HTTPS URL.' }; }
  }
  if (field.type === 'color' && !/^#[0-9a-f]{6}$/i.test(raw)) return { error: 'Choose a six-digit color.' };
  if (field.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: 'Enter a valid date.' };
    const date = new Date(raw + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return { error: 'Enter a valid date.' };
  }
  if (field.type === 'time' && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(raw)) return { error: 'Enter a valid time.' };
  return { value: raw };
}

function hubFormValues(page, input) {
  const result = {};
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const section of page.sections) for (const field of section.fields) {
    if (hubFormSecret(field)) continue;
    const value = hubFormOwn(source, field.id) ? source[field.id] : hubFormOwn(field, 'default') ? field.default : hubFormBoolean(field) ? false : '';
    result[field.id] = (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') ? value : '';
  }
  return result;
}

function hubFormVisible(field, fields, values) {
  if (!field.visibleWhen) return true;
  const dependency = fields.get(field.visibleWhen.field);
  if (!hubFormVisible(dependency, fields, values)) return false;
  const parsed = hubFormFieldValue(dependency, values[dependency.id]);
  return !parsed.error && parsed.value === field.visibleWhen.equals;
}

function validateHubSettings(page, input) {
  page = normalizeHubPage(page);
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const fields = new Map(page.sections.flatMap(section => section.fields).map(field => [field.id, field]));
  const combined = { ...hubFormValues(page, source) };
  const values = {}, errors = {}, secretPatch = {};
  for (const field of fields.values()) {
    if (field.readOnly || !hubFormVisible(field, fields, combined)) continue;
    const raw = hubFormSecret(field) ? source[field.id] : hubFormOwn(source, field.id) ? source[field.id] : combined[field.id];
    const parsed = hubFormFieldValue(field, raw);
    if (parsed.error) errors[field.id] = parsed.error;
    else if (!hubFormSecret(field)) values[field.id] = parsed.value;
    else if (parsed.value !== '') secretPatch[field.id] = parsed.value;
  }
  const checkSize = (patch, message) => {
    const serialized = JSON.stringify(patch);
    const bytes = encodeURIComponent(serialized).replace(/%[A-F\d]{2}/g, '_').length;
    if (bytes > 32768) {
      const lastField = Object.keys(patch).at(-1);
      errors[lastField] = message;
    }
  };
  checkSize(values, 'Settings exceed the 32 KiB limit. Shorten the values before saving.');
  checkSize(secretPatch, 'New secret values exceed the 32 KiB limit. Shorten them before saving.');
  return { ok: Object.keys(errors).length === 0, values, errors };
}

function renderHubForm(document, page, values, options = {}) {
  page = normalizeHubPage(page);
  const prefix = 'tsh-form-' + (++hubFormSequence) + '-';
  const fields = new Map(page.sections.flatMap(section => section.fields).map(field => [field.id, field]));
  const controls = new Map(), rows = new Map(), errors = new Map(), listeners = [];
  let destroyed = false, busy = false;
  let baseline = hubFormValues(page, values);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = 'tsh-form-' + className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const listen = (node, event, callback) => { node.addEventListener(event, callback); listeners.push(() => node.removeEventListener(event, callback)); };
  const element = make('form', 'root');
  element.noValidate = true;
  element.append(make('h3', 'title', page.title));
  if (page.description) element.append(make('p', 'description', page.description));
  const status = make('p', 'status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  for (const section of page.sections) {
    const group = make('fieldset', 'section');
    group.append(make('legend', 'section-title', section.title));
    for (const field of section.fields) {
      const row = make(field.type === 'radio' ? 'fieldset' : 'div', 'field');
      row.dataset.field = field.id;
      const label = make(field.type === 'radio' ? 'legend' : 'label', 'label', field.label + (field.required ? ' *' : ''));
      const controlId = prefix + field.id;
      if (field.type !== 'radio') label.htmlFor = controlId;
      row.append(label);
      const helpId = controlId + '-help', errorId = controlId + '-error';
      const fieldControls = [];
      if (field.type === 'radio') {
        field.options.forEach((option, index) => {
          const optionLabel = make('label', 'option');
          const control = make('input', 'input');
          control.type = 'radio'; control.name = controlId; control.id = controlId + '-' + index; control.value = String(index);
          optionLabel.append(control, document.createTextNode(option.label)); row.append(optionLabel); fieldControls.push(control);
        });
      } else {
        const control = make(field.type === 'textarea' ? 'textarea' : field.type === 'select' ? 'select' : 'input', 'input');
        control.id = controlId;
        if (field.type === 'select') {
          const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Choose…'; control.append(empty);
          field.options.forEach((option, index) => { const node = document.createElement('option'); node.value = String(index); node.textContent = option.label; control.append(node); });
        } else if (field.type !== 'textarea') {
          control.type = hubFormSecret(field) ? 'password' : hubFormBoolean(field) ? 'checkbox' : field.type === 'integer' ? 'number' : field.type;
          if (field.type === 'toggle') control.setAttribute('role', 'switch');
        }
        if (hubFormSecret(field)) { control.autocomplete = 'new-password'; control.setAttribute('data-write-only', 'true'); }
        for (const key of ['min', 'max', 'step', 'minLength', 'maxLength']) if (field[key] !== undefined) control.setAttribute(key.toLowerCase(), String(field[key]));
        if (field.type === 'integer' && field.step === undefined) control.step = '1';
        if (field.type === 'number' && field.step === undefined) control.step = 'any';
        row.append(control); fieldControls.push(control);
      }
      if (field.unit) row.append(make('span', 'unit', field.unit));
      if (field.description) { const help = make('p', 'help', field.description); help.id = helpId; row.append(help); }
      const error = make('p', 'error'); error.id = errorId; error.hidden = true; error.setAttribute('role', 'alert'); row.append(error);
      for (const control of fieldControls) {
        control.setAttribute('aria-describedby', (field.description ? helpId + ' ' : '') + errorId);
        if (field.required) control.setAttribute('aria-required', 'true');
        if (field.readOnly) { control.readOnly = true; control.setAttribute('aria-readonly', 'true'); }
        listen(control, 'input', update); listen(control, 'change', update);
      }
      controls.set(field.id, fieldControls); rows.set(field.id, row); errors.set(field.id, error); group.append(row);
    }
    element.append(group);
  }
  element.append(status);
  const actions = make('div', 'actions');
  const buttons = [];
  const button = (text, className, callback, submit = false) => {
    const node = make('button', className, text); node.type = submit ? 'submit' : 'button';
    if (callback) listen(node, 'click', callback);
    buttons.push(node); actions.append(node); return node;
  };
  const save = button('Save', 'save', null, true);
  button('Cancel', 'cancel', () => invoke(options.onCancel));
  button('Reset defaults', 'reset', () => invoke(async () => {
    if (options.onReset && await options.onReset() === false) return;
    resetDefaults();
  }, true));
  for (const action of page.actions) button(action.label, 'action', () => invoke(() => options.onAction && options.onAction(action.id)));
  element.append(actions);

  function read(field) {
    const list = controls.get(field.id), control = list[0];
    if (field.type === 'radio') { const selected = list.find(item => item.checked); return selected ? field.options[Number(selected.value)].value : ''; }
    if (field.type === 'select') return control.value === '' ? '' : field.options[Number(control.value)].value;
    if (hubFormBoolean(field)) return control.checked;
    if (hubFormNumeric.has(field.type)) return control.validity.badInput ? NaN : control.value === '' ? '' : Number(control.value);
    return control.value;
  }
  function getValues() {
    const result = {};
    if (!destroyed) for (const field of fields.values()) if (!hubFormSecret(field)) result[field.id] = read(field);
    return result;
  }
  // Intentionally separate: callers may only route this patch through encrypted transport.
  function getSecretValues() {
    const result = {};
    if (!destroyed) {
      const current = getValues();
      for (const field of fields.values()) if (hubFormSecret(field) && !field.readOnly && hubFormVisible(field, fields, current)) {
        const value = read(field); if (value !== '') result[field.id] = value;
      }
    }
    return result;
  }
  function isDirty() { return !destroyed && (JSON.stringify(getValues()) !== JSON.stringify(baseline) || Object.keys(getSecretValues()).length > 0); }
  function write(next) {
    for (const field of fields.values()) {
      const list = controls.get(field.id), value = hubFormSecret(field) ? '' : next[field.id];
      if (field.type === 'radio') list.forEach((control, index) => { control.checked = field.options[index].value === value; });
      else if (field.type === 'select') { const index = field.options.findIndex(option => option.value === value); list[0].value = index < 0 ? '' : String(index); }
      else if (hubFormBoolean(field)) list[0].checked = value === true;
      else list[0].value = value === undefined || value === null ? '' : String(value);
    }
    // Browser color/range controls canonicalize blank and invalid initial values.
    update();
  }
  function clearErrors() { for (const [id, error] of errors) { error.hidden = true; error.textContent = ''; for (const control of controls.get(id)) control.removeAttribute('aria-invalid'); } }
  function update() {
    if (destroyed) return;
    const current = getValues();
    for (const field of fields.values()) {
      const visible = hubFormVisible(field, fields, current);
      rows.get(field.id).hidden = !visible;
      for (const control of controls.get(field.id)) {
        control.disabled = busy || !visible || (field.readOnly && (hubFormBoolean(field) || ['select', 'radio', 'range', 'color'].includes(field.type)));
        if (field.type === 'toggle') control.setAttribute('aria-checked', String(control.checked));
      }
    }
    for (const node of buttons) node.disabled = busy;
    save.disabled = busy || !isDirty();
  }
  async function invoke(callback, restoreFocus = false) {
    if (destroyed || busy || typeof callback !== 'function') return;
    const origin = restoreFocus ? document.activeElement : null;
    busy = true; update();
    try { await callback(); } catch (_) { if (!destroyed) { status.textContent = 'Unable to complete this action.'; status.hidden = false; } }
    finally {
      busy = false; update();
      // A reset confirmation removes its focused button while the form is busy.
      if (!destroyed && origin?.isConnected && document.activeElement === document.body) origin.focus({ preventScroll: true });
    }
  }
  function setValues(next, settings = {}) {
    if (destroyed || (isDirty() && !settings.force)) return false;
    baseline = hubFormValues(page, next); write(baseline); baseline = getValues(); clearErrors(); status.hidden = true; update(); return true;
  }
  function resetDefaults() {
    if (destroyed) return;
    const next = getValues();
    for (const field of fields.values()) if (!hubFormSecret(field) && !field.readOnly && hubFormOwn(field, 'default')) next[field.id] = field.default;
    write(next); clearErrors(); status.hidden = true; update();
  }
  listen(element, 'submit', event => {
    event.preventDefault();
    if (busy || destroyed) return;
    clearErrors();
    const submitted = getValues();
    const validation = validateHubSettings(page, { ...submitted, ...getSecretValues() });
    if (!validation.ok) {
      for (const [id, message] of Object.entries(validation.errors)) { const error = errors.get(id); error.textContent = message; error.hidden = false; for (const control of controls.get(id)) control.setAttribute('aria-invalid', 'true'); }
      controls.get(Object.keys(validation.errors)[0])[0].focus(); return;
    }
    if (typeof options.onSave !== 'function') return;
    invoke(async () => {
      const result = await options.onSave(validation.values);
      if (result === false || destroyed) return;
      if (result && typeof result === 'object' && result.values && typeof result.values === 'object' && !Array.isArray(result.values)) {
        write(hubFormValues(page, { ...submitted, ...result.values }));
        baseline = getValues();
      } else baseline = submitted;
      for (const field of fields.values()) if (hubFormSecret(field)) controls.get(field.id)[0].value = '';
      status.textContent = 'Settings saved.'; status.hidden = false;
    });
  });
  write(baseline); baseline = getValues(); update();
  function destroy() {
    if (destroyed) return;
    for (const field of fields.values()) if (hubFormSecret(field)) controls.get(field.id)[0].value = '';
    destroyed = true; for (const dispose of listeners.splice(0)) dispose();
    element.remove(); controls.clear(); rows.clear(); errors.clear(); fields.clear(); baseline = {}; options = {};
  }
  return { element, getValues, getSecretValues, isDirty, setValues, resetDefaults, destroy };
}

module.exports = { normalizeHubPage, validateHubSettings, renderHubForm };
