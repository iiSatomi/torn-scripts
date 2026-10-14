// Public appearance only. No script data or credential values enter this module.
function normalizeScriptUiPresets(raw, normalize) {
  if (!Array.isArray(raw)) return [];
  const result = [], names = new Set();
  for (const entry of raw.slice(0, 100)) {
    if (!entry || typeof entry.name !== 'string' || !entry.theme || typeof entry.theme !== 'object' || Array.isArray(entry.theme)) continue;
    const name = entry.name.trim().slice(0, 40);
    if (!name || names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase()); result.push({ name, theme: normalize(entry.theme) });
    if (result.length === 12) break;
  }
  return result;
}
function exportScriptUiTheme(theme, normalize) {
  return JSON.stringify({ kind: 'torn-script-ui-theme', version: 1, theme: normalize(theme) }, null, 2);
}
function importScriptUiTheme(text, normalize) {
  if (typeof text !== 'string' || text.length > 32768) throw new TypeError('Choose an appearance file smaller than 32 KiB.');
  const raw = JSON.parse(text);
  if (raw?.kind !== 'torn-script-ui-theme' || raw.version !== 1 || !raw.theme || typeof raw.theme !== 'object' || Array.isArray(raw.theme)) throw new TypeError('Unsupported appearance file.');
  return normalize(raw.theme);
}
function renderHubThemes(config) {
  const { doc, win, normalize, resolve } = config;
  const copy = value => JSON.parse(JSON.stringify(value));
  const element = (tag, cls, text) => { const node = doc.createElement(tag); node.className = cls || ''; if (text !== undefined) node.textContent = text; return node; };
  const form = element('form', 'tsh-themes tsui-theme-editor');
  let baseline = normalize(config.value), draft = copy(baseline);
  let inherited=config.inherit===true, baselineInherited=inherited;
  let presets = normalizeScriptUiPresets(config.presets, normalize), savedPresets = copy(presets);
  let dead = false, busy = false, sequence = 0, saveSequence = 0;
  const urls = new Map(), disposers = [];
  const listen = (target, type, callback) => { target.addEventListener(type, callback); disposers.push(() => target.removeEventListener(type, callback)); };
  const button = (label, cls, callback) => { const node = element('button', cls, label); node.type = 'button'; listen(node, 'click', callback); return node; };
  const names = { frostbite: 'Frostbite', workbench: 'Workbench', torn: 'Torn native' };
  const roles = { background: 'Background', surface: 'Panels', raised: 'Headers and controls', text: 'Text', muted: 'Secondary text', border: 'Borders', accent: 'Accent', focus: 'Focus outline', selection: 'Selection', success: 'Success', warning: 'Warning', error: 'Error', chart1: 'Chart color 1', chart2: 'Chart color 2', chart3: 'Chart color 3', chart4: 'Chart color 4', chart5: 'Chart color 5', chart6: 'Chart color 6' };
  const heading = element('h3', '', 'Themes'), subtitle = element('p', 'tsh-subtitle', 'Preview your appearance. Save to apply it to scripts using the shared UI.');
  const status = element('p', 'tsh-theme-message'); status.setAttribute('role', 'status');
  const dirtyState = element('span', 'tsh-theme-dirty'); dirtyState.setAttribute('aria-live', 'polite');
  const contrast = element('p', 'tsh-theme-contrast'); contrast.setAttribute('aria-live', 'polite');
  form.append(heading, subtitle);
  let follow=null;
  if(typeof config.inherit==='boolean'){
    const label=element('label','tsh-theme-follow');follow=element('input');follow.type='checkbox';follow.checked=inherited;label.append(follow,doc.createTextNode(' Follow Hub appearance'));form.append(label);
    listen(follow,'change',()=>{inherited=follow.checked;if(inherited)draft=normalize(config.inheritedTheme||{});sync();preview();});
  }
  const dark = () => draft.mode === 'dark' || (draft.mode === 'system' && !!win.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const isDirty = () => inherited!==baselineInherited||JSON.stringify(draft) !== JSON.stringify(baseline) || JSON.stringify(presets) !== JSON.stringify(savedPresets);
  function preview() {
    if (dead) return;
    config.onPreview(copy(draft));
    dirtyState.textContent = isDirty() ? 'Unsaved preview' : 'Saved appearance';
    const value = resolve(draft, dark());
    const minimum = Math.min(value.contrast.text, value.contrast.muted);
    contrast.textContent = (minimum < 4.5 ? 'Low panel text contrast: ' : 'Panel text contrast: ') + minimum.toFixed(1) + ':1. Aim for at least 4.5:1.';
    status.textContent = '';
  }
  function select(label, values, value, change, cls) {
    const field = element('label', 'tsh-theme-field', label), input = element('select', cls);
    input.setAttribute('aria-label', label);
    for (const [key, text] of values) { const option = element('option', '', text); option.value = key; input.append(option); }
    if(!values.some(([key])=>String(key)===String(value))){const option=element('option','','Custom ('+value+')');option.value=String(value);input.append(option);}
    input.value = String(value); field.append(input); listen(input, 'change', () => { change(input.value); preview(); }); return field;
  }
  const layoutSection = element('section', 'tsh-theme-section'); layoutSection.append(element('h4', '', 'Layout style'));
  const layouts = element('div', 'tsh-theme-layouts'), layoutButtons = new Map();
  for (const [id, label] of Object.entries(names)) {
    const pick = button('', 'tsh-theme-layout', () => { draft.layout = id; syncLayout(); preview(); });
    pick.dataset.layout = id;
    const diagram = element('span', 'tsh-theme-diagram'); diagram.setAttribute('aria-hidden', 'true'); diagram.append(element('span'), element('span'), element('span'));
    pick.append(diagram, element('strong', '', label), element('small', '', id === 'frostbite' ? 'Navigation rail' : id === 'workbench' ? 'Tabs and inspector' : 'Compact tabs'));
    layoutButtons.set(id, pick); layouts.append(pick);
  }
  function syncLayout() { for (const [id, node] of layoutButtons) node.setAttribute('aria-pressed', String(draft.layout === id)); }
  layoutSection.append(layouts);
  const choices = element('div', 'tsh-theme-fields');
  const palette = select('Color palette', Object.entries(names), draft.palette, value => { draft.palette = value; syncColors(); }, 'tsh-theme-palette');
  const mode = select('Appearance', [['system', 'Follow device'], ['dark', 'Dark'], ['light', 'Light']], draft.mode, value => { draft.mode = value; syncColors(); }, 'tsh-theme-mode');
  choices.append(palette, mode); layoutSection.append(choices); form.append(layoutSection);
  const colorSection = element('section', 'tsh-theme-section'); colorSection.append(element('h4', '', 'Custom colors'));
  const colorMode = element('p', 'tsh-subtitle'); colorSection.append(colorMode);
  const basicColors = element('div', 'tsh-theme-colors'), advanced = element('details', 'tsh-theme-advanced'), advancedColors = element('div', 'tsh-theme-colors');
  advanced.append(element('summary', '', 'Status and chart colors'), advancedColors);
  const colorInputs = new Map();
  for (const [role, label] of Object.entries(roles)) {
    const field = element('div', 'tsh-theme-color'), colorLabel=element('label'), input = element('input'), body = element('span', '', label), hex = element('code');
    input.type = 'color'; input.dataset.colorRole = role; input.setAttribute('aria-label', label + ' color'); body.append(hex); colorLabel.append(input, body);field.append(colorLabel);
    const reset=button('↺','tsh-theme-color-reset',()=>{delete draft.colors[dark()?'dark':'light'][role];syncColors();preview();});reset.setAttribute('aria-label','Reset '+label.toLowerCase()+' color');field.append(reset);
    listen(input, 'input', () => { draft.colors[dark() ? 'dark' : 'light'][role] = input.value; hex.textContent = input.value.toUpperCase(); preview(); });
    colorInputs.set(role, { input, hex }); (['success', 'warning', 'error'].includes(role) || role.startsWith('chart') ? advancedColors : basicColors).append(field);
  }
  colorSection.append(basicColors, advanced, contrast); form.append(colorSection);
  function syncColors() {
    const values = resolve(draft, dark()).colors;
    colorMode.textContent = (dark() ? 'Dark' : 'Light') + ' colors. Your other appearance keeps its own overrides.';
    for (const [role, controls] of colorInputs) { controls.input.value = values[role]; controls.hex.textContent = values[role].toUpperCase(); }
  }
  const details = element('details', 'tsh-theme-advanced'); details.append(element('summary', '', 'Spacing and shape'));
  const shape = element('div', 'tsh-theme-fields');
  const density = select('Spacing', [['comfortable', 'Comfortable'], ['compact', 'Compact']], draft.density, value => { draft.density = value; });
  const radius = select('Window corners', [['auto', 'Follow layout'], ['0', 'Square'], ['6', 'Subtle'], ['12', 'Rounded'], ['18', 'Very rounded']], draft.radius ?? 'auto', value => { draft.radius = value === 'auto' ? null : Number(value); });
  const scale = element('label', 'tsh-theme-field', 'Text size'), scaleInput = element('input'); scaleInput.type = 'range'; scaleInput.min = '85'; scaleInput.max = '135'; scaleInput.step = '5'; scaleInput.value = String(draft.fontScale * 100); scaleInput.setAttribute('aria-label', 'Text size');
  const scaleValue = element('span', '', Math.round(draft.fontScale * 100) + '%'); scale.append(scaleInput, scaleValue);
  listen(scaleInput, 'input', () => { draft.fontScale = Number(scaleInput.value) / 100; scaleValue.textContent = scaleInput.value + '%'; preview(); });
  shape.append(density, radius, scale); details.append(shape); form.append(details);
  const library = element('details', 'tsh-theme-advanced'); library.append(element('summary', '', 'Saved themes and transfer'));
  if(follow)library.firstChild.textContent='Appearance transfer';
  const presetName = element('input', 'tsh-theme-preset-name'); presetName.type = 'text'; presetName.maxLength = 40; presetName.placeholder = 'Name your theme'; presetName.setAttribute('aria-label', 'Custom theme name');
  const presetSelect = element('select', 'tsh-theme-presets'); presetSelect.setAttribute('aria-label', 'Saved custom themes');
  function syncPresets() { presetSelect.replaceChildren(element('option', '', 'Choose a saved theme')); presetSelect.firstChild.value = ''; for (const [i, entry] of presets.entries()) { const option = element('option', '', entry.name); option.value = String(i); presetSelect.append(option); } }
  const presetActions = element('div', 'tsh-theme-transfer');
  presetActions.append(presetName, button('Save as preset', '', () => {
    const name = presetName.value.trim(); if (!name) { status.textContent = 'Enter a theme name.'; presetName.focus(); return; }
    if (presets.some(entry => entry.name.toLowerCase() === name.toLowerCase())) { status.textContent = 'That name is already used. Choose another name to keep both themes.'; return; }
    if (presets.length >= 12) { status.textContent = 'You can keep up to 12 custom themes. Delete one first.'; return; }
    presets.push({ name, theme: copy(draft) }); presetName.value = ''; syncPresets(); preview();
  }), presetSelect, button('Load preset', '', () => { const entry = presets[Number(presetSelect.value)]; if (presetSelect.value !== '' && entry) { draft = copy(entry.theme); sync(); preview(); } }), button('Delete preset', '', () => { if (presetSelect.value !== '') { presets.splice(Number(presetSelect.value), 1); syncPresets(); preview(); } }));
  presetActions.hidden=!!follow;
  const transfer = element('div', 'tsh-theme-transfer');
  transfer.append(button('Export theme', '', () => {
    const blob = new win.Blob([exportScriptUiTheme(draft, normalize)], { type: 'application/json' });
    const url = win.URL.createObjectURL(blob), link = element('a'); link.href = url; link.download = 'torn-script-ui-theme.json'; link.click();
    urls.set(url, win.setTimeout(() => { win.URL.revokeObjectURL(url); urls.delete(url); }, 1000));
  }));
  const importInput = element('input', 'tsh-theme-import'); importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.setAttribute('aria-label', 'Import theme');
  listen(importInput, 'change', async () => {
    if(busy){importInput.value='';return;}
    const request = ++sequence, file = importInput.files?.[0],signature=JSON.stringify(draft); importInput.value = ''; if (!file) return;
    try { if (file.size > 32768) throw new Error(); const text = await file.text(); if (dead || request !== sequence) return;if(signature!==JSON.stringify(draft)){status.textContent='Import cancelled because the preview changed.';return;} draft = importScriptUiTheme(text, normalize); sync(); preview(); status.textContent = 'Theme imported into the preview. Save to keep it.'; }
    catch (_) { if (!dead && request === sequence) status.textContent = 'Choose a valid appearance file smaller than 32 KiB.'; }
  }); transfer.append(importInput); library.append(presetActions, transfer); form.append(library);
  const actions = element('div', 'tsh-theme-actions');
  const save = button('Save theme', 'tsh-theme-save', async () => {
    if (dead || busy) return; busy = true; save.disabled = true;importInput.disabled=true;sequence++;
    const candidate = copy(draft), candidatePresets = copy(presets),candidateInherited=inherited, token = ++saveSequence;
    try {
      const success = await config.onSave(candidate, candidatePresets,{inherit:candidateInherited});
      if (dead || token !== saveSequence) return;
      if (success === false) { status.textContent = 'Theme could not be saved. Your preview is retained; try again.'; return; }
      baseline = candidate; savedPresets = candidatePresets;baselineInherited=candidateInherited;
      dirtyState.textContent = isDirty() ? 'Unsaved preview' : 'Saved appearance'; status.textContent = 'Theme saved.';
    } catch (error) { if (!dead && token === saveSequence) status.textContent = error?.code==='UI_APPEARANCE_CONFLICT'?'Appearance changed elsewhere. Reopen this page before saving.':'Theme could not be saved. Your preview is retained; try again.'; }
    finally { if (!dead) { busy = false; save.disabled = false;importInput.disabled=inherited&&!!follow; } }
  });
  actions.append(dirtyState, button('Reset colors', 'tsh-theme-reset', () => { draft.colors = { light: {}, dark: {} }; syncColors(); preview(); }), button('Cancel', 'tsh-theme-cancel', () => { if (busy) return;sequence++; draft = copy(baseline); presets = copy(savedPresets);inherited=baselineInherited; sync(); preview(); status.textContent = 'Saved appearance restored.'; }), save); form.append(status, actions);
  function sync() { syncLayout(); palette.querySelector('select').value = draft.palette; mode.querySelector('select').value = draft.mode; density.querySelector('select').value = draft.density; radius.querySelector('select').value = String(draft.radius ?? 'auto'); scaleInput.value = String(draft.fontScale * 100); scaleValue.textContent = Math.round(draft.fontScale * 100) + '%'; syncColors(); syncPresets();if(follow){follow.checked=inherited;for(const input of form.querySelectorAll('input,select,button'))if(input!==follow&&!input.classList.contains('tsh-theme-save')&&!input.classList.contains('tsh-theme-cancel'))input.disabled=inherited;} }
  listen(form, 'submit', event => event.preventDefault());
  const media = win.matchMedia?.('(prefers-color-scheme: dark)'); if (media?.addEventListener) listen(media, 'change', () => { if (draft.mode === 'system') { syncColors(); preview(); } });
  sync(); preview();
  return { element: form, isDirty, getValues: () => copy(draft), destroy() { if (dead) return; dead = true; sequence++;saveSequence++; for (const dispose of disposers) dispose(); for (const [url, timer] of urls) { win.clearTimeout(timer); win.URL.revokeObjectURL(url); } urls.clear(); config.onPreview(copy(baseline)); } };
}
module.exports = { normalizeScriptUiPresets, exportScriptUiTheme, importScriptUiTheme, renderHubThemes };
