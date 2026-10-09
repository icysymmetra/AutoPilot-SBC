// Browser integration checks. Start a repo-root HTTP server on port 8767 first.
const {chromium,launchOptions}=require('./browser-test-runtime.cjs');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch(launchOptions);
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
  const shotdir=path.resolve('artifacts/autopilot-settings-integration');fs.mkdirSync(shotdir,{recursive:true});
  try{
    const badgeRequests=[];
    const flagRequests=[];
    await page.route('https://example.test/flags/dark/*',route=>{
      flagRequests.push(route.request().url());
      return route.request().url().endsWith('/45.png')?route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><path fill="#fff" d="M0 0h60v40H0z"/><path stroke="#c33" stroke-width="8" d="M30 0v40M0 20h60"/></svg>'}):route.abort();
    });
    await page.route('https://example.test/leagues/dark/*',route=>{
      badgeRequests.push(route.request().url());
      return route.request().url().endsWith('/13.png')?route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path fill="#fff" d="M8 4h24v24L20 38 8 28z"/></svg>'}):route.abort();
    });
    let styleRequests=0;
    await page.route('**/page/autopilot-settings.css',route=>{++styleRequests;return route.abort();});
    await page.goto('http://127.0.0.1:8767/tests/fixtures/autopilot-settings.html');
    await page.getByText('No unsaved changes',{exact:true}).waitFor();
    check('opening settings requires no stylesheet request',styleRequests===0);
    check('CSS is present before the detached settings surface is mounted',await page.evaluate(()=>{const s=AutopilotSettingsTab.createSurface(fixture.api);const r=s.host.shadowRoot;const ready=r.firstElementChild.tagName==='STYLE'&&r.firstElementChild.textContent===AutopilotSettingsCSS&&r.querySelector('.workspace');s.dispose();return !!ready}));
    check('cold-cache settings open already styled without a loading overlay',await page.locator('.autopilot-settings').evaluate(root=>getComputedStyle(root).visibility==='visible'&&getComputedStyle(root).backgroundColor==='rgb(16, 24, 32)'&&!root.inert));
    const shadow=()=>page.locator('.ea-data-autopilot-native-view');
    const value=key=>page.locator(`[data-rating-handle=${key}]`).getAttribute('aria-valuenow');
    await page.locator('[data-rating-preset=silver]').click();
    check('preset changes the draft without writing storage',await value('ratingMin')==='65'&&await value('ratingMax')==='74'&&await page.evaluate(()=>fixture.saves.length)===0);
    await page.locator('[data-rating-handle=ratingMax]').press('ArrowLeft');
    check('keyboard changes values and ARIA within the limits',await value('ratingMax')==='73');
    await page.getByRole('button',{name:'Save Global',exact:true}).click();
    await page.getByText('Global settings saved.',{exact:true}).waitFor();
    check('save carries actual solver keys',await page.evaluate(()=>fixture.saved.ratingRange.ratingMax===73&&fixture.saved.excludedPlayerIds[0]==='9001'));
    await page.getByRole('button',{name:'SBC',exact:true}).click();
    await page.getByRole('button',{name:'Autopilot',exact:true}).click();
    check('native return refreshes preferences',await value('ratingMax')==='73');
    await page.locator('[data-rating-preset=all]').click();
    await page.getByRole('button',{name:'Discard changes',exact:true}).click();
    check('discard restores saved values',await value('ratingMax')==='73');

    // A failed store write leaves the user's edit in place and permits a retry.
    await page.locator('[data-rating-preset=gold]').click();
    await page.evaluate(()=>fixture.failSave=true);
    await page.getByRole('button',{name:'Save Global',exact:true}).click();
    await page.getByText(/Could not save settings/).waitFor();
    check('failed save retains draft and does not claim success',await value('ratingMin')==='75'&&await page.getByRole('button',{name:'Save Global',exact:true}).isEnabled());
    await page.evaluate(()=>fixture.failSave=false);
    await page.getByRole('button',{name:'Discard changes',exact:true}).click();

    // External changes must not erase a draft or get overwritten by unrelated edits.
    await page.locator('[data-rating-preset=bronze]').click();
    await page.evaluate(()=>{fixture.saved.onlyStorage=true;for(const s of fixture.registry)s.sync(fixture.saved)});
    check('external changes warn while preserving local draft',await value('ratingMax')==='64'&&await page.locator('.pending-note').isVisible());
    await page.getByRole('button',{name:'Save Global',exact:true}).click();
    await page.getByText('Global settings saved.',{exact:true}).waitFor();
    check('saving merges only edited fields into current preferences',await page.evaluate(()=>fixture.saved.onlyStorage===true&&fixture.saved.ratingRange.ratingMax===64));

    await page.getByRole('tab',{name:'Card types',exact:true}).click();
    await page.getByRole('checkbox',{name:'Allow silver players',exact:true}).uncheck();
    await page.getByRole('checkbox',{name:'Allow bronze players',exact:true}).uncheck();
    check('last quality cannot be disabled',!(await page.getByRole('checkbox',{name:'Allow gold players',exact:true}).isEnabled()));
    await page.getByRole('button',{name:'Save Global',exact:true}).click();
    await page.getByText('Global settings saved.',{exact:true}).waitFor();
    check('FC27 quality maps to both legacy bucket keys',await page.evaluate(()=>fixture.saved.allowedCardBuckets.length===2&&fixture.saved.allowedCardBuckets.includes('common_gold')&&fixture.saved.allowedCardBuckets.includes('rare_gold')));

    await page.getByRole('tab',{name:'Exclusions 1',exact:true}).click();
    const premierBadge=page.getByRole('checkbox',{name:'Exclude Premier League',exact:true}).locator('..').locator('img');
    await premierBadge.evaluate(image=>image.complete?null:new Promise(resolve=>image.addEventListener('load',resolve,{once:true})));
    check('league rows render actual ID-based assets with decorative alt text',await premierBadge.evaluate(image=>image.naturalWidth>0&&image.alt===''&&image.src.endsWith('/13.png')&&getComputedStyle(image.parentElement).clipPath==='none'));
    const missingBadge=page.getByRole('checkbox',{name:'Exclude Ligue 1',exact:true}).locator('..').locator('.asset-fallback');
    await missingBadge.waitFor({state:'visible'});
    check('missing league assets fall back without broken image glyphs',await page.getByRole('checkbox',{name:'Exclude Ligue 1',exact:true}).locator('..').locator('img').count()===0);
    check('unsafe image URLs are rejected',await page.getByRole('checkbox',{name:'Exclude <League & Club>',exact:true}).locator('..').locator('img').count()===0);
    await page.getByRole('checkbox',{name:'Exclude Premier League',exact:true}).check();
    await page.getByRole('button',{name:'Save Global',exact:true}).click();
    await page.getByText('Global settings saved.',{exact:true}).waitFor();
    check('exclusions persist IDs, not display strings',await page.evaluate(()=>fixture.saved.excludedLeagueIds[0]==='13'));
    await page.getByRole('searchbox',{name:'Search leagues',exact:true}).fill('<');
    check('catalog names are escaped safely',await page.getByRole('checkbox',{name:'Exclude <League & Club>',exact:true}).isVisible());
    await page.getByRole('searchbox',{name:'Search leagues',exact:true}).fill('');
    check('failed icons are not requested again when rows rerender',badgeRequests.filter(url=>url.endsWith('/16.png')).length===1);

    await page.getByRole('tab',{name:'Nations 0',exact:true}).click();
    const englandFlag=page.getByRole('checkbox',{name:'Exclude England',exact:true}).locator('..').locator('img');
    await englandFlag.evaluate(image=>image.complete?null:new Promise(resolve=>image.addEventListener('load',resolve,{once:true})));
    const flagState=await englandFlag.evaluate(image=>({width:image.naturalWidth,height:image.naturalHeight,alt:image.alt,src:image.src,fit:getComputedStyle(image).objectFit,clip:getComputedStyle(image.parentElement).clipPath}));
    check('nation rows load flags by ID without stretching or clipping',flagState.width/flagState.height===1.5&&flagState.alt===''&&flagState.src.endsWith('/45.png')&&flagState.fit==='contain'&&flagState.clip==='none');
    await page.getByRole('checkbox',{name:'Exclude France',exact:true}).locator('..').locator('.asset-fallback').waitFor({state:'visible'});
    check('missing nation flags use a fallback without broken images',await page.getByRole('checkbox',{name:'Exclude France',exact:true}).locator('..').locator('img').count()===0);
    await page.getByRole('searchbox',{name:'Search nations',exact:true}).fill('England');
    await page.getByRole('searchbox',{name:'Search nations',exact:true}).fill('');
    check('failed flags are not retried during filtering',flagRequests.filter(url=>url.endsWith('/14.png')).length===1);
    check('flag rendering preserves nation exclusion IDs and saved settings',await page.getByRole('checkbox',{name:'Exclude England',exact:true}).getAttribute('data-exclusion')==='45'&&await page.evaluate(()=>fixture.saved.excludedNationIds.length===0));

    await page.getByRole('button',{name:'Reset',exact:true}).click();
    await page.getByRole('button',{name:'Reset defaults',exact:true}).click();
    check('reset remains a draft until Save Global',await page.evaluate(()=>fixture.saved.excludedLeagueIds[0]==='13'));
    await page.getByRole('button',{name:'Discard changes',exact:true}).click();
    await page.getByRole('button',{name:'Changelog, version 1.11.3',exact:true}).click();
    check('version chip invokes the real adapter action',await page.evaluate(()=>fixture.changelogCount)===1);

    const layouts=[];
    for(const width of [1920,1440,768,390]){
      await page.setViewportSize({width,height:width===390?844:900});
      for(const tab of ['Player pool','Card types','Exclusions 2']){
        await page.getByRole('tab',{name:tab,exact:true}).click();
        const m=await shadow().evaluate(host=>{const r=host.shadowRoot;const rect=s=>r.querySelector(s)?.getBoundingClientRect();
          const panel=rect('.unified-panel'),head=rect('.head-frame'),save=rect('.selected-save-frame');
          return{width:host.clientWidth,panel:Math.round(panel.width),headX:Math.round(head.left),panelX:Math.round(panel.left),saveX:Math.round(save.left),
            overflow:host.scrollWidth>host.clientWidth,saveBottom:Math.round(rect('.savebar').bottom),viewBottom:Math.round(host.getBoundingClientRect().bottom),
            helper:r.querySelector('.rating-instruction')?getComputedStyle(r.querySelector('.rating-instruction')).fontSize:null};});
        check(`layout ${width} ${tab}`,!m.overflow&&m.headX===m.panelX&&m.saveX===m.panelX&&m.saveBottom<=m.viewBottom);
        layouts.push({width,tab,...m});
        await page.screenshot({path:path.join(shotdir,`${width}-${tab.replace(/ /g,'-')}.png`)});
      }
    }
    check('styles are isolated from host page CSS',await page.evaluate(()=>!document.querySelector('.workspace-tabs')&&getComputedStyle(document.body).backgroundColor==='rgb(16, 24, 32)'));
    check('no browser runtime errors',errors.length===0);
    fs.writeFileSync(path.join(shotdir,'review.json'),JSON.stringify({checks,layouts,errors},null,2));
    console.log(JSON.stringify({checks:checks.length,layouts:layouts.length,errors}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
