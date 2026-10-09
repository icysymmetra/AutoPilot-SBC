const previousDirections=window.AutopilotDirections;
window.AutopilotDirections=a=>{
 const layouts=previousDirections(a);
 const {state,spec,icon,button,rating,buckets,toggles,groups,exclusions,savebar,totalExcluded}=a;
 layouts.guided=()=>{
 const nav=`<nav class="workspace-tabs" role="tablist" aria-label="Settings categories">${[['pool','Player pool'],['cards','Card types'],['exclusions','Exclusions']].map(([key,label])=>`<button role="tab" id="tab-${key}" tabindex="${state.section===key?0:-1}" aria-selected="${state.section===key}" aria-controls="settings-page" class="${state.section===key?'active':''}" data-section="${key}">${label}${key==='exclusions'?`<span class="nav-count">${totalExcluded()}</span>`:''}</button>`).join('')}</nav>`;
  const panel=state.section==='pool'?`<section class="unified-panel"><div class="rating-zone">${rating()}</div><section class="preference-zone"><h2>Available players</h2>${toggles([...groups.pool,...groups.concepts])}</section></section>`:state.section==='cards'?`<section class="unified-panel"><div class="card-zone">${buckets()}</div><section class="preference-zone"><h2>Special cards</h2>${toggles(groups.cards)}</section></section>`:`<section class="unified-panel exclusion-zone">${exclusions()}</section>`;
  const footer=savebar()
    .replace('<footer class="savebar">','<footer class="savebar"><div class="selected-save-frame">')
    .replace('<div class="save-actions">','<div class="save-actions"><div class="save-utility">'+button('Reset','reset','quiet reset-action')+'</div>')
    .replace('</footer>','</div></footer>');
  const projectFooter=`<footer class="project-footer"><div class="project-footer-frame"><div class="project-identity"><span class="project-mark" aria-hidden="true">${icon('pilot')}</span><span class="project-identity-text"><strong>AutopilotSBC</strong><small>FC27 SBC Solver &middot; v${spec.version}</small></span></div><nav class="project-links" aria-label="Project links"><a class="footer-link" href="https://github.com/just-a-weird-guy/AutoPilot-SBC" target="_blank" rel="noopener">${icon('code')}<span>Source code</span></a><a class="footer-link support" href="https://ko-fi.com/P5P5YOUU7" target="_blank" rel="noopener">${icon('heart')}<span>Support my work</span></a></nav></div></footer>`;
  return `<div class="workspace selected-workspace"><div class="page-scroll"><div class="workspace-head"><div class="head-frame"><div class="head-top"><h1 class="workspace-title"><span>Global settings<span class="heading-period" aria-hidden="true">.</span></span><span class="workspace-subtitle">Choose which players Autopilot can use.</span></h1><button type="button" class="version-label" data-action="changelog" title="Open the changelog" aria-label="Changelog, version ${spec.version}">${icon('sbc')}<span>v${spec.version}</span>${icon('arrow','version-arrow')}</button></div><div class="head-bar">${nav}</div></div></div><div class="content-frame"><div id="settings-page" class="tab-page" role="tabpanel" aria-labelledby="tab-${state.section}">${panel}</div>${projectFooter}</div></div>${footer}</div>`;
 };
 return layouts;
};
