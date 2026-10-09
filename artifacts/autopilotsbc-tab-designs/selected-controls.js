// Design 2 keeps the existing state and accessibility contract.
const previousControls=window.AutopilotControls;
window.AutopilotControls = context => {
 const base=previousControls(context);
 if(document.body.dataset.design!=='guided')return base;
 const {state,spec,escape,icon}=context;
 const settingIdentity={
  useUnassigned:['Unassigned players','Include unassigned items and prioritize duplicates.','M4 4h16v13H4z M4 12h5l2 3h2l2-3h5 M12 5v5m-3-3 3 3 3-3','mint'],
  onlyStorage:['Storage only','Use stored players and matching club copies.','M4 4h16v5H4z M6 9v11h12V9 M10 13h4','blue'],
  excludeTradable:['Protect tradable players','Keep tradable items out of the solver pool.','M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z m-4 9 3 3 5-6','amber'],
  allowConceptPlayers:['Concept fallback','Try concepts when owned players cannot solve it.','M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h3','violet'],
  excludeSpecial:['Protect special cards','Keep special items out. TOTW and TOTS have their own setting.','M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z m-4 9 3 3 5-6','amber'],
  useTotwPlayers:['TOTW & TOTS players','Allow inform, Team of the Week and Season items.','m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z','blue'],
  useEvolutionPlayers:['Evolution players','Allow evolved items, including duplicate copies.','M6 20V10m6 10V4m6 16V10 M8 8l4-4 4 4','violet']
 };
 const toggle=key=>{
  const [label,description,path,tone]=settingIdentity[key];
  const field=spec.fields.find(row=>row.key===key);
  return `<div class="setting-row identity-row ${tone}"><label class="setting-toggle" for="field-${key}"><span class="setting-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></span><span class="setting-copy"><span class="setting-name">${label}${key==='allowConceptPlayers'?'<span class="beta-mark">Beta</span>':''}</span><span class="setting-summary">${description}</span></span><span class="switch"><input type="checkbox" id="field-${key}" data-key="${key}" ${state.draft[key]?'checked':''}><span class="switch-track"></span></span></label><button class="field-help" data-help="${key}" aria-label="About ${label}" aria-expanded="false" aria-controls="help-${key}">?</button><p class="field-description" id="help-${key}" hidden>${escape(field.help)}${key==='allowConceptPlayers'?' Concept players must be owned before submission. Points SBCs use owned players only.':''}</p></div>`;
 };
 const qualityMark=(quality)=>`<svg class="quality-card ${quality}" viewBox="0 0 30 38" aria-hidden="true"><path d="M3 2h24v25l-12 9L3 27Z"/><path d="M7 7h16M7 11h10M8 26l7 5 7-5"/></svg>`;
 const itemShell=quality=>{
  const colors={bronze:['#9b7051','#d9ac83','#ad7953'],silver:['#8f99a6','#e3e8ed','#a4afbd'],gold:['#ae8d38','#efdc93','#c0a34f']}[quality];
  const outline='M7 11 20 6 Q34 0 48 6 L61 11 61 65 55 70 55 73 34 85 13 73 13 70 7 65Z';
  return `<svg class="item-shell" viewBox="0 0 68 90" aria-hidden="true"><defs><linearGradient id="metal-${quality}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset=".45" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient><clipPath id="shell-${quality}"><path d="${outline}"/></clipPath></defs><path d="${outline}" fill="url(#metal-${quality})" stroke="${colors[1]}"/><g clip-path="url(#shell-${quality})"><path d="M7 13 61 43 61 57 7 27Z" fill="#fff" opacity=".12"/><path d="M-4 60 76 9M-4 73 76 22" stroke="#fff" stroke-width="1" opacity=".24"/><path d="M51 0 63 10 63 68 52 77Z" fill="#302715" opacity=".15"/><path d="M18 65h32M22 70h24" stroke="#302715" opacity=".2"/></g></svg>`;
 };
 const rating=()=>{
  const {ratingMin:low,ratingMax:high}=state.draft.ratingRange;
 const ceiling=high>=99?'':` Maximum stops at ${high}.`;
 return `<section class="rating-editor" aria-label="Player rating range"><div class="rating-heading"><strong>Player rating range</strong><output data-rating-summary>${low}<span>–</span>${high}<small>OVR</small></output></div><div class="range-endpoints"><span>Minimum</span><span>Maximum</span></div><div class="rating-control" style="--low:${low/99*100}%;--high:${high/99*100}%"><div class="rating-scale" data-rating-rail><div class="rating-quality bronze-band"></div><div class="rating-quality silver-band"></div><div class="rating-quality gold-band"></div><div class="rating-selection"></div>${[['ratingMin',low,'low','Minimum',0,high],['ratingMax',high,'high','Maximum',low,99]].map(([key,value,cls,label,min,max])=>`<button type="button" role="slider" class="rating-handle ${cls}-handle" data-rating-handle="${key}" aria-label="${label} player rating" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}" aria-valuetext="${value} OVR ${label.toLowerCase()}"><span data-handle-value="${key}">${value}</span></button>`).join('')}</div></div><div class="rating-ticks" aria-hidden="true"><span class="edge">0</span><span style="left:${64/99*100}%">64</span><span style="left:${74/99*100}%">74</span><span class="edge" style="left:100%">99</span></div><div class="rating-presets" aria-label="Set rating range">${[['bronze','Bronze','0–64'],['silver','Silver','65–74'],['gold','Gold','75–99']].map(([key,label,range])=>`<button type="button" data-rating-preset="${key}" aria-pressed="false">${qualityMark(key)}<span>${label}<small>${range} OVR</small></span></button>`).join('')}<button type="button" class="all-ratings" data-rating-preset="all" aria-pressed="false">All<small>0–99</small></button></div><p class="rating-instruction">Drag either handle. Arrow keys move by 1 OVR.${ceiling}</p></section>`;
 };
 const buckets=()=>`<fieldset class="bucket-editor"><legend><span>Base card qualities</span><span data-bucket-count></span></legend><div class="quality-options">${['bronze','silver','gold'].map(quality=>`<label class="card-option quality-${quality}"><input type="checkbox" data-quality="${quality}" aria-label="Allow ${quality} players" ${state.draft.allowedCardBuckets.some(key=>key.endsWith('_'+quality))?'checked':''}><span class="card-option-state" aria-hidden="true">${icon('check')}</span>${itemShell(quality)}<span class="quality-label">${quality.charAt(0).toUpperCase()+quality.slice(1)}</span></label>`).join('')}</div><p class="bucket-limit" data-bucket-limit hidden>Keep at least one base quality enabled.</p></fieldset>`;
 return {...base,toggle,rating,buckets};
};
