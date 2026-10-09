const {chromium,launchOptions}=require('../../tests/browser-test-runtime.cjs');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch(launchOptions);
 const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true});
 const checks=[],layouts=[],errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8766'))requests.push(r.url());});
 const assert=(name,pass)=>{if(!pass)throw Error(name);checks.push(name);};
 const shot=name=>page.screenshot({path:path.join(__dirname,'screenshots','02-focused-'+name+'.png')});
 const metrics=()=>{
  const r=s=>document.querySelector(s).getBoundingClientRect();
  const stage=r('.ea-main'),head=r('.head-frame'),body=r('.content-frame'),save=r('.selected-save-frame');
  const tab=document.querySelector('.workspace-tabs [aria-selected=true]'),t=tab.getBoundingClientRect();
  const scroller=document.querySelector('.page-scroll');
  return {width:innerWidth,height:innerHeight,scroll:scroller.scrollTop,pageScrollTop:r('.page-scroll').top,contentTop:r('#settings-page').top,headTop:r('.workspace-head').top,headBottom:r('.workspace-head').bottom,tabTop:r('.workspace-tabs').top,headPosition:getComputedStyle(document.querySelector('.workspace-head')).position,headInScroll:!!document.querySelector('.workspace-head').closest('.page-scroll'),centerError:Math.abs((head.left+head.right-stage.left-stage.right)/2),alignmentError:Math.max(Math.abs(head.left-body.left),Math.abs(head.right-body.right),Math.abs(save.left-head.left),Math.abs(save.right-head.right)),overflow:document.documentElement.scrollWidth>innerWidth,footerVisible:r('.savebar').bottom<=innerHeight,tabHit:scroller.scrollTop<1&&document.elementFromPoint(t.left+t.width/2,t.top+t.height/2)?.closest('[data-section]')===tab,contentBelowHead:r('#settings-page').top>=r('.workspace-head').bottom-1||scroller.scrollTop>1};
 };
 try{
  await page.goto('http://127.0.0.1:8766/02-guided.html?v=focused');
  await page.evaluate(()=>localStorage.removeItem('autopilot-design-guided'));await page.reload();
  assert('no overflow menu, setting search, or solver launchers',await page.locator('[data-action=more],[data-action=find],[data-action^="tool-"]').count()===0);
  assert('four auxiliary actions exist in their new homes',await page.locator('.project-links a,.project-links button,.save-utility button').count()===3&&await page.locator('.version-label[data-action=changelog]').count()===1&&await page.locator('.save-utility [data-action=reset]').count()===1);
  assert('header actions are not crowded into the top bar',await page.locator('.head-bar a,.head-bar button:not([data-section])').count()===0);
  const value=async key=>Number(await page.locator(`[data-rating-handle=${key}]`).getAttribute('aria-valuenow'));
  await page.locator('[data-rating-preset=silver]').click();
  assert('silver preset selects real OVR range',await value('ratingMin')===65&&await value('ratingMax')===74);
  assert('preset clearly shows its selected state',await page.locator('[data-rating-preset=silver]').getAttribute('aria-pressed')==='true');
  await page.locator('[data-rating-preset=all]').click();
  const max=page.locator('[data-rating-handle=ratingMax]');await max.focus();await max.press('ArrowLeft');
  assert('keyboard changes both thumb value and ARIA',await value('ratingMax')===98&&await page.locator('[data-handle-value=ratingMax]').innerText()==='98');
  const rail=await page.locator('[data-rating-rail]').boundingBox(),handle=await max.boundingBox();
  await page.mouse.move(handle.x+22,handle.y+22);await page.mouse.down();await page.mouse.move(rail.x+rail.width*82/99,rail.y+28,{steps:8});
  assert('real mouse drag updates before release',await value('ratingMax')===82);await page.mouse.up();
  await page.locator('[data-rating-handle=ratingMin]').press('End');
  assert('endpoints clamp without swapping',await value('ratingMin')===82&&await value('ratingMax')===82);
  await page.locator('[data-rating-handle=ratingMin]').press('ArrowLeft');assert('meeting endpoints remain separable',await value('ratingMin')===81);
  await page.locator('[data-rating-preset=all]').click();
  await page.locator('#tab-cards').click();
  assert('three FC27 base qualities',await page.locator('.card-option').count()===3&&await page.locator('[data-quality]').count()===3);
  assert('no obsolete Common or Rare choices',!(/common|rare/i.test(await page.locator('.bucket-editor').innerText())));
  await page.locator('.quality-gold').click();
  assert('entire quality tile toggles choice',!(await page.locator('[data-quality=gold]').isChecked()));
  await page.locator('[data-quality=gold]').focus();await page.keyboard.press('Space');assert('quality tile supports keyboard selection',await page.locator('[data-quality=gold]').isChecked());
  await page.locator('[data-quality=bronze]').uncheck();await page.locator('[data-quality=silver]').uncheck();
  assert('last quality has an explained constraint',await page.locator('[data-quality]:checked').isDisabled()&&await page.locator('[data-bucket-limit]').isVisible());
  await page.locator('[data-quality=bronze]').check();assert('enabling another releases last-quality constraint',await page.locator('[data-quality]:checked:disabled').count()===0);
  await page.locator('[data-action=save]').click();
  assert('quality adapter covers both legacy groups',await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('autopilot-design-guided')).allowedCardBuckets)===JSON.stringify(['common_bronze','rare_bronze','common_gold','rare_gold'])));
  await page.reload();await page.locator('#tab-cards').click();assert('quality preferences survive reload',await page.locator('[data-quality=gold]').isChecked()&&!await page.locator('[data-quality=silver]').isChecked());
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('autopilot-design-guided'));s.allowedCardBuckets=['rare_silver'];localStorage.setItem('autopilot-design-guided',JSON.stringify(s));});
  await page.reload();await page.locator('#tab-cards').click();
  assert('old partial preference becomes a whole quality',await page.locator('[data-quality=silver]').isChecked()&&await page.locator('[data-quality]:checked').count()===1);
  await page.locator('[data-quality=gold]').check();await page.locator('[data-action=save]').click();
  assert('normalized preference has no invisible legacy restriction',await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('autopilot-design-guided')).allowedCardBuckets)===JSON.stringify(['common_silver','rare_silver','common_gold','rare_gold'])));
  await page.locator('#tab-exclusions').click();
  await page.locator('.exclusion-choice').filter({hasText:'Premier League'}).click();
  assert('entire exclusion row selects with explicit state',await page.locator('[data-exclusion="Premier League"]').isChecked()&&await page.locator('.exclusion-choice').filter({hasText:'Premier League'}).locator('.state-on').isVisible());
  assert('exclusion focus survives rerender',await page.evaluate(()=>document.activeElement.dataset.exclusion==='Premier League'));
  await page.keyboard.press('Space');assert('keyboard can unselect the same row',!await page.locator('[data-exclusion="Premier League"]').isChecked());
  await page.keyboard.press('Space');
  await page.locator('[data-exclusion-search]').fill('Premier');assert('search retains selected state',await page.locator('.exclusion-choice').count()===1&&await page.locator('[data-exclusion="Premier League"]').isChecked());
  await page.locator('[data-exclusion-search]').fill('');
  await page.locator('[data-exclusion-tab=nations]').click();await page.locator('.exclusion-choice').filter({hasText:'Brazil'}).click();
  await page.locator('[data-action=clear-exclusions]').click();assert('clear affects only current category',await page.locator('[data-exclusion-tab=leagues] span').innerText()==='1'&&await page.locator('[data-exclusion-tab=nations] span').innerText()==='0');
  await page.locator('[data-exclusion-tab=players]').click();assert('player entry point remains accurate',await page.locator('#exclusion-content').innerText().then(s=>s.includes('item details')));
  await page.locator('#tab-pool').click();await page.locator('[data-help=allowConceptPlayers]').click();assert('source help is accessible',await page.locator('#help-allowConceptPlayers').isVisible());await page.locator('[data-help=allowConceptPlayers]').click();
  await page.locator('[data-action=save]').click();await page.reload();await page.locator('#tab-exclusions').click();assert('exclusions persist after reload',await page.locator('[data-exclusion="Premier League"]').isChecked());
  await page.locator('[data-exclusion="Premier League"]').uncheck();await page.locator('[data-action=undo]').click();assert('discard restores saved choices',await page.locator('[data-exclusion="Premier League"]').isChecked());
  await page.locator('[data-action=reset]').click();await page.locator('[data-action=confirm-reset]').click();await page.locator('[data-action=save]').click();assert('reset restores real defaults',await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('autopilot-design-guided')))===JSON.stringify(AutoPilotSpec.defaults)));
  await page.locator('[data-action=changelog]').click();assert('direct changelog action works',await page.locator('#modal-body').innerText().then(s=>s.includes('1.11.2')));await page.keyboard.press('Escape');
  for(const viewport of [{width:1920,height:1080},{width:1280,height:800},{width:768,height:1024},{width:390,height:844}]){
   await page.setViewportSize(viewport);
   for(const section of ['pool','cards','exclusions']){
    await page.locator('#tab-'+section).click();
    if(section==='exclusions'){await page.locator('[data-exclusion-tab=leagues]').click();await page.locator('[data-exclusion="Premier League"]').check();}
    const before=await page.evaluate(metrics);
    for(const scroll of [80,240,10000,0]){
     await page.locator('.page-scroll').evaluate((el,value)=>el.scrollTop=value,scroll);
     const after=await page.evaluate(metrics);layouts.push({section,requestedScroll:scroll,...after});
     const delta=after.scroll-before.scroll;
     const headTracksScroll=Math.abs((before.headTop-after.headTop)-delta)<1.5;
     const tabsTrackScroll=Math.abs((before.tabTop-after.tabTop)-delta)<1.5;
     const contentTracksScroll=Math.abs((before.contentTop-after.contentTop)-delta)<1.5;
     const tabsUsable=after.scroll<1?after.tabHit:true;
      assert(viewport.width+' '+section+' scroll '+scroll+' scrolls the header and tabs away and keeps center, alignment and save bar',headTracksScroll&&tabsTrackScroll&&contentTracksScroll&&tabsUsable&&after.headPosition!=='fixed'&&after.headInScroll&&after.centerError<1&&after.alignmentError<1&&!after.overflow&&after.footerVisible&&after.contentBelowHead);
    }
    if(viewport.width===1280||viewport.width===390){
     if(section==='cards')await page.locator('[data-quality=gold]').uncheck();
     await shot(section+'-'+viewport.width+'-top');
     if(viewport.width===1280&&section==='cards')await page.locator('.card-zone').screenshot({path:path.join(__dirname,'screenshots','02-focused-card-control.png')});
     if(viewport.width===1280&&section==='exclusions')await page.locator('.exclusion-choice').filter({hasText:'Premier League'}).screenshot({path:path.join(__dirname,'screenshots','02-focused-excluded-row.png')});
     await page.locator('.page-scroll').evaluate(el=>el.scrollTop=240);await shot(section+'-'+viewport.width+'-scrolled');
    }
   }
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#tab-pool').click();await page.locator('[data-rating-preset=all]').click();
  const touchRail=await page.locator('[data-rating-rail]').boundingBox();await page.touchscreen.tap(touchRail.x+touchRail.width*79/99,touchRail.y+28);assert('touch track sets rating',Math.abs(await value('ratingMax')-79)<=1);
  assert('no page errors',errors.length===0);assert('no external requests',requests.length===0);
  fs.writeFileSync(path.join(__dirname,'selected-review.json'),JSON.stringify({checks,layouts,errors,requests},null,2));console.log(JSON.stringify({checks:checks.length,layouts:layouts.length,errors,requests}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
