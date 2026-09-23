// Real headless-Chromium Playground UI smoke against two candidate release ZIPs
// unpacked ONLY in a temporary CI workspace/local preview. Never a Pages upload.
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const site=path.join(root,"site");
function locateChrome(){
 const candidates=[process.env.ZSTD_WASM_BROWSER,process.env.CHROME_PATH,"google-chrome","chromium","chromium-browser"];
 for(const v of candidates){
  if(!v)continue;
  if(fs.existsSync(v))return v;
  const found=spawnSync(process.platform==="win32"?"where":"which",[v],{encoding:"utf8"});
  if(found.status===0)return found.stdout.split(/\r?\n/).find(Boolean);
 }
 return null;
}
const chrome=locateChrome();
if(!chrome)throw new Error("Headless Chromium is required for real Playground UI CI");
const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),"zstd-pages-ui-"));
const profileDir=path.join(tmp,"profile");
await fsp.mkdir(profileDir);
const mime={".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript; charset=utf-8",
 ".mjs":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".wasm":"application/wasm"};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method!=="GET"){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,"http://localhost");
  const rel=decodeURIComponent(url.pathname.slice(1));
  const full=path.resolve(site,rel||"index.html");
  if(!full.startsWith(site+path.sep) || !fs.statSync(full).isFile()){res.writeHead(404);res.end();return;}
  const data=await fsp.readFile(full);
  res.writeHead(200,{"Cache-Control":"no-store","Content-Type":mime[path.extname(full)]||"application/octet-stream"});
  res.end(data);
 }catch{res.writeHead(404);res.end("not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
const flags=["--headless=new","--disable-gpu","--disable-extensions","--no-first-run","--no-default-browser-check",
 "--remote-debugging-port=0",`--user-data-dir=${profileDir}`];
if(process.platform!=="win32")flags.push("--no-sandbox");
flags.push(`http://127.0.0.1:${port}/zstd-playground/?ci-smoke=1`);
const child=spawn(chrome,flags,{stdio:["ignore","ignore","pipe"]});
let errors="";
child.stderr.on("data",chunk=>{errors=(errors+chunk).slice(-8000);});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 const portFile=path.join(profileDir,"DevToolsActivePort");
 const started=Date.now();
 while(!fs.existsSync(portFile)&&Date.now()-started<25000){
  if(child.exitCode!==null)throw new Error("Chromium quit prematurely: "+errors);
  await wait(120);
 }
 if(!fs.existsSync(portFile))throw new Error("No Chrome DevTools endpoint: "+errors);
 const devPort=(await fsp.readFile(portFile,"utf8")).split(/\r?\n/)[0];
 while(Date.now()-started<180000){
  if(child.exitCode!==null)throw new Error("Chromium closed before Playground smoke completed: "+errors);
  try{
   const res=await fetch(`http://127.0.0.1:${devPort}/json/list`);
   const pages=await res.json();
   for(const target of pages){
    if(target.type!=="page" || !target.url.includes("/zstd-playground/"))continue;
    const hash=new URL(target.url).hash;
    if(hash.startsWith("#SMOKE_TEST_PASS_zstd_playground_")){
     console.log("[OK] real two-profile browser Playground UI: core -> CLI and CLI -> core byte-identical");
     process.exitCode=0;break;
    }
    if(hash.startsWith("#SMOKE_TEST_FAIL_"))
     throw new Error("Actual Playground UI failed: "+decodeURIComponent(hash.slice("#SMOKE_TEST_FAIL_".length)));
   }
  }catch(error){if(String(error.message).startsWith("Actual Playground UI failed"))throw error;}
  if(process.exitCode===0)break;
  await wait(250);
 }
 if(process.exitCode!==0)throw new Error("Real Playground UI smoke timed out: "+errors);
}catch(error){console.error(error.stack||String(error));process.exitCode=1;}
finally{
 if(child.exitCode===null){
  if(process.platform==="win32")spawnSync("taskkill",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});
  else child.kill("SIGTERM");
 }
 await new Promise(resolve=>server.close(resolve));
 await fsp.rm(tmp,{recursive:true,force:true,maxRetries:8,retryDelay:250});
}
if(process.exitCode!==0)process.exit(1);
