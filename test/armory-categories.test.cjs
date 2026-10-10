const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname,'../Torn_OC_Suite_Codex.user.js'),'utf8');
function fn(name) {
  const start = source.search(new RegExp('^  (?:async )?function '+name+'\\(', 'm'));
  assert.ok(start>=0, name+' exists');
  return source.slice(start,source.indexOf('\n  }',start)+4);
}
const catsStart=source.indexOf('  const ARMORY_CATS =');
const cats=source.slice(catsStart,source.indexOf('\n  };',catsStart)+5);
function make(extra='') {return new Function(cats+'\n'+fn('catOfItemType')+'\n'+fn('parseArmoryCategory')+'\n'+extra+'\nreturn {catOfItemType,parseArmoryCategory,ARMORY_CATS};')();}
const {catOfItemType:category,parseArmoryCategory:parse}=make();
const cases=[['Medical','medical'],[{name:'Medical'},'medical'],['Candy','consumables'],['Alcohol','consumables'],['Energy Drink','consumables'],['Booster','boosters'],['Drug','drugs'],['Defensive','armor'],['Armour','armor'],['Weapon','weapons'],['Primary','weapons'],['Secondary','weapons'],['Melee','weapons'],['Temporary','temporary'],['Tool','utilities'],['Material','utilities'],['Enhancer','utilities'],['New unidentified type',null],['',null]];
for(const [input,want]of cases)assert.equal(category(input),want,JSON.stringify(input));
const result=parse({medical:[{ID:101,name:'Fixture medical',quantity:9,loaned:2,loaned_to:'10,20'},{ID:102,name:'Explicit zero',quantity:9,available:0},{ID:103,name:'Invalid stock',available:-3}]},['medical']);
assert.equal(result.armory['101'],7,'quantity minus explicit loan count is available stock');
assert.equal(result.armory['102'],0,'explicit zero overrides quantity');
assert.equal(result.armory['103'],0,'negative stock cannot enable a loan');
assert.equal(category(result.itemTypes['101']),'medical','response category survives missing catalog metadata');
assert.deepEqual(result.loanedOut.map(l=>l.uid),['10','20']);
assert.equal(parse({medical:[{ID:3,quantity:8,loaned_to:'12'}]},['medical']).armory['3'],0,'unknown loan quantities must not be offered as stock');
const arrays=parse({utilities:{a:{id:4,available:2,loaned_to:[10,20,10]},b:{id:4,available:1,loaned_to:'30'}}},['utilities']);
assert.equal(arrays.armory['4'],3);
assert.deepEqual(arrays.loanedOut.map(l=>l.uid),['10','20','30']);
console.log('Armory categories: type mappings, medical stock, conservative availability, metadata and holder normalization passed.');
module.exports={fn,cats,source};
