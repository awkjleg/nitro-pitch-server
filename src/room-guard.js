// Bounds are deliberately wider than normal physics to allow latency, rumble and goal blasts.
// This rejects malformed/impossible reports; simulation still runs on the elected player's client.
const finite=(v,limit)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=limit;
export function validCar(c){return c==null||(Array.isArray(c)&&c.length>=12&&c.length<=40&&c.every(x=>typeof x==='number'&&Number.isFinite(x))&&c.slice(0,3).every(x=>finite(x,350))&&c.slice(3,7).every(x=>finite(x,1.01))&&Math.hypot(...c.slice(3,7))>.8&&Math.hypot(...c.slice(3,7))<1.2&&c.slice(7,10).every(x=>finite(x,180)));}
export function validGame(g){
 if(g==null)return true;
 if(typeof g!=='object'||Array.isArray(g)||!['demo','lobby','countdown','play','goal','replay','over'].includes(g.ph))return false;
 if(!Array.isArray(g.s)||g.s.length!==2||!g.s.every(x=>Number.isInteger(x)&&x>=0&&x<=99))return false;
 if(!Array.isArray(g.b)||g.b.length!==9||!g.b.every(x=>finite(x,500)))return false;
 if(!Array.isArray(g.mut)||g.mut.length!==7||!g.mut.every(x=>Number.isInteger(x)&&x>=0&&x<=20))return false;
 if(![1,2,3].includes(g.md)||!finite(g.tl,7200)||!finite(g.pt,7200)||typeof g.mid!=='string'||g.mid.length>80)return false;
 if(!g.st||typeof g.st!=='object'||Array.isArray(g.st)||Object.keys(g.st).length>20)return false;
 return Object.entries(g.st).every(([k,s])=>/^[A-Za-z0-9_-]{1,80}$/.test(k)&&Array.isArray(s)&&s.length===6&&s.every(x=>Number.isInteger(x)&&x>=0&&x<=100000))&&(!g.bt||Array.isArray(g.bt)&&g.bt.length<=6);
}
export function validHit(h){return h==null||(typeof h==='object'&&Number.isInteger(h.n)&&h.n>=0&&['p','v'].every(k=>Array.isArray(h[k])&&h[k].length===3&&h[k].every(x=>finite(x,k==='p'?350:180)))&&(!h.w||Array.isArray(h.w)&&h.w.length===3&&h.w.every(x=>finite(x,100))));}
export function rankedRules(g,room){return /^np-m-/.test(room||'')&&g.rk===1&&g.mm===1&&[1,2,3].includes(g.pl)&&Array.isArray(g.mut)&&[0,1,2,3,5,6].every(i=>g.mut[i]===0);}
export function resultEvidence(record,uid,now=Date.now()){
 if(!record||!record.final||record.invalid||now-record.ended>86400000)throw new Error('Match result is not ready');
 const member=record.roster.find(x=>x.uid===uid);if(!member)throw new Error('You were not in this match');
 if(record.ended-record.started<20000)throw new Error('Match was too short for rewards');
 const g=record.final,elapsed=(record.ended-record.started)/1000;
 const limit=[300,180,600,Infinity][g.mut[0]]??300;
 if(!g.ot&&g.tl>1&&!(g.rk&&Math.abs(g.s[0]-g.s[1])>=5)&&!record.forfeit)throw new Error('Match did not finish normally');
 if(!g.ot&&g.tl<=1&&elapsed+20<limit)throw new Error('Match clock did not match the server');
 const winner=g.s[0]===g.s[1]?-1:g.s[0]>g.s[1]?0:1;
 const stats=g.st[member.id]||[0,0,0,0,0,0];
 if(stats[1]>g.s[member.team]||stats[0]>elapsed*25+500||stats.slice(1).some(x=>x>elapsed/2+10))throw new Error('Match statistics failed validation');
 const bothTeams=[0,1].every(t=>record.roster.some(x=>x.team===t&&x.uid));
 // One acknowledgement from each opposing account prevents a lone host inventing a ranked result.
 const confirmed=bothTeams&&[0,1].every(t=>record.roster.some(x=>x.team===t&&(record.acks?.includes(x.uid)||record.departed?.includes(x.uid))));
 if(bothTeams&&!confirmed)throw new Error('Waiting for both teams to confirm the result');
 return {mid:record.mid,score:g.s,st:stats,won:winner===member.team,mvp:Object.entries(g.st).sort((a,b)=>b[1][0]-a[1][0]||a[0].localeCompare(b[0]))[0]?.[0]===member.id,kind:g.mm?(g.rk?'ranked':g.x>=0?'extra':'casual'):'private',ranked:rankedRules(g,record.room)&&confirmed,playlist:g.pl,roster:record.roster,team:member.team,extra:g.mut[6]>0,elapsed,online:true};
}
