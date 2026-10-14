// Script-owned harmless settings: no duplicate store, arbitrary actions or keys.
function createHubScriptSettings(pages, readValues, applyValues, credentialClient, onSharedCredentialChange, saveSecrets) {
  const schemas=new Map(pages.map(page=>{const schema=normalizeHubPage(page);return[schema.id,schema];}));
  const snapshots=new Map();
  const writes=new Map();
  function schema(id){const page=schemas.get(id);if(!page)throw new Error('Unsupported settings page.');return page;}
  async function readSettings(id){
    schema(id);const values=await readValues(id);const serialized=JSON.stringify(values);
    const prior=snapshots.get(id), revision=prior?.serialized===serialized?prior.revision:(prior?.revision||0)+1;
    snapshots.set(id,{serialized,revision});return{values,revision:'settings-'+revision};
  }
  return {
    describePage:id=>schema(id),readSettings,
    saveSettings(id,patch,revision){
      const write=(writes.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
      const current=await readSettings(id);if(current.revision!==revision)throw new Error('Settings changed.');
      const page=schema(id), allowed=page.sections.flatMap(section=>section.fields).filter(field=>!field.readOnly&&!['secret','password'].includes(field.type));
      if(Object.keys(patch).some(id=>!allowed.some(field=>field.id===id)))throw new Error('Unsupported setting.');
      const result=validateHubSettings(page,{...current.values,...patch});if(!result.ok)throw new Error('Invalid setting.');
      await applyValues(id,result.values);return readSettings(id);
      });
      writes.set(id,write);write.finally(()=>{if(writes.get(id)===write)writes.delete(id);}).catch(()=>{});return write;
    },
    credentialClient,onSharedCredentialChange,
    ...(saveSecrets?{saveSecrets}:{}),
  };
}
module.exports = { createHubScriptSettings };
