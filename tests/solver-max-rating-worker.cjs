// Replay the bronze ceiling through the packaged browser worker, without EA writes.
const {chromium,launchOptions}=require('./browser-test-runtime.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch(launchOptions);
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:8767/tests/fixtures/autopilot-settings.html');
    const version=JSON.parse(fs.readFileSync('manifest.json','utf8')).version;
    const results=await page.evaluate(async version=>{
      const worker=new Worker(`/artifacts/autopilotsbc-fc27-${version}/solver/worker.js`,{type:'module'});
      let sequence=0;
      const solve=scopeName=>new Promise((resolve,reject)=>{
        const requestId=`rating-${++sequence}`;
        const timeout=setTimeout(()=>{worker.terminate();reject(Error('Worker replay timed out'));},10000);
        const listen=event=>{if(event.data.requestId!==requestId)return;clearTimeout(timeout);worker.removeEventListener('message',listen);resolve(event.data);};
        worker.addEventListener('message',listen);
        worker.postMessage({type:'SOLVE',requestId,payload:{
          players:Array.from({length:11},(_,index)=>({id:1000+index,definitionId:2000+index,rating:50,rarityId:0,leagueId:13,nationId:45,teamId:1})),
          requiredPlayers:11,requirementsNormalized:[
            {type:'player_quality',scopeName:'MIN',count:11,value:['bronze'],label:'Bronze: Min. 11 Players'},
            {type:'team_rating',scopeName,count:-1,derivedCount:64,value:[64],label:`Team Rating: ${scopeName==='MAX'?'Max.':'Min.'} 64`},
          ],filters:{allowedCardBuckets:['common_bronze','rare_bronze']},optimize:{restartTimeBudgetMs:500},
        }});
      });
      try{return {maximum:await solve('MAX'),minimum:await solve('MIN')};}finally{worker.terminate();}
    },version);
    assert.equal(results.maximum.ok,true);
    assert.equal(results.maximum.data.solved,true);
    assert.equal(results.maximum.data.solutions[0].length,11);
    assert.equal(results.maximum.data.stats.squadRating,50);
    assert.equal(results.minimum.data.solved,false);
    console.log(JSON.stringify({version,maximumSolved:true,squadRating:50,players:11,minimumRejected:true}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
