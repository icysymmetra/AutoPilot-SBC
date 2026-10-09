import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSolverContext,solveSquad} from '../solver/solver.js';

const players=Array.from({length:11},(_,index)=>({
  id:1000+index,definitionId:2000+index,name:`Bronze ${index}`,
  rating:50,rarityId:0,leagueId:13,nationId:45,teamId:1,
  isUntradeable:true,position:'CM',possiblePositions:['CM'],
}));
const solve=(op,target=64,extraRequirements=[])=>solveSquad(buildSolverContext({
  players,requiredPlayers:11,
  requirementsNormalized:[
    {type:'player_quality',op:'min',count:11,target:11,values:['bronze'],label:'Bronze: Min. 11 Players'},
    {type:'team_rating',op,count:target,target,values:[target],label:`Team Rating: ${op==='max'?'Max.':'Min.'} ${target}`},
    ...extraRequirements,
  ],
  filters:{allowedCardBuckets:['common_bronze','rare_bronze']},
  debug:true,optimize:{restartTimeBudgetMs:500},
}));

test('Room To Grow accepts eleven bronzes whose team rating is below its maximum',()=>{
  const result=solve('max');
  assert.ok(result.solved,JSON.stringify({failing:result.failingRequirements,rating:result.stats?.squadRating,players:result.stats?.filteredPlayerCount}));
  assert.equal(result.solutions[0].length,11);
  assert.equal(result.stats.ratingTarget,null,'a ceiling must not become an optimization floor');
  assert.ok(!result.stats.scopeAnalysis?.shortcomings?.some(s=>s.reason==='rating_shortfall'));
});

test('a rating ceiling accepts its boundary and rejects squads above it',()=>{
  assert.equal(solve('max',50).solved,true);
  const invalid=solve('max',49);
  assert.equal(invalid.solved,false);
  assert.ok(invalid.failingRequirements.some(rule=>rule.type==='team_rating'&&rule.op==='max'));
});

test('an exact rating accepts only the stated rating',()=>{
  assert.equal(solve('exact',50).solved,true);
  assert.equal(solve('exact',49).solved,false);
  assert.equal(solve('exact',51).solved,false);
});

test('minimum and maximum rating requirements remain separate regardless of order',()=>{
  const minimum={type:'team_rating',op:'min',count:48,target:48,label:'Team Rating: Min. 48'};
  const result=solve('max',64,[minimum]);
  assert.equal(result.solved,true);
  assert.equal(result.stats.ratingTarget,48);
  assert.equal(solve('max',64,[{...minimum,count:51,target:51}]).solved,false);
});

test('a minimum rating still rejects the same low-rated bronze pool',()=>{
  const result=solve('min');
  assert.equal(result.solved,false);
});
