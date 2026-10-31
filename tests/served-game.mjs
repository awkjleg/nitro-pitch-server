import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
export const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
export const raw=await read('public/index.html');
const source=await read('src/game-shell.js'),context={};
for(const m of source.matchAll(/import (\w+) from "\.\/(.*\.txt)";/g))context[m[1]]=await read('src/'+m[2]);
const patch=vm.createContext(context);vm.runInContext(source.replace(/import \w+ from "\.\/.*\.txt";\n/g,'').replace('export function applyGameFixes','function applyGameFixes')+'\nglobalThis.apply=applyGameFixes;',patch);
export const html=patch.apply(raw);
