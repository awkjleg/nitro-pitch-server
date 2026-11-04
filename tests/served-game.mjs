import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
export const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
export const raw=await read('public/index.html');
const source=await read('src/game-shell.js'),context={};
for(const m of source.matchAll(/import (\w+) from "\.\/(.*\.txt)";/g))context[m[1]]=await read('src/'+m[2]);
context.moderationScript=(await import('../src/moderation.js')).moderationScript;
const patch=vm.createContext(context);vm.runInContext(source.replace(/import \w+ from "\.\/.*\.txt";\n/g,'').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nglobalThis.apply=applyGameFixes;globalThis.release=RELEASE;',patch);
export const html=patch.apply(raw);
// the release the Worker announces ({build, v, title, big}), as src/game-shell.js exports it
export const release=patch.release;
