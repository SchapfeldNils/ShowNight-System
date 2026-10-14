// Development-only reproducible compatibility patch for Apache-2.0 SDK 1.34.7.
// Implements the _serialized/$1 fallback documented in upstream PR #201896.
import { readFile, writeFile, mkdir, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const exec=promisify(execFile);
const [sdk,compiler,gitPath,output]=process.argv.slice(2);
if(!sdk||!compiler||!gitPath||!output) throw new Error('SDK, TypeScript-Parser, Git und Patchpfad erforderlich.');
const ts=createRequire(import.meta.url)(compiler);
if(JSON.parse(await readFile(path.join(sdk,'package.json'),'utf8')).version!=='1.34.7')throw new Error('Patch nur fuer unveraendertes SDK 1.34.7 erzeugen.');
const directory=await mkdtemp(path.join(path.dirname(output),'sdk-patch-build-'));
let patch='', replacements=0;
async function visitDirectory(folder){
  for(const entry of await readdir(folder,{withFileTypes:true})) {
    const file=path.join(folder,entry.name);
    if(entry.isDirectory()){await visitDirectory(file);continue;}
    if(!entry.name.endsWith('.js')) continue;
    const original=await readFile(file,'utf8');
    if(/_serialized\s*\?\?/.test(original))throw new Error('SDK bereits angepasst; unveraendertes Paket verwenden.');
    const tree=ts.createSourceFile(file,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const edits=[];
    function visit(node){
      if(ts.isPropertyAccessExpression(node)&&node.name.text==='_serialized') {
        const expression=node.expression.getText(tree);
        const accessor=node.questionDotToken?'?.':'.';
        edits.push({start:node.getStart(tree),end:node.end,text:`(${node.getText(tree)} ?? ${expression}${accessor}$1)`});
      }
      ts.forEachChild(node,visit);
    }
    visit(tree); if(!edits.length)continue;
    edits.sort((a,b)=>b.start-a.start);
    for(let i=1;i<edits.length;i++)if(edits[i].end>edits[i-1].start)throw new Error('Verschachtelte ID-Zugriffe brauchen manuelle Pruefung.');
    let updated=original;
    for(const edit of edits)updated=updated.slice(0,edit.start)+edit.text+updated.slice(edit.end);
    const relative=path.relative(sdk,file).replaceAll('\\','/');
    const before=path.join(directory,'before.js'),after=path.join(directory,'after.js');
    await writeFile(before,original);await writeFile(after,updated);
    let diff;
    try{diff=(await exec(gitPath,['diff','--no-index','--no-ext-diff','--',before,after])).stdout;}
    catch(error){if(error.code!==1)throw error;diff=error.stdout;}
    diff=diff.replace(/^diff --git .*$/m,`diff --git a/${relative} b/${relative}`).replace(/^--- .*$/m,`--- a/${relative}`).replace(/^\+\+\+ .*$/m,`+++ b/${relative}`);
    patch+=diff;replacements+=edits.length;
  }
}
try{await visitDirectory(path.join(sdk,'src'));await writeFile(output,patch);console.log(JSON.stringify({replacements,bytes:Buffer.byteLength(patch)}));}
finally{const parent=path.resolve(path.dirname(output));if(!path.resolve(directory).startsWith(parent+path.sep))throw new Error('Ungueltiger Cleanup-Pfad.');await rm(directory,{recursive:true,force:true});}
