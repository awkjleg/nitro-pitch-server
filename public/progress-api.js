(() => {
 'use strict';
 const revisions=new Map(),profiles=new Map(),listeners=new Set();
 function account(){return window.npAccounts?.user();}
 async function call(action,data={},retry=true){
  const A=window.npAccounts,u=account();if(!u)throw new Error('Sign in to save rewards to your account.');
  const token=await A.token(false);
  const response=await fetch('/api/progress',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(18000)});
  if(response.status===401&&retry){await A.token(true);return call(action,data,false);}
  const body=await response.json().catch(()=>({error:'Progress service could not be reached.'}));
  if(!response.ok){const e=new Error(body.error||'Could not save progress. Try again.');e.status=response.status;throw e;}
  if(account()?.uid!==u.uid)throw new Error('Your account changed. Please try again.');
  if(body.profile&&(body.rev||0)>=(revisions.get(u.uid)||0)){
   revisions.set(u.uid,body.rev||0);profiles.set(u.uid,body.profile);for(const listener of listeners)listener(body.profile,body.rev,u.uid);
  }
  if(body.profile&&body.rev<revisions.get(u.uid)){body.profile=profiles.get(u.uid);body.rev=revisions.get(u.uid);}
  return body;
 }
 window.NPProgressAPI={call,revision:()=>revisions.get(account()?.uid)||0,listen(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  store(){return {load:async()=>(await call('load')).profile,save:async profile=>call('save',{profile})};}};
 const A=window.npAccounts;if(!A)return;
 const originalGet=A.leaderboard.get,originalTop=A.leaderboard.top;
 A.leaderboard.post=async()=>{}; // Rankings derive from committed server profiles.
 A.leaderboard.top=async(field,n)=>account()?(await call('leaderboard',{field,limit:n})).rows:originalTop(field,n);
 A.leaderboard.get=async uid=>account()?(await call('leaderboard-get',{uid})).row||originalGet(uid):originalGet(uid);
})();
