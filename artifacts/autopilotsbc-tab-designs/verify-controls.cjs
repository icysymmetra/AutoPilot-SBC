const {chromium,launchOptions}=require('../../tests/browser-test-runtime.cjs');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch(launchOptions);
 const results=[];
 try {
 // The selected design has its own review of scrolling and redesigned controls.
 for(const file of ['01-native','03-inspector','04-editorial','05-builder']){
  const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true});const errors=[],requests=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8766'))requests.push(r.url());});
  const assert=(name,ok)=>{if(!ok)throw Error(file+': '+name);checks.push(name);};
  await page.goto(`http://127.0.0.1:8766/${file}.html`);await page.evaluate(()=>localStorage.clear());await page.reload();
  const more=async()=>page.locator('[data-action="more"]').click();
  const find=async key=>{await more();await page.locator('[data-action="find"]').click();await page.locator(`[data-search-result="${key}"]`).click();};
  const value=async key=>Number(await page.locator(`[data-rating-handle="${key}"]`).getAttribute('aria-valuenow'));
  const save=async()=>page.locator('[data-action="save"]').click();
  assert('no challenge selector or context-bound launchers',await page.locator('#demo-context,[data-action="tool-solve"],[data-action="tool-points"],[data-action="tool-multi"],[data-action="tool-set"]').count()===0);
  assert('no number boxes in settings',await page.locator('input[type=number]').count()===0);
  await find('ratingRange');const min=page.locator('[data-rating-handle="ratingMin"]'),max=page.locator('[data-rating-handle="ratingMax"]');
  assert('two accessible OVR handles',await page.getByRole('slider').count()===2);
  const rail=await page.locator('[data-rating-rail]').boundingBox();
  await page.mouse.click(rail.x+rail.width*64/99,rail.y+24);
  assert('track click changes nearest endpoint',await value('ratingMin')===0 && await value('ratingMax')===64);
  await max.press('ArrowRight');assert('keyboard one OVR precision',await value('ratingMax')===65);
  await max.press('PageUp');assert('keyboard ten OVR movement',await value('ratingMax')===75);
  let handle=await max.boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(rail.x+rail.width*83/99,rail.y+24,{steps:8});
  assert('live readout during drag',await value('ratingMax')===83 && await page.locator('[data-rating-summary]').innerText().then(s=>s.includes('83')));await page.mouse.up();
  await min.press('End');assert('minimum clamps at maximum',await value('ratingMin')===83);
  await max.press('Home');assert('maximum clamps at minimum',await value('ratingMax')===83);
  await page.mouse.move(rail.x+rail.width*83/99,rail.y+14);await page.mouse.down();await page.mouse.move(rail.x+rail.width*70/99,rail.y+14,{steps:6});await page.mouse.up();
  assert('coincident handles can be separated by dragging minimum',await value('ratingMin')===70&&await value('ratingMax')===83);
  await min.press('Home');await max.press('End');assert('collapsed handles can be separated with keyboard',await value('ratingMin')===0&&await value('ratingMax')===99);
  await max.press('ArrowLeft');await save();await page.reload();await find('ratingRange');assert('slider value persists after reload',await value('ratingMax')===98);
  await max.press('ArrowLeft');await page.locator('[data-action="undo"]').click();await find('ratingRange');assert('discard restores saved range',await value('ratingMax')===98);
  for(const key of ['useUnassigned','onlyStorage','excludeTradable','excludeSpecial','useTotwPlayers','useEvolutionPlayers','allowConceptPlayers']){await find(key);assert(key+' directly reachable',await page.locator(`[data-key="${key}"]`).isVisible());}
  await page.locator('[data-help="allowConceptPlayers"]').click();assert('concept help explains owned-only points rule',await page.locator('#help-allowConceptPlayers').innerText().then(s=>s.includes('Points SBCs')));await page.locator('[data-help="allowConceptPlayers"]').click();
  assert('help collapses without hiding control',await page.locator('#help-allowConceptPlayers').isHidden()&&await page.locator('[data-key="allowConceptPlayers"]').isVisible());
  await find('allowedCardBuckets');assert('six card matrix cells',await page.locator('[data-bucket]').count()===6);
  for(const input of (await page.locator('[data-bucket]').all()).slice(0,5))await input.click();
  assert('last card type is retained with explanation',await page.locator('[data-bucket]:checked').count()===1 && await page.locator('[data-bucket]:checked').isDisabled() && await page.locator('[data-bucket-limit]').isVisible());
  await page.locator('[data-bucket]').first().check();assert('last-type constraint releases after enabling another',await page.locator('[data-bucket]:checked:disabled').count()===0);
  await find('exclusions');await page.locator('[data-exclusion="Premier League"]').check();assert('selected exclusion removable',await page.locator('[data-remove="Premier League"]').isVisible());
  await page.locator('[data-exclusion-search]').fill('Premier');assert('collection search filters',await page.locator('[data-exclusion]').count()===1);
  await page.locator('[data-exclusion-tab="nations"]').click();await page.locator('[data-exclusion="Brazil"]').check();await page.locator('[data-action="clear-exclusions"]').click();
  assert('clear affects selected category only',await page.locator('[data-exclusion-tab="leagues"] span').innerText()==='1'&&await page.locator('[data-exclusion-tab="nations"] span').innerText()==='0');
  await page.locator('[data-exclusion-tab="players"]').click();assert('player exclusion entry point retained',await page.locator('#exclusion-content').innerText().then(s=>s.includes('item details')));
  assert('no solver launch area',await page.locator('[data-action^="tool-"]').count()===0);
  assert('three top-bar tabs',await page.locator('.workspace-tabs [role="tab"]').count()===3);
  await page.locator('[data-section="pool"]').click();await page.locator('[data-preset-toggle]').click();await page.locator('[data-rating-preset="silver"]').click();assert('quality preset sets precise range',await value('ratingMin')===65&&await value('ratingMax')===74);
  await page.locator('[data-preset-toggle]').click();await page.keyboard.press('Escape');assert('rating preset menu closes with Escape',await page.locator('[data-rating-presets]').isHidden());
  await page.locator('[data-section="pool"]').focus();await page.keyboard.press('ArrowRight');assert('top tabs support keyboard navigation',await page.locator('[data-section="cards"]').getAttribute('aria-selected')==='true');
  await more();await page.locator('[data-action="changelog"]').click();assert('changelog available in project menu',await page.locator('#modal-body').innerText().then(s=>s.includes('1.11.2')));await page.keyboard.press('Escape');
  await more();await page.locator('[data-action="reset"]').click();await page.locator('[data-action="confirm-reset"]').click();await save();
  assert('reset retains source defaults',await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('autopilot-design-'+document.body.dataset.design)))===JSON.stringify(AutoPilotSpec.defaults)));
  await page.setViewportSize({width:390,height:844});await find('ratingRange');const touchRail=await page.locator('[data-rating-rail]').boundingBox();await page.touchscreen.tap(touchRail.x+touchRail.width*80/99,touchRail.y+24);
  assert('touch updates slider',Math.abs(await value('ratingMax')-80)<=1);await save();
  for(const size of [{width:1280,height:800},{width:390,height:844}]){await page.setViewportSize(size);await find('exclusions');assert(size.width+' view fits with visible save action',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.savebar').getBoundingClientRect().bottom<=innerHeight+1));}
  assert('no page errors',errors.length===0);assert('no external requests',requests.length===0);
  results.push({file,checks,errors,requests});console.log(file+': controls verified');await page.close();
 }
 fs.writeFileSync(path.join(__dirname,'interaction-review.json'),JSON.stringify(results,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
