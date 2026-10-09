window.AutopilotDirections = a => {
 const {state,button,rating,buckets,toggles,groups,exclusions,savebar,totalExcluded}=a;
 const labels={pool:'Player pool',cards:'Card types',exclusions:'Exclusions'};
 const header=()=>`<header class="workspace-header"><div><h1>Global settings</h1><p>Defaults for your SBC solver</p></div><button class="more-button" data-action="more" aria-label="More settings and project actions">···</button></header>`;
 const nav=()=>`<nav class="workspace-tabs" role="tablist" aria-label="Settings categories">${Object.entries(labels).map(([key,label])=>`<button id="tab-${key}" role="tab" tabindex="${state.section===key?'0':'-1'}" aria-selected="${state.section===key}" aria-controls="settings-page" data-section="${key}" class="${state.section===key?'active':''}">${label}${key==='exclusions'&&totalExcluded()?`<span class="nav-count">${totalExcluded()}</span>`:''}</button>`).join('')}</nav>`;
 const panel=(title,body,cls='')=>`<section class="settings-panel ${cls}">${title?`<h2>${title}</h2>`:''}${body}</section>`;
 const poolRules=()=>toggles(groups.pool)+`<div class="optional-rule">${toggles(groups.concepts)}</div>`;
 const poolPage=()=>`<div class="tab-pair">${panel('',rating(),'range-panel')}${panel('Available players',poolRules(),'options-panel')}</div>`;
 const cardsPage=()=>`<div class="tab-pair">${panel('',buckets(),'matrix-panel')}${panel('Special cards',toggles(groups.cards),'options-panel')}</div>`;
 const page=()=>state.section==='exclusions'?panel('Exclusions',exclusions(),'exclusions-panel'):state.section==='cards'?cardsPage():poolPage();
 const detailSummary=()=>`<div class="configuration-line" data-configuration-summary></div>`;
 const frame=key=>`<div class="workspace revision-${key}"><div class="page-scroll"><div class="content-frame">${header()}${nav()}${key==='editorial'?detailSummary():''}<div id="settings-page" class="tab-page" role="tabpanel" aria-labelledby="tab-${state.section}">${page()}</div></div></div>${savebar()}</div>`;
 return Object.fromEntries(['native','guided','inspector','editorial','builder'].map(key=>[key,()=>frame(key)]));
};
