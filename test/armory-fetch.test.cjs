const assert=require('node:assert/strict');
const {fn,cats}=require('./armory-categories.test.cjs');
(async()=>{
 const requests=[];
 const data={medical:[{ID:101,name:'Ipecac Syrup',quantity:4,available:3,loaned:1,loaned_to:'123'}],armor:[{ID:102,name:'Construction Helmet',available:1,loaned_to:'124'}],utilities:[{ID:103,name:'Lockpicks',available:5}],boosters:[{ID:104,name:'Fixture candy',type:'Candy',available:2}]};
 const fetchAll=new Function('apiFetch','apiFetchV1','GM_getValue','GM_setValue','GMK','syncPayoutEvents','window',cats+'\n'+['catOfItemType','parseArmoryCategory','parseArmoryInventory','fetchAll'].map(fn).join('\n')+'\nreturn fetchAll;')(
  async path=>path.includes('members')?{members:{}}:{crimes:{}},
  async path=>{requests.push(path);return data;},(_,fallback)=>fallback,()=>{},{},()=>{},{}) ;
 const result=await fetchAll('fixture-not-a-real-key');
 assert.equal(requests.length,1,'All categories are one request, not one request per item/category');
 assert.deepEqual(new URL('https://fixture.invalid'+requests[0]).searchParams.get('selections').split(',').sort(),['armor','boosters','drugs','medical','temporary','utilities','weapons']);
 assert.equal(result.armory['101'],3,'Medical stock is present without an active medical OC');
 assert.equal(result.loanedOut.find(l=>l.itemId==='101')?.uid,'123','Finished-OC medical loans remain visible');
 assert.equal(result.itemTypes['101'],'medical');
 assert.equal(result.itemTypes['104'],'consumables','Mixed booster payload routes candy to native Consumables');
 console.log('Armory fetch passed: one v1 request, no active-OC dependency, medical stock/loans and native category metadata.');
})().catch(e=>{console.error(e);process.exitCode=1;});
