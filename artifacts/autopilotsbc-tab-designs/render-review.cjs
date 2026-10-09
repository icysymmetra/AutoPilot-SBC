const {chromium,launchOptions} = require('../../tests/browser-test-runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const out=path.join(__dirname,'screenshots');fs.mkdirSync(out,{recursive:true});
  const report=[];
  const measure=()=>{
    const frame=document.querySelector('.content-frame').getBoundingClientRect();
    const scroll=document.querySelector('.page-scroll').getBoundingClientRect();
    const heading=document.querySelector('.workspace-header,.workspace-title').getBoundingClientRect();
    const tabs=document.querySelector('.workspace-tabs').getBoundingClientRect();
    const content=document.querySelector('.tab-page').getBoundingClientRect();
    const save=document.querySelector('.save-actions').getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth,centerError:Math.abs((frame.left+frame.right-scroll.left-scroll.right)/2),headingAlignment:Math.abs(heading.left-frame.left),tabsAlignment:Math.abs(tabs.left-frame.left),contentAlignment:Math.abs(content.left-frame.left),saveAlignment:Math.abs(save.right-frame.right),footerVisible:document.querySelector('.savebar').getBoundingClientRect().bottom<=innerHeight+1};
  };
  for(const name of ['01-native','02-guided','03-inspector','04-editorial','05-builder']){
    await page.goto(`http://127.0.0.1:8766/${name}.html`);
    await page.screenshot({path:path.join(out,`${name}-desktop.png`)});
    report.push({name,size:'1440×900',...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('h1').textContent,footer:document.querySelector('.savebar').getBoundingClientRect().toJSON(),controls:document.querySelectorAll('input,button,select').length}))});
    await page.setViewportSize({width:1280,height:800});
    await page.screenshot({path:path.join(out,`${name}-laptop.png`)});
    report.push({name,size:'1280×800',...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,footerVisible:document.querySelector('.savebar').getBoundingClientRect().bottom<=innerHeight+1}))});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(out,`${name}-phone.png`)});
    report.push({name,size:'390×844',...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,footer:document.querySelector('.savebar').getBoundingClientRect().toJSON()}))});
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      await page.setViewportSize(viewport);
      for(const section of ['pool','cards','exclusions']){
        await page.locator('[data-section="'+section+'"]').click();
        const measurements=await page.evaluate(measure);
        report.push({name,size:viewport.width+'×'+viewport.height,section,...measurements});
        if(section!=='pool')await page.screenshot({path:path.join(out,`${name}-${section}-${viewport.width===1440?'desktop':'phone'}.png`)});
      }
    }
    await page.setViewportSize({width:1440,height:900});
  }
  await page.goto('http://127.0.0.1:8766/index.html');
  await page.screenshot({path:path.join(out,'gallery.png'),fullPage:true});
  fs.writeFileSync(path.join(__dirname,'layout-review.json'),JSON.stringify({report,errors},null,2));
  console.log(JSON.stringify({layouts:report.length,errors,issues:report.filter(row=>row.overflow||row.centerError>1||row.saveAlignment>1||row.headingAlignment>1||row.tabsAlignment>1||row.contentAlignment>1||row.footerVisible===false)},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
