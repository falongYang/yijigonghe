import assert from 'node:assert/strict';
const disk = new Map();
globalThis.localStorage = { getItem: k => disk.get(k) ?? null, setItem: (k,v) => disk.set(k,v) };
const {Profile, summary} = await import('./MVP_Web/js/profile.js');
Profile.setName('完整性测试');
Profile.record({win:true,seconds:60});
const before = Profile.exportText();
for (const payload of [
  {app:'yijigonghe',v:2,profile:{name:'未来版本',games:99}},
  {app:'yijigonghe',v:'1',profile:{name:'错误版本'}},
  {app:'yijigonghe',v:1,profile:null,name:'错误包装'},
  {app:'yijigonghe',v:1,profile:[],games:99},
]) {
  assert.equal(Profile.importText(JSON.stringify(payload)).ok,false);
  assert.equal(Profile.exportText(),before,'拒绝导入不能覆盖已有档案');
}
for (const [games,wins,losses] of [[0,99,99],[3,99,99],[5,2,99],[-1,-2,-3]]) {
  const r=Profile.importText(JSON.stringify({name:'统计测试',games,wins,losses}));
  assert.equal(r.ok,true);
  const p=r.profile;
  assert.ok(p.wins+p.losses<=p.games);
  assert.ok(summary(p).winRate<=100);
  assert.ok(p.wins>=0 && p.losses>=0);
}
assert.equal(Profile.importText(before).ok,true);
assert.equal(Profile.exportText(),before,'合法备份完整往返');
assert.equal(Profile.importText(JSON.stringify({name:'旧档案',games:2,wins:1})).ok,true);
console.log('Profile integrity checks passed');
