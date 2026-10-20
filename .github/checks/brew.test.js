'use strict';

const { test }=require('node:test');
const assert=require('node:assert/strict');
const { Pool }=require('pg');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const { once }=require('node:events');
const { initializeBrew }=require('../../src/DB/Initialization/brew');
const { defaults,validateConfig }=require('../../src/lib/brew/config');
const { probabilities,sample }=require('../../src/lib/brew/probabilities');
const { createBrewService }=require('../../src/lib/brew/service');
const { createAuthService,nonce,hash }=require('../../src/lib/brew/auth');
const { createApp }=require('../../web/app');

const clone=value=>JSON.parse(JSON.stringify(value));
const identity=id=>({id:String(id),login:'viewer'+id,displayName:'Viewer '+id});
let serial=0;
async function database(run){
  require('dotenv').config();
  const connection={host:process.env.COUNTER_TEST_HOST || '127.0.0.1',port:Number(process.env.DB_PORT || 5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME};
  const admin=new Pool(connection),schema='brew_ci_'+process.pid+'_'+Date.now()+'_'+serial++;
  await admin.query('CREATE SCHEMA '+schema);
  const pool=new Pool({...connection,options:'-c search_path='+schema,max:8});
  try{await initializeBrew(pool);await run(pool);}
  finally{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
}
const integration={skip:!process.env.COUNTER_TEST_DB,timeout:60000};

test('Brew probabilities follow five-core, mixed-rarity and extra-bonus rules',()=>{
  const cores=rarity=>Array.from({length:5},()=>({rarity}));
  assert.deepEqual(probabilities(cores(2),[],defaults),[0,0,75,20,5,0]);
  assert.deepEqual(probabilities(cores(4),[],defaults),[0,0,0,0,90,10]);
  assert.deepEqual(probabilities(cores(4),[{item_id:'sugar',rarity:0}],defaults),[0,0,0,10,80,10]);
  assert.deepEqual(probabilities(cores(4),[{item_id:'sugar',rarity:4}],defaults),[0,0,0,0,80,20]);
  assert.deepEqual(probabilities(cores(4),['sugar','syrup','vanilla'].map(item_id=>({item_id,rarity:4})),defaults),[0,0,0,0,60,40]);
  const mixed=probabilities([...cores(4).slice(0,4),{rarity:0}],[],defaults);
  assert.equal(mixed[5],0);
  assert.equal(mixed.reduce((a,b)=>a+b,0),100);
  assert.throws(()=>probabilities(cores(1).slice(0,4),[],defaults),/five/);
  assert.equal(sample([0,0,75,20,5,0],()=>0),2);
  assert.equal(sample([0,0,75,20,5,0],()=>0.99),4);
  assert.throws(()=>sample([1],()=>1),/random/);
  const bad=clone(defaults);bad.probabilities.base[2][2]=74;
  assert.throws(()=>validateConfig(bad),/configuration/);
  const badStack=clone(defaults);badStack.inventory.stackSize=0;
  assert.throws(()=>validateConfig(badStack),/configuration/);
});

test('Brew starter grants, idempotency, concurrency and stale previews are transactional',integration,async()=>{
  await database(async pool=>{
    const service=createBrewService(pool,()=>0.9),user=identity(1);
    await Promise.all(Array.from({length:5},()=>service.inventory(user)));
    const initial=await service.inventory(user);
    assert.equal(initial.slots.length,9);
    assert.equal(initial.slots.reduce((n,s)=>n+s.quantity,0),45);
    assert.equal((await pool.query("SELECT count(*) FROM brew_events WHERE type='starter'")).rows[0].count,'1');
    const selection=['beans','filter','grinder','mug','water'].map(id=>initial.slots.find(s=>s.item_id===id).slot);
    const odds=await service.preview(user,selection);
    const result=await service.craft(user,selection,'one',odds);
    assert.equal(result.result.rarity,1);
    assert.equal((await service.craft(user,selection,'one',odds)).replayed,true);
    await assert.rejects(service.craft(user,[...selection.slice(0,4),initial.slots.find(s=>s.item_id==='milk').slot],'one'),/another recipe/);
    await assert.rejects(service.craft(user,selection,'stale',odds),/changed/);
    await assert.rejects(service.preview(user,[0,0,1,2,3]),/different/);
    await assert.rejects(service.preview(user,[...selection,initial.slots.find(s=>s.item_id==='milk').slot]),/exactly one Liquid/);
    const outcomes=await Promise.allSettled(Array.from({length:12},(_,n)=>service.craft(user,selection,'race:'+n)));
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,4);
    assert.equal((await pool.query('SELECT count(*) FROM brew_crafts')).rows[0].count,'5');
    assert.equal((await pool.query('SELECT count(*) FROM brew_inventory WHERE quantity<=0')).rows[0].count,'0');
    const before=(await pool.query('SELECT sum(quantity)::int AS n FROM brew_inventory')).rows[0].n;
    await assert.rejects(service.craft(user,selection,'exhausted'),/no longer available/);
    assert.equal((await pool.query('SELECT sum(quantity)::int AS n FROM brew_inventory')).rows[0].n,before);
  });
});

test('Brew full-inventory crafting rolls back and full drop recipients are rerolled',integration,async()=>{
  await database(async pool=>{
    const config=clone(defaults);config.inventory={rows:1,columns:9,stackSize:128};
    config.drops.itemWeights={beans:1};config.drops.rarityWeights=[0,0,1,0,0];
    await pool.query('UPDATE brew_config SET settings=$1::jsonb',[JSON.stringify(config)]);
    const service=createBrewService(pool,()=>0);
    await service.inventory(identity(1));await service.inventory(identity(2));await service.inventory(identity(3));
    await pool.query("UPDATE brew_players SET is_bot=TRUE WHERE user_id='3'");
    const before=(await service.inventory(identity(1))).slots;
    await assert.rejects(service.craft(identity(1),['beans','filter','grinder','mug','water'].map(id=>before.find(s=>s.item_id===id).slot),'full'),/full/);
    assert.deepEqual((await service.inventory(identity(1))).slots,before);
    await pool.query("DELETE FROM brew_inventory WHERE user_id='2' AND slot=8");
    assert.equal(await service.due(),false);
    await pool.query("UPDATE brew_drop_clock SET next_drop_at=NOW()-INTERVAL '1 second'");
    const awarded=await service.drop([identity(3),identity(1),identity(2),{id:'4',login:'nightbot'}],'999');
    assert.equal(awarded.userId,'2');
    assert.equal(awarded.itemId,'beans');
    assert.equal(awarded.rarity,2);
    assert.equal((await pool.query("SELECT count(*) FROM brew_events WHERE type='drop_rerolled'")).rows[0].count,'1');
    assert.equal((await service.drop([identity(2)],'999')).skipped,'not_due');
    assert.equal((await pool.query("SELECT count(*) FROM brew_events WHERE type='drop'")).rows[0].count,'1');
  });
});

test('Brew OAuth, session ownership, CSRF and administrator permissions',integration,async()=>{
  await database(async pool=>{
    const service=createBrewService(pool,()=>0),directory=fs.mkdtempSync(path.join(os.tmpdir(),'brew-auth-'));
    let account='1';
    const options={
      publicUrl:'https://brew.lobby34.eu',clientId:'test-client',clientSecret:'test-secret',adminIds:['1'],botUserId:'999',botTokenFile:path.join(directory,'bot.json'),
      fetch:async url=>({ok:true,json:async()=>url.includes('/token')?{access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,scope:[]}:url.includes('/validate')?{client_id:'test-client',user_id:account,scopes:[]}: {data:[{id:account,login:'viewer'+account,display_name:'Viewer '+account}]} }),
    };
    const auth=createAuthService(pool,service,options);
    async function login(){
      const browser=nonce(),url=await auth.begin(browser),state=new URL(url).searchParams.get('state');
      await assert.rejects(auth.finish(state,'wrong-browser','code'),/state/);
      const result=await auth.finish(state,browser,'code');
      await assert.rejects(auth.finish(state,browser,'code'),/state/);
      return result;
    }
    const owner=await login();account='2';const viewer=await login();
    assert.notEqual((await pool.query('SELECT session_hash FROM brew_sessions LIMIT 1')).rows[0].session_hash,owner.session);
    const session=await auth.session(viewer.session);assert.equal(session.identity.id,'2');assert.equal(session.isAdmin,false);
    const app=createApp({pool,service,auth,publicUrl:options.publicUrl}),server=app.listen(0,'127.0.0.1');
    await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port;
    const headers={Cookie:'__Host-brew_session='+viewer.session,Origin:options.publicUrl,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'};
    try{
      assert.equal((await fetch(base+'/api/inventory')).status,401);
      assert.equal((await fetch(base+'/api/admin/config',{headers})).status,403);
      const inventory=await (await fetch(base+'/api/inventory?userId=1',{headers})).json();
      assert.equal(inventory.userId,'2');
      const selected=['beans','filter','grinder','mug','water'].map(id=>inventory.slots.find(s=>s.item_id===id).slot);
      const preview=await (await fetch(base+'/api/preview',{method:'POST',headers,body:JSON.stringify({slots:selected,userId:'1'})})).json();
      const craftBody={...preview,slots:selected,requestId:'web-craft',userId:'1'};
      assert.equal((await fetch(base+'/api/craft',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:JSON.stringify(craftBody)})).status,403);
      assert.equal((await fetch(base+'/api/craft',{method:'POST',headers:{...headers,'X-CSRF-Token':''},body:JSON.stringify(craftBody)})).status,403);
      const crafted=await (await fetch(base+'/api/craft',{method:'POST',headers,body:JSON.stringify(craftBody)})).json();
      assert.equal(crafted.inventory.userId,'2');
      assert.equal((await service.inventory(identity(1))).slots.find(s=>s.item_id==='beans').quantity,5);
      const botBrowser=nonce(),botUrl=await auth.begin(botBrowser,'bot','1');
      await assert.rejects(auth.finish(new URL(botUrl).searchParams.get('state'),botBrowser,'code'),/coffee_botted/);
      assert.equal(fs.existsSync(options.botTokenFile),false);
      await auth.logout(viewer.session);assert.equal(await auth.session(viewer.session),null);
    } finally {
      await new Promise(resolve=>server.close(resolve));
      fs.rmSync(directory,{recursive:true,force:true});
    }
  });
});


test('Brew inventory moves preserve stacks, swap occupied slots and reject stale writes',integration,async()=>{
  await database(async pool=>{
    const service=createBrewService(pool),user=identity(41),other=identity(42);
    const initial=await service.inventory(user);
    const moved=await service.move(user,0,99,initial.version);
    assert.equal(moved.slots.find(s=>s.slot===99).item_id,initial.slots.find(s=>s.slot===0).item_id);
    assert.equal(moved.slots.some(s=>s.slot===0),false);
    await assert.rejects(service.move(user,99,0,initial.version),/changed/);
    const swapped=await service.move(user,99,1,moved.version);
    assert.equal(swapped.slots.find(s=>s.slot===1).item_id,initial.slots.find(s=>s.slot===0).item_id);
    assert.equal(swapped.slots.find(s=>s.slot===99).item_id,initial.slots.find(s=>s.slot===1).item_id);
    assert.equal(swapped.slots.reduce((n,s)=>n+s.quantity,0),45);
    await assert.rejects(service.move(user,1,100,swapped.version),/Invalid/);
    const parallel=await Promise.allSettled([service.move(user,1,50,swapped.version),service.move(user,1,51,swapped.version)]);
    assert.equal(parallel.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await service.inventory(other)).slots.find(s=>s.slot===0).item_id,initial.slots.find(s=>s.slot===0).item_id);
  });
});
