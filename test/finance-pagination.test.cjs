const assert = require('node:assert/strict');
const { fn } = require('./armory-categories.test.cjs');
const { page, state } = new Function(fn('financePage')+'\nconst _financePages={ocs:0,paid:0,unpaid:0}; return {page:financePage,state:_financePages};')();
const rows=Array.from({length:251},(_,id)=>({id,money:100}));
for(const key of ['ocs','paid','unpaid']) {
  const seen=[];
  for(let i=0;i<6;i++) {
    state[key]=i;
    const result=page(rows,key);
    assert.ok(result.rows.length<=50);
    seen.push(...result.rows.map(row=>row.id));
  }
  assert.deepEqual(seen,rows.map(row=>row.id),'Every record remains reachable exactly once');
  state[key]=100;
  assert.equal(page(rows,key).rows.length,1,'Page clamps when results shrink');
  assert.deepEqual(page([],key).rows,[]);
}
assert.equal(rows.length,251,'Pagination never truncates calculation/export inputs');
assert.equal(rows.reduce((total,row)=>total+row.money,0),25100);
console.log('Finance pagination: complete history, independent pages, bounded rows, empty results and untouched totals.');
