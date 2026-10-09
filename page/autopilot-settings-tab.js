/* Native EA navigation and the approved settings surface. Storage stays in the bridge. */
(() => {
  'use strict';
  if (window.AutopilotSettingsTab) return;
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const paths = {players:'excludedPlayerIds',leagues:'excludedLeagueIds',nations:'excludedNationIds'};
  const qualities = ['bronze','silver','gold'];
  const groups = {pool:['useUnassigned','onlyStorage','excludeTradable','allowConceptPlayers'],cards:['excludeSpecial','useTotwPlayers','useEvolutionPlayers']};
  const icons = {
    pilot:'<path d="M12 3 4 20l8-4 8 4L12 3Z"/><path d="M12 9v7"/>',
    sbc:'<path d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h8"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    code:'<path d="m9 8-5 4 5 4M15 8l5 4-5 4"/>',
    heart:'<path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.6 12 20 12 20Z"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    league:'<path d="M5 3h14v12l-7 6-7-6V3Z"/><path d="M8 8h8M8 12h8"/>',
    nation:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    squad:'<circle cx="8" cy="8" r="3"/><path d="M2 21v-3a6 6 0 0 1 12 0v3"/>'
  };
  const icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.pilot}</svg>`;
  const button = (label, action, cls='', extra='') => `<button type="button" class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const qualityKeys = quality => ['common_'+quality,'rare_'+quality];
  // Compare actual settings, without turning a migrated pair of buckets into a save.
  const comparable = settings => JSON.stringify(Object.keys(settings).sort().map(key =>
    [key, Array.isArray(settings[key]) ? settings[key].map(String).sort() : settings[key]]));

  function createSurface(api) {
    if(!window.AutopilotSettingsCSS)throw new Error('Autopilot settings assets are not loaded');
    const host = document.createElement('div');
    host.className = 'ea-data-autopilot-native-view';
    const shadow = host.attachShadow({mode:'open'});
    const stylesheet = document.createElement('style');
    stylesheet.textContent = window.AutopilotSettingsCSS;
    const root = document.createElement('div');
    root.className = 'autopilot-settings';
    root.dataset.design = 'guided';
    // The controls script carries CSS before registration. Apply it in the
    // detached shadow root, before any settings markup can reach the screen.
    shadow.append(stylesheet,root);
    const spec = {fields:api.fields,version:api.version};
    let saved = clone(api.defaults);
    const state = {draft:clone(saved),section:'pool',exclusionType:'leagues',exclusionSearch:''};
    const catalogs = {leagues:[],nations:[],players:[]};
    const status = {leagues:'idle',nations:'idle'};
    let loading = true, busy = false, disposed = false, refreshToken = 0, pending = null, notice = '';
    let drag = null;
    const listeners = [];
    const on = (target, event, fn, options) => {target.addEventListener(event,fn,options);listeners.push(()=>target.removeEventListener(event,fn,options));};
    const $ = selector => root.querySelector(selector);
    const all = selector => [...root.querySelectorAll(selector)];
    const dirty = () => comparable(saved) !== comparable(state.draft);
    const fieldKeys = [...api.fields.map(f=>f.key),'ratingRange','allowedCardBuckets',...Object.values(paths)];
    const changeCount = () => fieldKeys.filter(k=>JSON.stringify(saved[k])!==JSON.stringify(state.draft[k])).length;
    const countExcluded = () => Object.values(paths).reduce((sum,path)=>sum+state.draft[path].length,0);
    const controls = window.AutopilotSettingsControls({state,spec,escape,icon});
    const toggles = keys => `<div class="setting-list">${keys.map(controls.toggle).join('')}</div>`;
    const lookup = (type,id) => catalogs[type].find(row=>String(row.id)===String(id)) || api.label(type,id);
    const failedIcons = new Set();
    const emblem = (type,id,initials) => {
      if(type!=='leagues'&&type!=='nations')return `<span class="exclusion-emblem" aria-hidden="true">${escape(initials)}</span>`;
      let uri = null;
      try {
        const candidate = api.iconUrl?.(type,id);
        if(candidate){const url=new URL(candidate,window.location.href);if(['https:','http:'].includes(url.protocol))uri=url.href;}
      } catch {}
      const image = uri&&!failedIcons.has(uri)?`<img src="${escape(uri)}" alt="" loading="lazy" decoding="async" data-exclusion-icon>`:'';
      return `<span class="exclusion-emblem asset-emblem ${type==='leagues'?'league':'nation'}-emblem ${image?'has-asset':''}" aria-hidden="true">${image}<span class="asset-fallback">${icon(type==='leagues'?'league':'nation')}</span></span>`;
    };
    const rows = () => {
      const type=state.exclusionType, chosen=state.draft[paths[type]].map(String);
      const source = type==='players' ? chosen.map(id=>({...lookup(type,id),id})) : catalogs[type];
      const combined = [...source];
      for(const id of chosen) if(!combined.some(row=>String(row.id)===id)) combined.push({...lookup(type,id),id});
      const search=state.exclusionSearch.trim().toLocaleLowerCase();
      const filtered=combined.filter(row=>`${row.name} ${row.id}`.toLocaleLowerCase().includes(search));
      const chip = id => `<button class="chip" data-remove="${escape(id)}" data-type="${type}" aria-label="Remove ${escape(lookup(type,id).name)} exclusion">${escape(lookup(type,id).name)} <span aria-hidden="true">\u00d7</span></button>`;
      const row = item => {
        const id=String(item.id), selected=chosen.includes(id);
        const initials=String(item.name).split(/\s+/).slice(0,2).map(word=>word[0]).join('');
        return `<label class="exclusion-choice"><input type="checkbox" data-exclusion="${escape(id)}" data-type="${type}" ${selected?'checked':''} aria-label="Exclude ${escape(item.name)}">${emblem(type,id,initials)}<span class="exclusion-name">${escape(item.name)}${type==='players'&&item.rating!=null?`<small class="exclusion-player-meta">${escape(item.rating)} OVR \u00b7 Item ${escape(id)}</small>`:''}</span><span class="exclusion-state" aria-hidden="true">${icon('check')}<span class="state-on">Excluded</span><span class="state-off">Exclude +</span></span></label>`;
      };
      let empty = `<div class="empty-state"><h3>No matches</h3><p>Try a different name or ID.</p></div>`;
      if(type==='players'&&!chosen.length) empty=`<div class="empty-state">${icon('squad')}<h3>No excluded players</h3><p>Exclude a player from its item details in the web app. Manage those exclusions here.</p></div>`;
      else if(status[type]==='loading') empty='<div class="empty-state"><p>Loading from your club and EA catalog\u2026</p></div>';
      else if(!combined.length) empty=`<div class="empty-state"><h3>Catalog unavailable</h3><p>EA has not returned ${type} yet.</p>${button('Try again','retry-catalog','quiet')}</div>`;
      return `<div class="selected-exclusions">${chosen.length?chosen.map(chip).join(''):'<span class="caption">Nothing excluded in this category.</span>'}</div><div class="exclusion-results">${filtered.length?filtered.map(row).join(''):empty}</div>${type!=='players'&&filtered.length?`<div class="exclusion-list-count">${filtered.length} ${type}</div>`:''}`;
    };
    const exclusions = () => `<div class="exclusion-heading"><div><h3>Keep specific players out</h3><p>Excluded players, leagues and nations are removed from the pool.</p></div>${button('Clear this category','clear-exclusions','text-button',state.draft[paths[state.exclusionType]].length?'':'disabled')}</div><div class="segmented" role="tablist" aria-label="Exclusion category">${Object.keys(paths).map(type=>`<button role="tab" tabindex="${type===state.exclusionType?0:-1}" aria-selected="${type===state.exclusionType}" data-exclusion-tab="${type}">${type.charAt(0).toUpperCase()+type.slice(1)} <span>${state.draft[paths[type]].length}</span></button>`).join('')}</div><label class="search-field">${icon('search')}<input type="search" aria-label="Search ${state.exclusionType}" placeholder="Search ${state.exclusionType}\u2026" value="${escape(state.exclusionSearch)}" data-exclusion-search></label><div id="exclusion-content">${rows()}</div><p class="caption exclusion-caveat">League and nation exclusions can conflict with SBC requirements.</p>`;

    function render() {
      if(disposed)return;
      const scroll = $('.page-scroll')?.scrollTop||0;
      const panel=state.section==='pool'?`<section class="unified-panel"><div class="rating-zone">${controls.rating()}</div><section class="preference-zone"><h2>Available players</h2>${toggles(groups.pool)}</section></section>`:state.section==='cards'?`<section class="unified-panel"><div class="card-zone">${controls.buckets()}</div><section class="preference-zone"><h2>Special cards</h2>${toggles(groups.cards)}</section></section>`:`<section class="unified-panel exclusion-zone">${exclusions()}</section>`;
      root.innerHTML=`<div class="workspace selected-workspace"><div class="page-scroll"><div class="workspace-head"><div class="head-frame"><div class="head-top"><h1 class="workspace-title"><span>Global settings<span class="heading-period" aria-hidden="true">.</span></span><span class="workspace-subtitle">Choose which players Autopilot can use.</span></h1><button class="version-label" data-action="changelog" aria-label="Changelog, version ${escape(api.version)}" title="Open changelog">${icon('sbc')}<span>v${escape(api.version)}</span>${icon('arrow','version-arrow')}</button></div><div class="head-bar"><nav class="workspace-tabs" role="tablist" aria-label="Settings categories">${[['pool','Player pool'],['cards','Card types'],['exclusions','Exclusions']].map(([key,label])=>`<button role="tab" id="tab-${key}" tabindex="${state.section===key?0:-1}" aria-selected="${state.section===key}" aria-controls="settings-page" data-section="${key}">${label}${key==='exclusions'?`<span class="nav-count">${countExcluded()}</span>`:''}</button>`).join('')}</nav></div><p class="pending-note">${pending?'Settings changed elsewhere. Save to keep your edits, or discard to load the latest.':''}</p></div></div><div class="content-frame"><div id="settings-page" role="tabpanel" aria-labelledby="tab-${state.section}" class="tab-page">${panel}</div><p class="ui-notice" role="status">${escape(notice)}</p><footer class="project-footer"><div class="project-footer-frame"><div class="project-identity"><span class="project-mark">${icon('pilot')}</span><span><strong>AutopilotSBC</strong><small>FC27 SBC Solver \u00b7 v${escape(api.version)}</small></span></div><nav class="project-links" aria-label="Project links"><a class="footer-link" href="https://github.com/just-a-weird-guy/AutoPilot-SBC" target="_blank" rel="noopener noreferrer">${icon('code')}<span>Source code</span></a><a class="footer-link support" href="https://ko-fi.com/P5P5YOUU7" target="_blank" rel="noopener noreferrer">${icon('heart')}<span>Support my work</span></a></nav></div></footer></div></div><footer class="savebar"><div class="selected-save-frame"><div class="save-state" data-save-state aria-live="polite"></div><div class="save-actions"><div class="save-utility">${button('Reset','reset','quiet reset-action')}</div>${button('Discard changes','undo','quiet')}${button('Save Global','save','primary')}</div></div></footer></div>`;
      $('.page-scroll').scrollTop=scroll;
      update();
    }

    function update() {
      if(disposed)return;
      const {ratingMin:low,ratingMax:high}=state.draft.ratingRange;
      const control=$('.rating-control');
      if(control){
        control.style.setProperty('--low',`${low/99*100}%`);control.style.setProperty('--high',`${high/99*100}%`);
        control.classList.toggle('handles-close',(high-low)/99*$('.rating-scale').getBoundingClientRect().width<44);
        $('[data-rating-summary]').innerHTML=`${low}<span>\u2013</span>${high}<small>OVR</small>`;
        all('[data-rating-handle]').forEach(h=>{const isMin=h.dataset.ratingHandle==='ratingMin',value=isMin?low:high;
          h.setAttribute('aria-valuenow',value);h.setAttribute('aria-valuemin',isMin?0:low);h.setAttribute('aria-valuemax',isMin?high:99);
          h.setAttribute('aria-valuetext',`${value} OVR ${isMin?'minimum':'maximum'}`);h.querySelector('span').textContent=value;});
        const ranges={all:[0,99],bronze:[0,64],silver:[65,74],gold:[75,99]};
        all('[data-rating-preset]').forEach(b=>{const r=ranges[b.dataset.ratingPreset];b.setAttribute('aria-pressed',String(low===r[0]&&high===r[1]));});
      }
      const enabled=qualities.filter(q=>qualityKeys(q).some(k=>state.draft.allowedCardBuckets.includes(k)));
      const bucketCount=$('[data-bucket-count]');if(bucketCount)bucketCount.textContent=`${enabled.length} / 3 enabled`;
      const limit=$('[data-bucket-limit]');if(limit)limit.hidden=enabled.length>1;
      all('[data-quality]').forEach(input=>{input.checked=enabled.includes(input.dataset.quality);input.disabled=busy||loading||(input.checked&&enabled.length===1);});
      const changes=changeCount(), saveState=$('[data-save-state]');
      saveState.innerHTML=`<span class="save-dot ${dirty()?'dirty':''}"></span>${loading?'Loading settings\u2026':busy?'Saving\u2026':changes?`${changes} unsaved ${changes===1?'change':'changes'}`:'No unsaved changes'}`;
      all('[data-action="save"],[data-action="undo"]').forEach(b=>b.disabled=busy||loading||(!dirty()&&!pending));
      all('[data-action="clear-exclusions"],[data-remove]').forEach(b=>b.disabled=busy||loading||(!b.dataset.remove&&!state.draft[paths[state.exclusionType]].length));
      $('[data-action="reset"]').disabled=busy||loading;
      all('[data-key],[data-rating-preset],[data-rating-handle],[data-exclusion]').forEach(input=>input.disabled=busy||loading);
      const count=$('.nav-count');if(count)count.textContent=countExcluded();
      all('[data-exclusion-tab]').forEach(b=>b.querySelector('span').textContent=state.draft[paths[b.dataset.exclusionTab]].length);
    }

    function sync(settings) {
      if(disposed)return;
      const next=clone(api.normalize(settings));
      if(!loading&&dirty()) {if(comparable(next)!==comparable(saved)){pending=next;render();}return;}
      saved=next;state.draft=clone(next);loading=false;pending=null;render();
    }
    async function refresh(){
      const token=++refreshToken;
      try {const settings=await api.load();if(token===refreshToken&&!disposed)sync(settings);}
      catch(error){if(disposed||token!==refreshToken)return;loading=false;notice='Could not load settings. Reopen this tab to try again.';render();}
    }
    async function loadCatalog(type,force=false){
      if(type==='players'||status[type]==='loading'||(!force&&status[type]==='ready'))return;
      status[type]='loading';refreshRows();
      try{const options=await api.catalog(type,{force});if(disposed)return;
        catalogs[type]=options.map(row=>({id:String(row.id),name:row.name}));status[type]=options.length?'ready':'error';
      }catch{status[type]='error';}
      if(!disposed)refreshRows();
    }
    function refreshRows(){const content=$('#exclusion-content');if(content)content.innerHTML=rows();update();}
    on(root,'error',event=>{
      const image=event.target;
      if(!image.hasAttribute?.('data-exclusion-icon'))return;
      failedIcons.add(image.src);
      image.parentElement.classList.remove('has-asset');
      image.remove();
    },true);
    function setRating(key,value){
      if(busy||loading||!Number.isFinite(value))return;
      const range=state.draft.ratingRange;
      range[key]=Math.max(key==='ratingMin'?0:range.ratingMin,Math.min(key==='ratingMin'?range.ratingMax:99,Math.round(value)));update();
    }
    async function save(){
      if(busy||loading||!dirty())return;
      busy=true;notice='';update();
      try{
        const latest=clone(api.normalize(await api.load()));
        for(const key of fieldKeys)if(JSON.stringify(saved[key])!==JSON.stringify(state.draft[key]))latest[key]=clone(state.draft[key]);
        await api.save(latest);saved=clone(api.normalize(await api.load()));state.draft=clone(saved);pending=null;notice='Global settings saved.';
      }
      catch(error){notice=`Could not save settings. ${error?.message||'Try again.'}`;}
      finally{busy=false;if(!disposed)render();}
    }
    function resetDialog(){
      if(busy||loading)return;
      const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>Reset global settings?</h2><p>Restore the default player pool, card qualities and exclusions. Challenge and run overrides stay in place. Save Global applies the reset.</p><div class="dialog-actions">${button('Cancel','cancel-reset','quiet')}${button('Reset defaults','confirm-reset','primary')}</div>`;
      root.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();dialog.querySelector('button').focus();
    }
    on(root,'click',event=>{
      const target=event.target.closest('button');if(!target||target.disabled)return;
      if(target.dataset.section){state.section=target.dataset.section;notice='';render();$('.page-scroll').scrollTop=0;$( `[data-section="${state.section}"]`).focus({preventScroll:true});if(state.section==='exclusions')void loadCatalog(state.exclusionType);}
      else if(target.dataset.exclusionTab){state.exclusionType=target.dataset.exclusionTab;state.exclusionSearch='';render();$(`[data-exclusion-tab="${state.exclusionType}"]`).focus({preventScroll:true});void loadCatalog(state.exclusionType);}
      else if(target.dataset.ratingPreset){const r={all:[0,99],bronze:[0,64],silver:[65,74],gold:[75,99]}[target.dataset.ratingPreset];state.draft.ratingRange={ratingMin:r[0],ratingMax:r[1]};update();}
      else if(target.dataset.help){const p=$(`#help-${target.dataset.help}`);p.hidden=!p.hidden;target.setAttribute('aria-expanded',String(!p.hidden));}
      else if(target.dataset.remove){state.draft[paths[target.dataset.type]]=state.draft[paths[target.dataset.type]].filter(id=>String(id)!==target.dataset.remove);render();}
      else switch(target.dataset.action){
        case 'save':void save();break;
        case 'undo':saved=clone(pending||saved);state.draft=clone(saved);pending=null;notice='';render();break;
        case 'reset':resetDialog();break;
        case 'cancel-reset':$('dialog')?.close();break;
        case 'confirm-reset':state.draft=clone(api.defaults);$('dialog')?.close();notice='Default settings restored. Save Global to apply.';render();break;
        case 'clear-exclusions':state.draft[paths[state.exclusionType]]=[];render();break;
        case 'retry-catalog':void loadCatalog(state.exclusionType,true);break;
        case 'changelog':void api.changelog();break;
      }
    });
    on(root,'change',event=>{
      const input=event.target;if(busy||loading)return;
      if(input.dataset.key)state.draft[input.dataset.key]=input.checked;
      if(input.dataset.quality){const keys=new Set(state.draft.allowedCardBuckets);qualityKeys(input.dataset.quality).forEach(k=>input.checked?keys.add(k):keys.delete(k));if(!keys.size){input.checked=true;return;}state.draft.allowedCardBuckets=[...keys];}
      if(input.dataset.exclusion){const values=new Set(state.draft[paths[input.dataset.type]].map(String));input.checked?values.add(input.dataset.exclusion):values.delete(input.dataset.exclusion);state.draft[paths[input.dataset.type]]=[...values];refreshRows();const match=all('[data-exclusion]').find(i=>i.dataset.exclusion===input.dataset.exclusion);match?.focus({preventScroll:true});}
      update();
    });
    on(root,'input',event=>{if(event.target.hasAttribute('data-exclusion-search')){state.exclusionSearch=event.target.value;refreshRows();}});
    on(root,'keydown',event=>{
      const target=event.target;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void save();return;}
      const key=target.dataset.ratingHandle;
      if(key){const delta={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1,PageDown:-10,PageUp:10}[event.key];
        if(delta!=null||event.key==='Home'||event.key==='End'){event.preventDefault();setRating(key,delta!=null?state.draft.ratingRange[key]+delta:event.key==='Home'?0:99);}return;}
      if(target.getAttribute('role')==='tab'&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        event.preventDefault();const tabs=target.dataset.section?all('[data-section]'):all('[data-exclusion-tab]');let index=tabs.indexOf(target);
        index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[index].click();
      }
    });
    on(root,'pointerdown',event=>{
      const rail=event.target.closest('[data-rating-rail]');if(!rail||event.button!==0||busy||loading)return;
      const rect=rail.getBoundingClientRect(),value=(event.clientX-rect.left)/rect.width*99,handle=event.target.closest('[data-rating-handle]');
      const range=state.draft.ratingRange;
      const key=handle?.dataset.ratingHandle||(Math.abs(value-range.ratingMin)<Math.abs(value-range.ratingMax)?'ratingMin':'ratingMax');
      drag={rail,key,id:event.pointerId};rail.setPointerCapture(event.pointerId);if(!handle)setRating(key,value);
      rail.querySelector(`[data-rating-handle="${key}"]`).focus({preventScroll:true});event.preventDefault();
    });
    on(root,'pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const r=drag.rail.getBoundingClientRect();setRating(drag.key,(event.clientX-r.left)/r.width*99);});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])on(root,name,()=>{drag=null;});
    const observer=new ResizeObserver(update);observer.observe(host);
    const registry={sync};api.registry?.add(registry);
    render();
    return {host,refresh,sync,get dirty(){return dirty();},dispose(){disposed=true;++refreshToken;observer.disconnect();listeners.forEach(off=>off());api.registry?.delete(registry);root.innerHTML='';}};
  }

  let native=null;
  function installNative(api,classes) {
    const {EAView,EAViewController,UTGameFlowNavigationController,UTTabBarItemView,UTGameTabBarController}=classes;
    if(![EAView,EAViewController,UTGameFlowNavigationController,UTTabBarItemView,UTGameTabBarController].every(c=>typeof c==='function'))return false;
    const proto=UTGameTabBarController.prototype;
    if(typeof proto.initWithViewControllers!=='function')return false;
    if(!native){
      class AutopilotView extends EAView {
        _generate(){if(!this.__autopilotSurface){this.__autopilotSurface=createSurface(api);this._root=this.__autopilotSurface.host;this._generated=true;}return this._root;}
        getRootElement(){this._generate();return this._root;}
        destroyGeneratedElements(){this.__autopilotSurface?.dispose();this.__autopilotSurface=null;this._root?.remove();this._root=null;this._generated=false;}
      }
      class AutopilotController extends EAViewController {
        _getViewInstanceFromData(){return new AutopilotView();}
        getNavigationTitle(){return 'AutopilotSBC';}
        viewDidAppear(...args){super.viewDidAppear?.(...args);this.getNavigationController()?.setNavigationVisibility(true,true);const view=this.getView();view.getRootElement();void view.__autopilotSurface.refresh();}
      }
      native={api,Controller:AutopilotController,instances:new Set()};
    }
    if(proto.initWithViewControllers.__autopilotSettingsNative)return true;
    const previous=proto.initWithViewControllers;
    const wrapper=function(controllers,...args){
      if(!this.initialized&&Array.isArray(controllers)&&!controllers.some(controller=>controller?.__autopilotSettingsNavigation)){
        const navigation=new UTGameFlowNavigationController();
        navigation.__autopilotSettingsNavigation=true;
        navigation.initWithRootController(new native.Controller());
        const item=new UTTabBarItemView();item.init();
        const used=new Set(controllers.map(c=>c?.tabBarItem?.getTag?.()));let tag=27100;while(used.has(tag))tag++;
        item.setTag(tag);item.setText('Autopilot');item.addClass('icon-transfer');item.addClass('ea-data-autopilot-tab');
        navigation.tabBarItem=item;controllers.push(navigation);
      }
      const result=previous.call(this,controllers,...args);
      native.instances.delete(this);native.instances.add(this);return result;
    };
    wrapper.__autopilotSettingsNative=true;proto.initWithViewControllers=wrapper;
    if(!document.getElementById('ea-data-autopilot-tab-icon')){
      const style=document.createElement('style');style.id='ea-data-autopilot-tab-icon';
      style.textContent='.ea-data-autopilot-tab:before{content:""!important;display:block!important;width:27px;height:27px;margin:0 auto 4px;background:currentColor;clip-path:polygon(50% 3%,94% 94%,50% 72%,6% 94%);}.ea-data-autopilot-native-view{position:absolute;inset:0;min-height:0;}';
      (document.head||document.documentElement).append(style);
    }
    return true;
  }
  const open = () => {
    // EA can recreate the tab bar after sign-in. Prefer the most recent one.
    for(const tabs of [...(native?.instances||[])].reverse()){
      const index=tabs.childViewControllers?.findIndex(controller=>controller?.__autopilotSettingsNavigation);
      if(index>=0&&typeof tabs.setSelectedIndex==='function'){tabs.setSelectedIndex(index);return true;}
    }
    return false;
  };
  window.AutopilotSettingsTab={createSurface,installNative,isInstalled:()=>!!native,open};
})();
