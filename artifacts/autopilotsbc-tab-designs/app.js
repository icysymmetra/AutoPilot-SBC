(() => {
  'use strict';
  const spec = window.AutoPilotSpec;
  const design = document.body.dataset.design;
  const names = { native: 'Balanced panels', guided: 'Unified surface', inspector: 'Compact rows', editorial: 'Quiet groups', builder: 'Card detail' };
  const files = ['01-native.html', '02-guided.html', '03-inspector.html', '04-editorial.html', '05-builder.html'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const defaults = { ...clone(spec.defaults), excludedPlayerIds: [], excludedLeagueIds: [], excludedNationIds: [] };
  let saved;
  try { saved = JSON.parse(localStorage.getItem(`autopilot-design-${design}`)) || clone(defaults); } catch { saved = clone(defaults); }
  const qualities = ['bronze','silver','gold'];
  const qualityKeys = quality => spec.buckets.filter(row=>row.quality===quality).map(row=>row.key);
  const enabledQualities = settings => qualities.filter(quality=>qualityKeys(quality).some(key=>settings.allowedCardBuckets.includes(key)));
  // FC27 exposes quality only. Expand old prototype preferences to whole qualities.
  // The paired keys are an adapter for the existing solver schema, not UI options.
  if(design==='guided') {
    const enabled=enabledQualities(saved);
    saved.allowedCardBuckets=spec.buckets.filter(row=>!enabled.length||enabled.includes(row.quality)).map(row=>row.key);
  }
  const state = { draft: clone(saved), section: 'pool', exclusionType: 'leagues', exclusionSearch: '', toolStep: 0 };
  const catalogs = {
    leagues: ['Premier League', 'LALIGA EA SPORTS', 'Bundesliga', 'Serie A', 'Ligue 1', 'Eredivisie', 'Liga Portugal', 'MLS', 'Saudi Pro League', 'Süper Lig', 'Liga Profesional', 'Belgian Pro League', 'Barclays WSL', 'Liga F', 'Frauen-Bundesliga', 'NWSL'],
    nations: ['Argentina', 'Australia', 'Belgium', 'Brazil', 'Canada', 'Colombia', 'Denmark', 'England', 'France', 'Germany', 'Italy', 'Japan', 'Netherlands', 'Norway', 'Portugal', 'Spain', 'Sweden', 'United States'],
    players: [],
  };
  const paths = { leagues: 'excludedLeagueIds', nations: 'excludedNationIds', players: 'excludedPlayerIds' };
  const titles = { pool: 'Player pool', cards: 'Card types', exclusions: 'Exclusions', concepts: 'Concept fallback', tools: 'SBC workflows', about: 'About & updates' };
  const groups = {
    pool: ['useUnassigned', 'onlyStorage', 'excludeTradable'],
    cards: ['excludeSpecial', 'useTotwPlayers', 'useEvolutionPlayers'],
    concepts: ['allowConceptPlayers'],
  };
  const icons = {
    pilot: '<path d="M12 3 4 20l8-4 8 4L12 3Z"/><path d="M12 9v7"/>',
    home: '<path d="m3 10 9-7 9 7M6 9v11h12V9M10 20v-7h4v7"/>',
    squad: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M2 21v-3a6 6 0 0 1 12 0v3M16 15a4 4 0 0 1 5 4v2"/>',
    sbc: '<path d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h8"/><path d="m16 10 2 2 4-4"/>',
    evo: '<path d="M9 3h6M10 3v7l-6 10h16l-6-10V3M8 15h8"/>',
    transfer: '<path d="M3 7h17l-4-4M21 17H4l4 4M20 7l-4 4M4 17l4-4"/>',
    store: '<path d="M3 5h3l2 12h11l2-9H7"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>',
    club: '<path d="M4 5h7v15H4zM13 5h7v15h-7zM7 8h1M16 8h1"/>',
    settings: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    code: '<path d="m9 8-5 4 5 4M15 8l5 4-5 4"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.6 12 20 12 20Z"/>',
    reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v5h5"/>',
  };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.settings}</svg>`;
  const button = (label, action, cls = '', extra = '') => `<button type="button" class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const dirty = () => JSON.stringify(state.draft) !== JSON.stringify(saved);
  const totalExcluded = () => ['excludedPlayerIds', 'excludedLeagueIds', 'excludedNationIds'].reduce((sum, path) => sum + state.draft[path].length, 0);
  const field = key => spec.fields.find(row => row.key === key);
  const concise = Object.fromEntries(spec.fields.map(row=>[row.key,row.label.replace(/\s*\(experimental\)/i,'')]));
  const help = {
    useUnassigned: 'Include unassigned players and prioritize duplicate-backed club copies.',
    onlyStorage: 'Use stored players or club players with a matching copy in storage.',
    excludeTradable: 'Keep tradable players out of the normal solver pool.',
    excludeSpecial: 'Avoid special cards. TOTW and TOTS use their own control below.',
    useTotwPlayers: 'Allow Team of the Week, Team of the Season and inform cards.',
    useEvolutionPlayers: 'Allow evolution cards, including duplicate copies.',
    allowConceptPlayers: 'Try concept players only after an owned-player solution fails.',
  };
  const controls = window.AutopilotControls({state,spec,escape,icon});
  const toggle = key => controls.toggle(key);
  const toggles = (keys, compact = false) => `<div class="setting-list">${keys.map(key => toggle(key, compact)).join('')}</div>`;
  const rating = () => controls.rating();
  const buckets = () => controls.buckets();
  const scope = () => `<div class="scope-label"><span class="scope-dot"></span>Global defaults${button('How overrides work', 'scope', 'text-button')}</div>`;
  const pool = () => `${rating()}<div class="rule-divider"></div>${toggles(groups.pool)}`;
  const cards = () => `${buckets()}<div class="rule-divider"></div>${toggles(groups.cards)}`;
  const concepts = () => `${toggles(groups.concepts)}<div class="concept-note"><strong>Owned players come first.</strong><p>Concept squads can be preview-applied. You must own their players before submission. Points SBCs accept owned players only.</p></div>`;
  const exclusionRows = () => {
    const type = state.exclusionType;
    const chosen = state.draft[paths[type]];
    const filtered = catalogs[type].filter(name => name.toLowerCase().includes(state.exclusionSearch.toLowerCase()));
    const pages = Math.max(1, Math.ceil(filtered.length / 6));
    state.exclusionPage = Math.min(state.exclusionPage, pages - 1);
    const shown = filtered;
    const choiceRow = name => {
      if(design!=='guided')return `<label class="exclusion-item"><span>${escape(name)}</span><input type="checkbox" data-exclusion="${escape(name)}" data-type="${type}" ${chosen.includes(name)?'checked':''} aria-label="Exclude ${escape(name)}"></label>`;
      const initials=name.split(/\s+/).slice(0,2).map(word=>word[0]).join('');
      return `<label class="exclusion-choice"><input type="checkbox" data-exclusion="${escape(name)}" data-type="${type}" ${chosen.includes(name)?'checked':''} aria-label="Exclude ${escape(name)}"><span class="exclusion-emblem" aria-hidden="true">${escape(initials)}</span><span class="exclusion-name">${escape(name)}</span><span class="exclusion-state" aria-hidden="true">${icon('check')}<span class="state-on">Excluded</span><span class="state-off">Exclude +</span></span></label>`;
    };
    const empty = type === 'players'
      ? '<div class="empty-state">' + icon('squad') + '<h3>No excluded players</h3><p>Exclude a player from its item details in the web app. Manage those exclusions here.</p></div>'
      : '<div class="empty-state"><h3>No matches</h3><p>Try a different name.</p></div>';
    return `<div class="selected-exclusions">${chosen.length ? chosen.map(name => `<button class="chip" data-remove="${escape(name)}" data-type="${type}" aria-label="Remove ${escape(name)} exclusion">${escape(name)} <span>×</span></button>`).join('') : '<span class="caption">Nothing excluded in this category.</span>'}</div><div class="exclusion-results">${shown.length ? shown.map(choiceRow).join('') : empty}</div>${type !== 'players' ? `<div class="exclusion-list-count">${filtered.length} sample ${type}</div>` : ''}`;
  };
  const exclusions = () => `<div class="exclusion-heading"><div><h3>Keep specific players out</h3><p class="setting-help">Excluded players, leagues and nations are removed from the pool.</p></div>${button('Clear this category', 'clear-exclusions', 'text-button')}</div><div class="segmented" role="tablist" aria-label="Exclusion category">${['players','leagues','nations'].map(type => `<button role="tab" aria-selected="${state.exclusionType === type}" data-exclusion-tab="${type}">${type.charAt(0).toUpperCase()+type.slice(1)} <span>${state.draft[paths[type]].length}</span></button>`).join('')}</div>${state.exclusionType !== 'players' ? `<label class="search-field">${icon('search')}<input type="search" aria-label="Search ${state.exclusionType}" placeholder="Search ${state.exclusionType}…" value="${escape(state.exclusionSearch)}" data-exclusion-search></label>` : ''}<div id="exclusion-content">${exclusionRows()}</div><p class="caption exclusion-caveat">League and nation exclusions can conflict with SBC requirements.</p>`;
  const workflows = () => button('Sequence Solver','tool-sequence','primary');
  const about = () => `<div class="about-heading"><span class="brand-mark">${icon('pilot')}</span><div><h2>AutopilotSBC</h2><p>FC27 SBC Solver · v${spec.version}</p></div></div><p class="section-intro">Solver settings and tools, together in one place.</p><div class="about-links">${button('Changelog', 'changelog') }<a class="button" href="https://github.com/just-a-weird-guy/AutoPilot-SBC" target="_blank" rel="noopener">Source Code ${icon('arrow')}</a><a class="button" href="https://ko-fi.com/P5P5YOUU7" target="_blank" rel="noopener">Support My Work ${icon('arrow')}</a></div><div class="release-preview"><span class="eyebrow">Latest update · ${spec.changelog[0].date}</span><h3>${escape(spec.changelog[0].headline)}</h3><p>${escape(spec.changelog[0].summary)}</p></div>`;
  const content = section => ({ pool, cards, exclusions, concepts, tools: workflows, about })[section]();
  const summary = () => `<dl class="summary-list"><div><dt>Rating</dt><dd>${state.draft.ratingRange.ratingMin}–${state.draft.ratingRange.ratingMax} OVR</dd></div><div><dt>Base cards</dt><dd>${state.draft.allowedCardBuckets.length} of 6 types</dd></div><div><dt>Sources</dt><dd>${state.draft.onlyStorage ? 'Storage matches' : 'Club + storage'}${state.draft.useUnassigned ? ' + unassigned' : ''}</dd></div><div><dt>Tradable</dt><dd>${state.draft.excludeTradable ? 'Excluded' : 'Allowed'}</dd></div><div><dt>Special</dt><dd>${state.draft.excludeSpecial ? 'Excluded' : 'Allowed'}</dd></div><div><dt>TOTW / TOTS</dt><dd>${state.draft.useTotwPlayers ? 'Allowed' : 'Excluded'}</dd></div><div><dt>Evolution</dt><dd>${state.draft.useEvolutionPlayers ? 'Allowed' : 'Excluded'}</dd></div><div><dt>Exclusions</dt><dd>${totalExcluded()} selected</dd></div><div><dt>Concepts</dt><dd>${state.draft.allowConceptPlayers ? 'Fallback enabled' : 'Off'}</dd></div></dl>`;
  const changes = () => {
    const entries = [];
    for (const row of spec.fields) if (state.draft[row.key] !== saved[row.key]) entries.push(`${concise[row.key]}: ${state.draft[row.key] ? 'on' : 'off'}`);
    if (JSON.stringify(state.draft.ratingRange) !== JSON.stringify(saved.ratingRange)) entries.push(`Rating: ${state.draft.ratingRange.ratingMin}–${state.draft.ratingRange.ratingMax}`);
    if (JSON.stringify(state.draft.allowedCardBuckets) !== JSON.stringify(saved.allowedCardBuckets)) entries.push(`${state.draft.allowedCardBuckets.length} card types allowed`);
    for (const type of ['players', 'leagues', 'nations']) if (JSON.stringify(state.draft[paths[type]]) !== JSON.stringify(saved[paths[type]])) entries.push(`${state.draft[paths[type]].length} ${type} excluded`);
    return entries;
  };
  const savebar = () => '<footer class="savebar"><div class="save-state" data-save-state></div><div class="save-actions">'+button('Discard changes','undo','quiet',dirty()?'':'disabled')+button('Save Global','save','primary',dirty()?'':'disabled')+'</div></footer>';
  const rows = [
    {key:'ratingRange',group:'Pool',label:'Player rating range',value:()=>`${state.draft.ratingRange.ratingMin}–${state.draft.ratingRange.ratingMax}`},
    ...spec.fields.filter(row=>groups.pool.includes(row.key)).map(row=>({key:row.key,group:'Pool',label:concise[row.key],value:()=>state.draft[row.key]?'On':'Off'})),
    {key:'allowedCardBuckets',group:'Cards',label:'Base card types',value:()=>`${state.draft.allowedCardBuckets.length} / 6`},
    ...spec.fields.filter(row=>groups.cards.includes(row.key)).map(row=>({key:row.key,group:'Cards',label:concise[row.key],value:()=>state.draft[row.key]?'On':'Off'})),
    {key:'exclusions',group:'Exclusions',label:'Players, leagues & nations',value:()=>`${totalExcluded()} excluded`},
    {key:'allowConceptPlayers',group:'Fallback',label:'Concept fallback',value:()=>state.draft.allowConceptPlayers?'On':'Off'},
  ];
  const shell = () => `<div class="preview-strip"><a href="index.html">← All five designs</a><span>${files.indexOf(location.pathname.split('/').pop())+1 || Object.keys(names).indexOf(design)+1} / 5 · ${names[design]}</span><span class="prototype-label">Interactive prototype</span></div><div class="ea-shell"><nav class="ea-rail" aria-label="EA web app navigation preview">${[['home','Home'],['squad','Squads'],['sbc','SBC'],['evo','Evolutions'],['transfer','Transfers'],['pilot','Autopilot'],['store','Store'],['club','Club']].map(([ic,name])=>`<div class="ea-nav-item ${name==='Autopilot'?'active':''}" ${name==='Autopilot'?'aria-current="page"':''}>${icon(ic)}<span>${name}</span></div>`).join('')}<div class="ea-nav-item ea-settings">${icon('settings')}<span>Settings</span></div></nav><div class="ea-main"><header class="ea-topbar"><div><span class="top-back" aria-hidden="true">‹</span><strong>AutopilotSBC</strong><span class="top-divider"></span><span>FC27 SBC Solver</span></div><div class="club-id"><small>EST. OCT 2022</small><span>Cold Trafford</span>${icon('club')}</div></header><main id="design-content">${window.AutopilotDirections({state,icon,button,pool,cards,concepts,exclusions,workflows,about,rating,buckets,toggles,groups,summary,savebar,rows,toggle,field,spec,totalExcluded})[design]()}</main></div></div><div id="toast" role="status" aria-live="polite"></div><dialog id="modal" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title"></h2><button data-action="close-modal" class="icon-button" aria-label="Close dialog">${icon('close')}</button></div><div id="modal-body"></div></dialog>`;
  const render = () => {
    ratingDrag=null;
    const scrollTop=document.querySelector('#settings-page')?.getAttribute('aria-labelledby')==='tab-'+state.section?(document.querySelector('.page-scroll')?.scrollTop||0):0;
    const openSections=[...document.querySelectorAll('.editorial-section')].map(el=>el.open);
    document.getElementById('app').innerHTML = shell();
    if(openSections.length) document.querySelectorAll('.editorial-section').forEach((el,index)=>el.open=openSections[index]);
    update();
    document.querySelector('.page-scroll').scrollTop=scrollTop;
  };
  const toast = message => {
    const target = document.getElementById('toast'); target.textContent = message; target.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(()=>target.classList.remove('show'),3000);
  };
  const update = () => {
    document.querySelectorAll('[data-handle-value]').forEach(el=>el.textContent=state.draft.ratingRange[el.dataset.handleValue]);
    const presetRanges={all:[0,99],bronze:[0,64],silver:[65,74],gold:[75,99]};
    document.querySelectorAll('[data-rating-preset][aria-pressed]').forEach(el=>{const [min,max]=presetRanges[el.dataset.ratingPreset];el.setAttribute('aria-pressed',String(state.draft.ratingRange.ratingMin===min&&state.draft.ratingRange.ratingMax===max));});
    document.querySelectorAll('[data-configuration-summary]').forEach(el=>el.innerHTML='<strong>'+state.draft.ratingRange.ratingMin+'–'+state.draft.ratingRange.ratingMax+' OVR</strong> · '+state.draft.allowedCardBuckets.length+' base card types allowed · '+totalExcluded()+' exclusions');
    document.querySelectorAll('[data-save-state]').forEach(el=>el.innerHTML='<span class="save-dot '+(dirty()?'dirty':'')+'"></span>'+(dirty()?changes().length+' unsaved change'+(changes().length===1?'':'s'):'No unsaved changes'));
    document.querySelectorAll('[data-rating-summary]').forEach(el=>el.innerHTML=state.draft.ratingRange.ratingMin+'<span>–</span>'+state.draft.ratingRange.ratingMax+'<small>OVR</small>');
    document.querySelectorAll('.rating-control').forEach(el=>{el.style.setProperty('--low',state.draft.ratingRange.ratingMin/99*100+'%');el.style.setProperty('--high',state.draft.ratingRange.ratingMax/99*100+'%');const rail=el.querySelector('[data-rating-rail]');el.classList.toggle('handles-close',(state.draft.ratingRange.ratingMax-state.draft.ratingRange.ratingMin)/99*rail.getBoundingClientRect().width<24);});
    document.querySelectorAll('[data-rating-handle]').forEach(el=>{const min=el.dataset.ratingHandle==='ratingMin';el.setAttribute('aria-valuenow',state.draft.ratingRange[el.dataset.ratingHandle]);el.setAttribute('aria-valuemin',min?0:state.draft.ratingRange.ratingMin);el.setAttribute('aria-valuemax',min?state.draft.ratingRange.ratingMax:99);el.setAttribute('aria-valuetext',state.draft.ratingRange[el.dataset.ratingHandle]+' OVR '+(min?'minimum':'maximum'));});
    document.querySelectorAll('[data-bucket]').forEach(el=>{el.disabled=state.draft.allowedCardBuckets.length===1&&el.checked;el.title=el.disabled?'Keep at least one card type enabled.':'';});
    const qualityCount=enabledQualities(state.draft).length;
    document.querySelectorAll('[data-quality]').forEach(el=>{el.disabled=qualityCount===1&&el.checked;el.title=el.disabled?'Keep at least one base quality enabled.':'';});
    document.querySelectorAll('[data-bucket-limit]').forEach(el=>el.hidden=(design==='guided'?qualityCount:state.draft.allowedCardBuckets.length)!==1);
    document.querySelectorAll('[data-action="save"],[data-action="undo"]').forEach(el=>el.disabled=!dirty());
    document.querySelectorAll('.nav-count').forEach(el=>el.textContent=totalExcluded());
    document.querySelectorAll('[data-bucket-count]').forEach(el=>el.textContent=design==='guided'?`${qualityCount} / 3 enabled`:`${state.draft.allowedCardBuckets.length} / 6 enabled`);
    document.querySelectorAll('[data-summary]').forEach(el=>el.innerHTML=summary());
    document.querySelectorAll('[data-inspect]').forEach(el=>{const row=rows.find(row=>row.key===el.dataset.inspect);el.querySelector('.value-cell').innerHTML=row.value()+' '+icon('arrow');});
  };
  const modal = (title, body) => {
    const dialog=document.getElementById('modal');
    dialog.classList.remove('menu-dialog');
    document.getElementById('modal-title').textContent=title;
    document.getElementById('modal-body').innerHTML=body;
    if (!dialog.open) dialog.showModal();
  };
  const close = () => document.getElementById('modal').close();
  const toolsDialog = action => {
    const labels={sequence:'Sequence Solver',solve:'Solve Squad',multi:'Multi Solve',set:'Solve Entire Set',points:'Solve Points'};
    if(action==='sequence') {
      modal(labels[action], `<div class="prototype-note">Workflow preview. This mockup makes no EA requests.</div><div class="sequence-preview"><div class="local-tabs"><button class="active">Steps</button><button data-action="sequence-settings">Settings</button><button data-action="sequence-execution">Execution</button></div><h3>Untitled plan</h3><div id="demo-steps" class="demo-steps"><div><b>01</b><span>Gold Upgrade<small>Review before submit · 1 cycle</small></span><span class="tag">Sample</span></div></div><div class="modal-actions">${button('+ Add Step','add-step','quiet')}${button('Save plan','save-plan')}${button('Preview execution','sequence-execution','primary')}</div></div>`);
    } else modal(labels[action], `<div class="prototype-note">Workflow preview. This mockup makes no EA requests.</div><p>The tab would open the existing ${labels[action]} flow for your current SBC.</p><div class="inline-note"><strong>${action==='points'?'Native Work Area':'Current challenge'}</strong><span>${action==='points'?'Eligible owned players are selected using EA scores. Continue through Review Selection.':'Use the current challenge requirements and its challenge or session overrides.'}</span></div>${action==='multi'?'<label class="dialog-field">Cycles<input type="number" value="1" min="1" max="99"></label>':''}${button('Return to settings','close-modal','primary')}`);
  };
  const actions = {
    more() {modal('Settings & project','<nav class="action-menu">'+button('Find a setting','find','quiet')+button('Changelog','changelog','quiet')+'<a href="https://github.com/just-a-weird-guy/AutoPilot-SBC" target="_blank" rel="noopener">Source Code</a><a href="https://ko-fi.com/P5P5YOUU7" target="_blank" rel="noopener">Support My Work</a><hr>'+button('Reset Global','reset','quiet')+'</nav>');document.getElementById('modal').classList.add('menu-dialog');},
    save() { saved=clone(state.draft);localStorage.setItem(`autopilot-design-${design}`,JSON.stringify(saved));update();toast('Saved in this prototype. Your extension settings are unchanged.'); },
    undo() { state.draft=clone(saved);render();toast('Unsaved changes undone.'); },
    reset() { modal('Reset global defaults?', `<p>Restore the default rating range, card types, player pool options and exclusions.</p><p class="caption">This resets this prototype only.</p><div class="modal-actions">${button('Cancel','close-modal','quiet')}${button('Reset Global','confirm-reset','primary')}</div>`); },
    'confirm-reset'() { state.draft=clone(defaults);close();render();toast('Default values restored. Save Global to keep them.'); },
    scope() { modal('How overrides work', `<p>Global defaults are the starting point for every solver.</p><ol class="scope-chain"><li><b>Run settings</b><span>Overrides for the current multi, set or sequence run.</span></li><li><b>Challenge settings</b><span>Saved choices for an individual SBC.</span></li><li><b>Global defaults</b><span>The settings on this page.</span></li></ol><p class="caption">The first applicable value wins. Editing global defaults does not erase an existing challenge override.</p>`); },
    'close-modal': close,
    'review-changes'() {const changed=changes();modal('Review global changes',`<h3>Resulting configuration</h3>${summary()}<h3 style="margin-top:24px">Unsaved changes</h3>${changed.length?`<ul class="change-list">${changed.map(line=>`<li>${escape(line)}</li>`).join('')}</ul>`:'<p>No unsaved changes.</p>'}<div class="modal-actions">${button('Keep editing','close-modal','quiet')}${button('Save Global','save-and-close','primary',dirty()?'':'disabled')}</div>`);},
    'save-and-close'() {actions.save();close();},
    'clear-exclusions'() {state.draft[paths[state.exclusionType]]=[];render();},
    'exclusion-next'() {state.exclusionPage++;document.getElementById('exclusion-content').innerHTML=exclusionRows();},
    'exclusion-prev'() {state.exclusionPage=Math.max(0,state.exclusionPage-1);document.getElementById('exclusion-content').innerHTML=exclusionRows();},
    'workflow-dialog'() {modal('SBC workflows',workflows());},
    changelog() {modal('Changelog',spec.changelog.map(release=>`<details class="release-entry" ${release.version===spec.version?'open':''}><summary><span class="tag">v${release.version}</span><strong>${escape(release.headline)}</strong><time>${release.date}</time></summary><p>${escape(release.summary)}</p><ul>${release.details.map(detail=>`<li>${escape(detail)}</li>`).join('')}</ul></details>`).join(''));},
    find() {modal('Find a setting',`<label class="search-field">${icon('search')}<input type="search" aria-label="Find a setting" placeholder="Try rating, storage, TOTW…" data-setting-search autofocus></label><div id="setting-results">${searchResults('')}</div>`);},
    'add-step'() {state.toolStep++;document.getElementById('demo-steps').insertAdjacentHTML('beforeend',`<div><b>${String(state.toolStep+1).padStart(2,'0')}</b><span>Choose an SBC<small>Sample step · not connected</small></span><span class="tag">Draft</span></div>`);},
    'save-plan'() {toast('Plan preview saved for this open dialog. No extension plan was created.');},
    'sequence-settings'() {modal('Sequence settings',`<div class="prototype-note">Existing run options, shown as a workflow preview.</div><label class="dialog-field">Submit mode<select><option>Review before submit</option><option>Auto-submit</option></select></label><label class="dialog-field">Step failure<select><option>Stop sequence</option><option>Skip step</option></select></label><p>Run settings override challenge and global defaults.</p>${button('Back to Steps','tool-sequence','quiet')}`);},
    'sequence-execution'() {modal('Execution preview',`<div class="prototype-note">No solver or submission was started.</div><div class="empty-state">${icon('sbc')}<h3>Ready for a run</h3><p>In the real flow, this view shows progress, previews and the Stop control.</p></div>${button('Back to Steps','tool-sequence','quiet')}`);},
  };
  const searchResults = query => rows.filter(row=>(row.label+' '+row.group+' '+(help[row.key]||'')).toLowerCase().includes(query.toLowerCase())).map(row=>`<button class="search-result" data-search-result="${row.key}"><span>${row.label}<small>${row.group}</small></span>${icon('arrow')}</button>`).join('')||'<p class="caption">No settings match that search.</p>';
  const navigateTo = key => {
    close();
    const section=key==='ratingRange'?'pool':key==='allowedCardBuckets'?'cards':key==='exclusions'?'exclusions':key==='allowConceptPlayers'?'pool':groups.pool.includes(key)?'pool':'cards';
    state.section=section;


    render();
    if(design==='editorial') {
      const index=['pool','cards','exclusions'].indexOf(section);
      const target=document.querySelectorAll('.editorial-section')[index];
      if(target)target.open=true;target?.scrollIntoView({block:'start'});
    }
    requestAnimationFrame(()=>{
      const selector=spec.fields.some(f=>f.key===key) ? '[data-key="'+key+'"]' : key==='ratingRange' ? '[data-rating-handle="ratingMin"]' : key==='allowedCardBuckets' ? '[data-bucket]' : '[data-exclusion-search]';
      const input=document.querySelector(selector);input?.scrollIntoView({block:'nearest'});input?.focus({preventScroll:true});
    });
  };
  document.addEventListener('click', event => {
    const target=event.target.closest('button');
    if(!event.target.closest('.rating-footer')) {document.querySelectorAll('[data-rating-presets]').forEach(el=>el.hidden=true);document.querySelectorAll('[data-preset-toggle]').forEach(el=>el.setAttribute('aria-expanded','false'));}
    if(!target||target.disabled)return;
    if(target.hasAttribute('data-preset-toggle')) {const list=document.querySelector('[data-rating-presets]');list.hidden=!list.hidden;target.setAttribute('aria-expanded',String(!list.hidden));if(!list.hidden)list.querySelector('button')?.focus();return;}
    if(target.dataset.ratingPreset) {const ranges={all:[0,99],bronze:[0,64],silver:[65,74],gold:[75,99]};const [ratingMin,ratingMax]=ranges[target.dataset.ratingPreset];state.draft.ratingRange={ratingMin,ratingMax};update();const list=document.querySelector('[data-rating-presets]');if(list)list.hidden=true;const toggle=document.querySelector('[data-preset-toggle]');if(toggle){toggle.setAttribute('aria-expanded','false');toggle.focus();}return;}
    if(target.dataset.help) {const description=document.getElementById('help-'+target.dataset.help);description.hidden=!description.hidden;target.setAttribute('aria-expanded',String(!description.hidden));return;}
    if(target.dataset.section) {state.section=target.dataset.section;render();document.querySelector('[data-section="'+state.section+'"]').focus({preventScroll:true});}
    else if(target.dataset.exclusionTab) {state.exclusionType=target.dataset.exclusionTab;state.exclusionSearch='';render();}
    else if(target.dataset.remove) {state.draft[paths[target.dataset.type]]=state.draft[paths[target.dataset.type]].filter(value=>value!==target.dataset.remove);render();}
    else if(target.dataset.searchResult) navigateTo(target.dataset.searchResult);
    else if(target.dataset.action?.startsWith('tool-')) toolsDialog(target.dataset.action.slice(5));
    else actions[target.dataset.action]?.();
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.key)state.draft[input.dataset.key]=input.checked;
    if(input.dataset.quality) {
      const keys=new Set(state.draft.allowedCardBuckets);
      qualityKeys(input.dataset.quality).forEach(key=>input.checked?keys.add(key):keys.delete(key));
      if(!keys.size){input.checked=true;toast('Keep at least one base quality enabled.');return;}
      state.draft.allowedCardBuckets=spec.buckets.map(row=>row.key).filter(key=>keys.has(key));
    }
    if(input.dataset.bucket) {
      const keys=new Set(state.draft.allowedCardBuckets);
      if(input.checked)keys.add(input.dataset.bucket);else keys.delete(input.dataset.bucket);
      if(!keys.size){input.checked=true;toast('Keep at least one base card type enabled.');return;}
      state.draft.allowedCardBuckets=spec.buckets.map(row=>row.key).filter(key=>keys.has(key));
    }
    if(input.dataset.exclusion) {
      const restoreFocus=document.activeElement===input;
      const values=new Set(state.draft[paths[input.dataset.type]]);
      if(input.checked)values.add(input.dataset.exclusion);else values.delete(input.dataset.exclusion);
      state.draft[paths[input.dataset.type]]=[...values].sort();
      document.getElementById('exclusion-content').innerHTML=exclusionRows();
      if(restoreFocus)document.querySelector('[data-exclusion="'+CSS.escape(input.dataset.exclusion)+'"]')?.focus({preventScroll:true});
      document.querySelectorAll('[data-exclusion-tab]').forEach(button=>button.querySelector('span').textContent=state.draft[paths[button.dataset.exclusionTab]].length);
    }
    update();
  });
  document.addEventListener('input',event=>{
    const input=event.target;
    if(input.hasAttribute('data-exclusion-search')) {state.exclusionSearch=input.value;state.exclusionPage=0;document.getElementById('exclusion-content').innerHTML=exclusionRows();}
    if(input.hasAttribute('data-setting-search'))document.getElementById('setting-results').innerHTML=searchResults(input.value);
  });
  document.addEventListener('keydown',event=>{if(design!=='guided'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();actions.find();return;}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(dirty())actions.save();}});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){const list=document.querySelector('[data-rating-presets]');if(list&&!list.hidden){event.preventDefault();list.hidden=true;const toggle=document.querySelector('[data-preset-toggle]');toggle.setAttribute('aria-expanded','false');toggle.focus();}}
    if(event.target.matches('.workspace-tabs [role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const sections=['pool','cards','exclusions'];let index=sections.indexOf(state.section);index=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;state.section=sections[index];render();document.querySelector('[data-section="'+state.section+'"]').focus();}
  });
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});

  const setRating=(key,value)=>{
    if(!Number.isFinite(value))return;
    const limits=key==='ratingMin'?[0,state.draft.ratingRange.ratingMax]:[state.draft.ratingRange.ratingMin,99];
    state.draft.ratingRange[key]=Math.max(limits[0],Math.min(limits[1],Math.round(value)));update();
  };
  let ratingDrag=null;
  document.addEventListener('pointerdown',event=>{
    const rail=event.target.closest('[data-rating-rail]');if(!rail||event.button!==0||ratingDrag&&ratingDrag.pointerId!==event.pointerId)return;
    const rect=rail.getBoundingClientRect();const value=(event.clientX-rect.left)/rect.width*99;
    const handle=event.target.closest('[data-rating-handle]');
    const {ratingMin:low,ratingMax:high}=state.draft.ratingRange;
    const closeHandles=rail.parentElement.classList.contains('handles-close');
    const key=handle&&closeHandles?(event.clientY<rect.top+24?'ratingMin':'ratingMax') : handle?.dataset.ratingHandle || (low===high?(value<low?'ratingMin':'ratingMax') : Math.abs(value-low)<Math.abs(value-high)?'ratingMin':'ratingMax');
    ratingDrag={rail,key,pointerId:event.pointerId};rail.setPointerCapture(event.pointerId);
    if(!handle)setRating(key,value);rail.querySelector('[data-rating-handle="'+key+'"]').focus({preventScroll:true});event.preventDefault();
  });
  document.addEventListener('pointermove',event=>{
    if(!ratingDrag||ratingDrag.pointerId!==event.pointerId||!ratingDrag.rail.isConnected)return;
    const rect=ratingDrag.rail.getBoundingClientRect();setRating(ratingDrag.key,(event.clientX-rect.left)/rect.width*99);
  });
  const endRatingDrag=event=>{if(ratingDrag?.pointerId===event.pointerId)ratingDrag=null;};
  document.addEventListener('pointerup',endRatingDrag);document.addEventListener('pointercancel',endRatingDrag);
  window.addEventListener('resize',update);
  document.addEventListener('toggle',event=>{if(event.target.matches('.settings-disclosure'))update();},true);
  document.addEventListener('keydown',event=>{
    const key=event.target.dataset.ratingHandle;if(!key)return;
    const current=state.draft.ratingRange[key];const delta={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1,PageDown:-10,PageUp:10}[event.key];
    if(delta!==undefined){event.preventDefault();setRating(key,current+delta);}
    else if(event.key==='Home'||event.key==='End'){event.preventDefault();setRating(key,event.key==='Home'?0:99);}
  });
  render();
})();
