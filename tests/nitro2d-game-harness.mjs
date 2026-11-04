// Serves the patched game (served-game.mjs) on a local port for browser tests; three.js comes from node_modules
// and every other outside request is refused, so the tests run offline.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {root,html} from './served-game.mjs';
const TYPES={js:'text/javascript',css:'text/css',png:'image/png',webp:'image/webp',ico:'image/x-icon',txt:'text/plain',html:'text/html',json:'application/json',svg:'image/svg+xml'};
export function loadPlaywright(){try{return createRequire(import.meta.url)('playwright');}catch{return null;}}
export async function serve(){
 const server=http.createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  if(path==='/'||path==='/index.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
  if(path.includes('..')){res.writeHead(404);res.end();return;}
  try{const body=await readFile(new URL('public'+path,root));res.writeHead(200,{'content-type':TYPES[path.split('.').pop()]||'application/octet-stream'});res.end(body);}
  catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:'http://127.0.0.1:'+server.address().port+'/',close:()=>new Promise(r=>server.close(r))};
}
export async function openGame(browser,url,opts={}){
 const context=await browser.newContext({viewport:opts.viewport||{width:1280,height:720},...(opts.context||{})});
 const three=await readFile(new URL('node_modules/three/build/three.min.js',root));
 await context.route('**/*',route=>{
  const u=route.request().url();
  if(u.startsWith(url))return route.continue();
  if(/three@0\.158\.0\/build\/three\.min\.js/.test(u))return route.fulfill({status:200,contentType:'text/javascript',body:three});
  return route.abort();
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.stack||e)));
 await page.addInitScript(()=>{window.NP_ROOM_SERVER='';try{localStorage.setItem('nitropitch_terms_accepted_global','1');}catch{}});
 await page.goto(url,{waitUntil:'load'});
 await page.waitForFunction(()=>window.NP2D&&typeof window.NP2D.startOffline==='function',null,{timeout:30000});
 return {context,page,errors};
}
