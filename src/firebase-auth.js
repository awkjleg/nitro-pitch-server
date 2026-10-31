// Firebase remains the identity provider. No passwords or service-account keys are handled here.
const PROJECT='nitro-pitch', API_KEY='AIzaSyCYni0K4gjcmcYW6YmRSRM20kHy2AwrHG8';
export const ADMIN_UID='NarUbbrLmcWC74xWsfH2lzUpDyB3';
const checked=new Map();
export const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export class ApiError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export async function readJson(req,max=65536){
 if(!req.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError('JSON required',415);
 const reader=req.body?.getReader();if(!reader)throw new ApiError('Missing request');let size=0,parts=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new ApiError('Request too large',413);}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError('Invalid JSON');}
}
export async function identify(token){
 if(typeof token!=='string'||token.length<40||token.length>8192)throw new ApiError('Please sign in again',401);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
 const have=checked.get(hash);if(have&&have.until>Date.now())return have.user;
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(12000)});
 if(response.status>=500||response.status===429)throw new ApiError('Account service is busy. Please retry.',503);
 const data=await response.json(),u=data.users?.[0];
 if(!response.ok||!u||u.disabled||!/^[A-Za-z0-9_-]{1,128}$/.test(u.localId))throw new ApiError('Please sign in again',401);
 // Google validated the signature. Still bind the token to this project, even if the API accepts cross-project lookup.
 let claims;try{claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}catch{throw new ApiError('Invalid account token',401);}
 if(claims.aud!==PROJECT||claims.iss!=='https://securetoken.google.com/'+PROJECT||claims.sub!==u.localId||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now())throw new ApiError('Invalid account token',401);
 const user={uid:u.localId,username:String(u.displayName||u.email?.split('@')[0]||'Player').slice(0,30)};
 if(checked.size>=1000)checked.delete(checked.keys().next().value);
 checked.set(hash,{user,until:Math.min(Date.now()+60000,claims.exp*1000)});return user;
}
function value(v){if(!v)return null;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('stringValue'in v)return v.stringValue;if('booleanValue'in v)return v.booleanValue;if('timestampValue'in v)return v.timestampValue;if(v.arrayValue)return(v.arrayValue.values||[]).map(value);if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).filter(([k])=>!['__proto__','constructor','prototype'].includes(k)).map(([k,x])=>[k,value(x)]));return null;}
export async function firebaseDoc(path,token){
 const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
 if(response.status===404)return null;
 if(!response.ok)throw new ApiError('Could not read your Firebase save. Please retry.',503);
 return value({mapValue:await response.json()});
}
