'use strict';

const $ = id => document.getElementById(id);
const coreCategories=['beans','filter','grinder','mug','liquid'];
const categoryNames={ beans:'Coffee Beans',filter:'Filter',grinder:'Grinder',mug:'Mug',liquid:'Liquid' };
const state={ session:null,inventory:null,selected:new Map(),preview:null,previewSequence:0,busy:false,pendingCraft:null,adminConfig:null,moveMode:false,moveSource:null,dragSource:null };
const fallbackRarities=[['Common','#9ca3af'],['Uncommon','#4ade80'],['Rare','#60a5fa'],['Epic','#c084fc'],['Legendary','#facc15'],['Unique','#fb923c']].map(([name,color],id)=>({id,name,color}));
const rarities=()=>state.inventory?.rarities || fallbackRarities;
function notice(text,error=false){ $('notice').textContent=text; $('notice').classList.toggle('error',error); }
async function api(url,body){
  const response=await fetch(url,{
    method:body===undefined?'GET':'POST',
    credentials:'same-origin',
    headers:body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':state.session?.csrf || ''},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const data=await response.json();
  if(!response.ok){ const error=new Error(data.error || 'Request failed');error.status=response.status;throw error; }
  return data;
}
function image(id){ const img=document.createElement('img');img.src='/assets/'+id+'.png';img.alt='';return img; }
function selectedSlots(){ return [...state.selected.keys()].sort((a,b)=>a-b); }
function renderInventory(){
  const grid=$('inventory');grid.replaceChildren();
  const layout=state.inventory?.layout || {rows:10,columns:10};
  grid.style.setProperty('--columns',layout.columns);
  const rows=new Map((state.inventory?.slots || []).map(slot=>[slot.slot,slot]));
  for(let index=0;index<layout.rows*layout.columns;index++){
    const slot=rows.get(index);
    const button=document.createElement('button');button.className='slot'+(slot?'':' empty');
    const number=document.createElement('span');number.className='slot-number';number.textContent=String(index+1);button.append(number);
    if(slot){
      const rarity=rarities()[slot.rarity];
      button.style.setProperty('--rarity',rarity.color);
      button.append(image(slot.item_id));
      const quantity=document.createElement('span');quantity.className='quantity';quantity.textContent=String(slot.quantity);button.append(quantity);
      button.title='Slot '+(index+1)+': '+slot.quantity+' '+rarity.name+' '+slot.name;
      button.setAttribute('aria-label',button.title);
      button.setAttribute('aria-pressed',String(state.selected.has(index)));
      button.classList.toggle('selected',state.selected.has(index));
      button.disabled=state.busy || !!state.pendingCraft;
      button.draggable=!button.disabled;
      button.ondragstart=event=>{state.dragSource=index;event.dataTransfer.setData('text/plain',String(index));event.dataTransfer.effectAllowed='move';};
      button.ondragend=()=>{state.dragSource=null;};
      button.onclick=()=>{if(state.moveMode){if(state.moveSource===null){state.moveSource=index;renderInventory();}else moveItem(state.moveSource,index);}else if(slot.category!=='coffee')select(slot);};
    }else{button.disabled=!state.session || state.busy || !!state.pendingCraft;button.setAttribute('aria-label','Empty slot '+(index+1));button.onclick=()=>{if(state.moveMode && state.moveSource!==null)moveItem(state.moveSource,index);};}
    button.classList.toggle('move-source',state.moveSource===index);
    button.ondragover=event=>{if(state.dragSource!==null && !state.busy && !state.pendingCraft){event.preventDefault();event.dataTransfer.dropEffect='move';}};
    button.ondrop=event=>{event.preventDefault();if(state.dragSource!==null)moveItem(state.dragSource,index);};
    grid.append(button);
  }
  $('inventory-count').textContent=state.inventory?rows.size+' / '+layout.rows*layout.columns+' slots':'Sign in to open';
  const key=$('rarity-key');key.replaceChildren();
  for(const rarity of rarities()){const label=document.createElement('span');label.textContent=rarity.name;label.style.setProperty('--rarity',rarity.color);key.append(label);}
}
function ingredient(slot,label){
  const element=document.createElement('div');element.className='ingredient'+(slot?' filled':'');
  if(slot){
    element.style.setProperty('--rarity',rarities()[slot.rarity].color);
    element.append(image(slot.item_id));
    const text=document.createElement('span');text.textContent=slot.name;
    const sub=document.createElement('small');sub.textContent=rarities()[slot.rarity].name+' · slot '+(slot.slot+1);text.append(sub);element.append(text);
  }else{element.textContent=label;}
  return element;
}
function renderRecipe(){
  const chosen=[...state.selected.values()];
  $('recipe').replaceChildren(...coreCategories.map(category=>ingredient(chosen.find(slot=>slot.category===category),categoryNames[category])));
  const extras=chosen.filter(slot=>slot.category==='extra');
  $('extras').replaceChildren(...Array.from({length:3},(_,index)=>ingredient(extras[index],'Extra '+(index+1))));
  $('clear').disabled=state.busy || !!state.pendingCraft;
  $('craft').textContent=state.pendingCraft?'Retry craft':state.busy?'Brewing…':'Brew coffee';
  $('craft').disabled=state.busy || (!state.preview && !state.pendingCraft);
  $('odds').replaceChildren(...rarities().map((rarity,index)=>{
    const row=document.createElement('div');row.className='odd';row.style.setProperty('--rarity',rarity.color);
    const label=document.createElement('span');label.className='odd-label';label.textContent=rarity.name;
    const bar=document.createElement('span');bar.className='bar';const fill=document.createElement('i');
    fill.style.setProperty('--chance',(state.preview?.probabilities[index] || 0)+'%');bar.append(fill);
    const chance=document.createElement('span');chance.className='odd-percent';chance.textContent=state.preview?state.preview.probabilities[index]+'%':'—';
    row.append(label,bar,chance);return row;
  }));
}
function select(slot){
  if(state.selected.has(slot.slot))state.selected.delete(slot.slot);
  else{
    for(const [index,chosen] of state.selected){
      if(slot.category==='extra'?chosen.item_id===slot.item_id:chosen.category===slot.category)state.selected.delete(index);
    }
    state.selected.set(slot.slot,slot);
  }
  state.preview=null;renderInventory();renderRecipe();preview();
}
async function preview(){
  const sequence=++state.previewSequence;
  const chosen=[...state.selected.values()];
  if(!coreCategories.every(category=>chosen.some(slot=>slot.category===category))){
    state.preview=null;$('preview-state').textContent='Choose five ingredients';renderRecipe();return;
  }
  $('preview-state').textContent='Checking…';
  try{
    const result=await api('/api/preview',{slots:selectedSlots()});
    if(sequence!==state.previewSequence)return;
    state.preview=result;$('preview-state').textContent='Exact odds';renderRecipe();
  }catch(error){if(sequence!==state.previewSequence)return;state.preview=null;$('preview-state').textContent='Check selection';notice(error.message,true);renderRecipe();}
}
function acceptInventory(inventory){
  const changed=state.inventory?.version!==inventory.version || state.inventory?.configVersion!==inventory.configVersion;
  state.inventory=inventory;
  for(const [index,selected] of state.selected){
    const current=inventory.slots.find(slot=>slot.slot===index);
    if(!current || current.item_id!==selected.item_id || current.rarity!==selected.rarity)state.selected.delete(index);
    else state.selected.set(index,current);
  }
  renderInventory();renderRecipe();
  if(changed && !state.busy && !state.pendingCraft)preview();
}
$('clear').onclick=()=>{state.selected.clear();state.preview=null;state.previewSequence++;$('preview-state').textContent='Choose five ingredients';renderInventory();renderRecipe();};
$('craft').onclick=async()=>{
  if(state.busy || (!state.preview && !state.pendingCraft))return;
  state.busy=true;
  if(!state.pendingCraft)state.pendingCraft={slots:selectedSlots(),requestId:crypto.randomUUID(),configVersion:state.preview.configVersion,inventoryVersion:state.preview.inventoryVersion};
  renderInventory();renderRecipe();
  try{
    const result=await api('/api/craft',state.pendingCraft);
    state.pendingCraft=null;state.selected.clear();state.preview=null;state.previewSequence++;
    const box=$('result');box.style.setProperty('--rarity',result.inventory.rarities[result.result.rarity].color);
    const title=document.createElement('strong');title.id='result-title';title.textContent=result.result.rarityName+' Coffee';
    const description=document.createElement('p');description.textContent='Added to your inventory.';
    $('result-content').replaceChildren(image('coffee'),title,description);
    if(!box.open)box.showModal();
    state.busy=false;acceptInventory(result.inventory);
    notice(result.replayed?'Your previous brew was already completed. Its result is shown in the popup.':'Brew complete. Your coffee is in your inventory.');
  }catch(error){
    if(error.status && error.status<500){state.pendingCraft=null;state.preview=null;}
    notice(state.pendingCraft?'The result could not be confirmed. Retry to recover the same craft safely.':error.message,true);
    state.busy=false;
    if(!state.pendingCraft){try{acceptInventory(await api('/api/inventory'));}catch{}}
  }finally{state.busy=false;renderInventory();renderRecipe();}
};
$('close-result').onclick=()=>$('result').close();
$('result').onclick=event=>{if(event.target===$('result')){const bounds=$('result').getBoundingClientRect();if(event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom)$('result').close();}};
$('move-mode').onclick=()=>{state.moveMode=!state.moveMode;state.moveSource=null;$('move-mode').setAttribute('aria-pressed',String(state.moveMode));$('move-mode').textContent=state.moveMode?'Done moving':'Move items';renderInventory();};
async function moveItem(from,to){
  if(state.busy || state.pendingCraft || !state.inventory)return;
  state.busy=true;state.moveSource=null;state.dragSource=null;state.previewSequence++;state.preview=null;renderInventory();renderRecipe();
  try{
    const inventory=await api('/api/inventory/move',{from,to,inventoryVersion:state.inventory.version});
    const remapped=new Map();
    for(const [index,slot] of state.selected){const next=index===from?to:index===to?from:index;remapped.set(next,{...slot,slot:next});}
    state.selected=remapped;state.busy=false;acceptInventory(inventory);notice('Inventory updated.');
  }catch(error){state.busy=false;notice(error.message,true);await refresh();}
  finally{state.busy=false;renderInventory();renderRecipe();}
}
$('logout').onclick=async()=>{try{await api('/api/logout',{});location.reload();}catch(error){notice(error.message,true);}};
$('authorize-bot').onclick=async()=>{try{location.assign((await api('/api/admin/authorize-bot',{})).url);}catch(error){notice(error.message,true);}};
$('save-settings').onclick=async()=>{
  try{
    const settings=JSON.parse($('settings').value);
    await api('/api/admin/config',{version:state.adminConfig.version,settings});
    state.adminConfig=await api('/api/admin/config');$('settings').value=JSON.stringify(state.adminConfig.settings,null,2);
    acceptInventory(await api('/api/inventory'));notice('Configuration saved.');
  }catch(error){notice(error.message,true);}
};
async function refresh(){
  if(!state.session || state.busy || state.pendingCraft)return;
  try{acceptInventory(await api('/api/inventory'));}catch(error){
    if(error.status===401){state.session=null;notice('Your session expired. Sign in again.',true);$('login').hidden=false;$('logout').hidden=true;}
    else notice(error.message,true);
  }
}
async function start(){
  renderInventory();renderRecipe();
  try{
    state.session=await api('/api/session');
    $('identity').textContent=state.session.user.displayName;
    $('login').hidden=true;$('logout').hidden=false;
    acceptInventory(await api('/api/inventory'));
    notice('Your ingredients are ready. Pick one from each core category to begin.');
    if(state.session.isAdmin){
      $('admin').hidden=false;
      $('bot-status').textContent=state.session.bot.authorized?'Viewer-drop authorization is connected.':'Viewer drops need moderator:read:chatters authorization.';
      state.adminConfig=await api('/api/admin/config');$('settings').value=JSON.stringify(state.adminConfig.settings,null,2);
    }
  }catch(error){if(error.status!==401)notice(error.message,true);}
}
setInterval(refresh,5000);
start();
