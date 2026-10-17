'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function writer(){const ctx={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service/Code.gs'),'utf8'),ctx);assert.equal(typeof ctx.writeMainWarContract,'function');return ctx.writeMainWarContract;}
const record={id:'synthetic-record',ourId:11,ourName:'Own',enemyId:21,enemyName:'Enemy',hits:3,onlineWindow:'18-20',time:'19:00',warlord:'Yes',notes:'Agreed terms'};
function table(initial={},options={}){
 const values=new Map(Object.entries(initial)),formulas=new Map(Object.entries(options.formulas||{})),notes=new Map(Object.entries(options.notes||{})),writes=[],copies=[];
 let maxRows=options.maxRows||40,remaining=options.failAfter;
 const address=(r,c)=>String.fromCharCode(64+c)+r,empty=v=>v===undefined||v==='';
 const sheet={values,formulas,notes,writes,copies,getMaxRows:()=>maxRows,getLastRow:()=>Math.max(9,...[...values.keys(),...formulas.keys()].map(k=>Number(k.slice(1)))),insertRowsAfter:(r,n)=>{assert.equal(r,maxRows);maxRows+=n;},getRange(row,col,count=1,width=1){
  const matrix=fn=>Array.from({length:count},(_,i)=>Array.from({length:width},(_,j)=>fn(address(row+i,col+j))));
  return {row,col,count,width,getValues:()=>matrix(k=>values.get(k)??''),getDisplayValues:()=>matrix(k=>options.displays?.[k]??String(values.get(k)??'').replace(/^'(?=[=+\-@])/,'')),getFormulas:()=>matrix(k=>formulas.get(k)||''),getNotes:()=>matrix(k=>notes.get(k)||''),getRichTextValues:()=>matrix(()=>null),getDataValidations:()=>matrix(()=>null),setDataValidations:()=>{},copyTo:(target,o)=>{assert.equal(o.formatOnly,true);copies.push({row:target.row,col:target.col,width:target.width});},setValues(data){
   if(remaining===0){remaining=null;throw Error('Synthetic sheet outage');}
   if(Number.isInteger(remaining))remaining--;
   for(let i=0;i<count;i++)for(let j=0;j<width;j++){const k=address(row+i,col+j);assert.ok(empty(values.get(k))&&!formulas.get(k),'no manual value/formula may be overwritten: '+k);values.set(k,data[i][j]);writes.push(k);}
  }};
 }};return sheet;
}
test('fills a prelisted member row while preserving stats, notes, target 2 and existing compatible values',()=>{
 const sheet=table({D10:'Own',E10:'SYNTHETIC PRIVATE STAT',F10:'18-20'},{notes:{D10:'Keep this manual annotation'}});
 assert.equal(writer()(sheet,record),10);assert.equal(sheet.values.get('E10'),'SYNTHETIC PRIVATE STAT');assert.equal(sheet.values.get('H10'),'Enemy [21]');assert.equal(sheet.values.get('G10'),3);assert.equal(sheet.notes.get('D10'),'Keep this manual annotation');
 assert.ok(!sheet.writes.some(k=>/^[EI]/.test(k)));assert.ok(!sheet.writes.includes('D10'));assert.ok(!sheet.writes.includes('F10'));
});
test('uses an unused formatted table row and a retry writes no duplicate',()=>{
 const sheet=table({D10:'Other member',H10:'Another target'});const write=writer();assert.equal(write(sheet,record),11);const count=sheet.writes.length;assert.equal(write(sheet,record),11);assert.equal(sheet.writes.length,count);assert.equal(sheet.values.get('D10'),'Other member');
});
test('an existing exact pair in target 2 is reused without filling or changing target 1/2',()=>{
 const sheet=table({D10:'Own [11]',I10:'Enemy [21]'});assert.equal(writer()(sheet,record),10);assert.equal(sheet.values.get('H10'),undefined);assert.equal(sheet.values.get('I10'),'Enemy [21]');assert.ok(!sheet.writes.some(k=>k==='H10'||k==='I10'));
});
test('booked targets, another owned target and mismatched manual terms fail before any cell write',()=>{
 for(const initial of [{D10:'Someone',H10:'Enemy [21]'},{D10:'Own',H10:'Different target'},{D10:'Own',F10:'Different manual window'},{D10:'Own',I10:'Different target'}]){
  const sheet=table(initial);assert.throws(()=>writer()(sheet,record),e=>e.publicCode==='CONFLICT');assert.equal(sheet.writes.length,0);
 }
});
test('formula cells and annotated unused rows are not overwritten',()=>{
 const formula=table({D10:'Own'},{formulas:{J10:'=""'}});assert.throws(()=>writer()(formula,record),e=>e.publicCode==='CONFLICT');assert.equal(formula.writes.length,0);
 const annotated=table({},{notes:{D10:'Reserved manually'}});assert.equal(writer()(annotated,record),11);assert.equal(annotated.notes.get('D10'),'Reserved manually');
});
test('a partial write resumes in the same member row after an interruption',()=>{
 const sheet=table({},{failAfter:1}),write=writer();assert.throws(()=>write(sheet,record),/outage/);assert.equal(sheet.values.get('D10'),'Own [11]');assert.equal(write(sheet,record),10);assert.equal(sheet.values.get('H10'),'Enemy [21]');assert.equal([...sheet.values].filter(([k,v])=>/^D/.test(k)&&v==='Own [11]').length,1);
});
test('formula-like terms are literal and idempotent; optional blank terms preserve manual details',()=>{
 const sheet=table({D10:'Own',L10:'Keep manual note'}),write=writer();const r={...record,notes:'',time:"'=SUM(1,2)"};assert.equal(write(sheet,r),10);assert.equal(sheet.values.get('J10'),"'=SUM(1,2)");assert.equal(sheet.values.get('L10'),'Keep manual note');const count=sheet.writes.length;write(sheet,r);assert.equal(sheet.writes.length,count);
});
test('a full table extends by one row with formatting/validation only, without copying any values',()=>{
 const sheet=table({D10:'Other member',E10:'Do not copy'},{maxRows:10});assert.equal(writer()(sheet,record),11);assert.equal(sheet.getMaxRows(),11);assert.equal(sheet.values.get('E11'),undefined);assert.equal(sheet.copies.length,1);
});
test('formatted numeric hit counts retain their value and remain idempotent',()=>{
 const sheet=table({D10:'Own',G10:3},{displays:{G10:'3.00'}}),write=writer();
 assert.equal(write(sheet,record),10);const count=sheet.writes.length;assert.equal(write(sheet,record),10);assert.equal(sheet.writes.length,count);assert.ok(!sheet.writes.includes('G10'));
});
