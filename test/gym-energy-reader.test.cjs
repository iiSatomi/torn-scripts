const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('Torn Gym Planner-3.36.txt', 'utf8');
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `source should contain ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`could not extract ${name}`);
}

function readPair(text, firstSelectorMatches = false, energyContext = true) {
  const node = {
    hidden: false,
    textContent: text,
    innerText: text,
    getClientRects: () => [1],
    closest: () => (energyContext ? {} : null),
  };
  const wrap = { contains: () => false };
  const document = {
    querySelectorAll: selector => selector.includes('bar-value') ? (firstSelectorMatches ? [node] : []) : [node],
  };
  const isRendered = value => !!value && !value.hidden && value.getClientRects().length > 0;
  const walk = () => null;
  const reader = new Function('document', 'wrap', 'isRenderedPageNode', 'walkPageText',
    `${extractFunction('readEnergyPairFromPageUncached')}
     return readEnergyPairFromPageUncached;`)(document, wrap, isRendered, walk);
  return reader();
}

assert.deepEqual(readPair('Energy: 250/150'), { current: 250, cap: 150 },
  'desktop reader should retain energy above the natural cap');
assert.deepEqual(readPair('140 / 150', true), { current: 140, cap: 150 },
  'PDA bar reader should return current and cap');
assert.deepEqual(readPair('5000 / 5000', true, false), { current: null, cap: null },
  'a non-energy bar must not be mistaken for energy');

console.log('Gym energy reader behavior checks passed');
