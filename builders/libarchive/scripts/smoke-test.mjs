import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForExit(child, timeoutMs = 5000) { if (child.exitCode !== null) return true; return new Promise((resolve) => { let done=false; const finish=(v)=>{if(done)return;done=true;clearTimeout(timer);child.off('exit',onExit);resolve(v)}; const onExit=()=>finish(true); const timer=setTimeout(()=>finish(false),timeoutMs); child.once('exit',onExit); }); }
async function stopBrowser(child) { try { if (!child || child.exitCode !== null) return; if (process.platform === 'win32') { spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'}); await waitForExit(child,5000); return; } child.kill('SIGTERM'); if (!(await waitForExit(child,5000)) && child.exitCode === null) { child.kill('SIGKILL'); await waitForExit(child,2000); } } catch (e) { console.warn(`[WARN] Could not fully terminate smoke browser: ${e?.message || e}`); } }
async function removeTemp(temp) { try { await fsp.rm(temp,{recursive:true,force:true,maxRetries:12,retryDelay:250}); } catch(e) { console.warn(`[WARN] Could not remove temporary browser profile: ${e?.message || e}`); } }
function commandPath(name) { const r=spawnSync(process.platform==='win32'?'where':'which',[name],{encoding:'utf8'}); return r.status===0?r.stdout.split(/\r?\n/).find(Boolean):null; }
function resolveBrowser() { const c=[process.env.LIBARCHIVE_WASM_BROWSER,process.env.CHROME_PATH]; if(process.platform==='win32'){for(const base of [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA]){if(!base)continue;c.push(path.join(base,'Google','Chrome','Application','chrome.exe'),path.join(base,'Microsoft','Edge','Application','msedge.exe'));}} for(const n of ['google-chrome','chrome','chromium','chromium-browser','msedge']) c.push(commandPath(n)); return c.find((x)=>x&&fs.existsSync(x)); }
async function main() {
  const profile=process.argv[2]||'browser-full'; const dist=path.join(root,'dist',profile); const timeoutMs=Number(process.env.LIBARCHIVE_WASM_SMOKE_TIMEOUT_MS||120000);
  const required=['smoke-test.html','browser-libarchive.js','manifest.json','smoke-input.zip'];
  for(const tool of ['bsdtar','bsdcpio','bsdcat','bsdunzip']) required.push(`${tool}-core.js`,`${tool}-core.wasm`);
  for(const name of required) if(!fs.existsSync(path.join(dist,name))) throw new Error(`Missing smoke input: ${name}`);
  const browser=resolveBrowser(); if(!browser) throw new Error('Chromium browser not found. Set LIBARCHIVE_WASM_BROWSER to Chrome/Edge executable.');
  const mime=new Map([['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.wasm','application/wasm'],['.json','application/json; charset=utf-8'],['.zip','application/zip']]);
  const baseDir=path.resolve(dist); const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const rel=url.pathname==='/'?'smoke-test.html':decodeURIComponent(url.pathname.slice(1));const full=path.resolve(baseDir,rel);if(!(full===baseDir||full.startsWith(baseDir+path.sep))){res.writeHead(403);res.end();return;}const data=await fsp.readFile(full);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',mime.get(path.extname(full))||'application/octet-stream');res.writeHead(200);res.end(data);}catch{res.writeHead(404);res.end('not found');}});
  await new Promise((r)=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'wasm-zoo-libarchive-')); const browserProfile=path.join(temp,'browser'); await fsp.mkdir(browserProfile,{recursive:true});
  const args=['--headless=new','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port=0',`--user-data-dir=${browserProfile}`]; if(process.platform!=='win32')args.push('--no-sandbox'); args.push(`http://127.0.0.1:${port}/smoke-test.html`);
  const child=spawn(browser,args,{stdio:['ignore','pipe','pipe']}); let stderr=''; child.stderr.on('data',(chunk)=>{stderr+=chunk;if(stderr.length>12000)stderr=stderr.slice(-12000);});
  try { const portFile=path.join(browserProfile,'DevToolsActivePort'); const started=Date.now(); while(!fs.existsSync(portFile)&&Date.now()-started<20000){if(child.exitCode!==null)throw new Error(`Browser exited early (${child.exitCode})\n${stderr}`);await sleep(100);} if(!fs.existsSync(portFile))throw new Error(`DevToolsActivePort was not created\n${stderr}`); const devPort=(await fsp.readFile(portFile,'utf8')).split(/\r?\n/)[0].trim(); let last='';
    while(Date.now()-started<timeoutMs){if(child.exitCode!==null)throw new Error(`Browser exited before completion (${child.exitCode})\n${stderr}`);try{const targets=await(await fetch(`http://127.0.0.1:${devPort}/json/list`)).json();for(const target of targets){if(target.type!=='page')continue;const url=new URL(target.url);if(url.hash.startsWith('#SMOKE_TEST_RUNNING_'))last=decodeURIComponent(url.hash.slice('#SMOKE_TEST_RUNNING_'.length));if(url.hash.startsWith('#SMOKE_TEST_PASS_')){console.log(`[OK] Browser smoke test: ${decodeURIComponent(url.hash.slice(1))}`);return;}if(url.hash.startsWith('#SMOKE_TEST_FAIL_'))throw new Error(`Browser smoke failure: ${decodeURIComponent(url.hash.slice('#SMOKE_TEST_FAIL_'.length))}`);}}catch(e){if(String(e.message).startsWith('Browser smoke failure:'))throw e;}await sleep(250);} throw new Error(`Browser smoke test timed out after ${timeoutMs} ms${last?`\nLast page status: ${last}`:''}\n${stderr}`);
  } finally { await stopBrowser(child); await new Promise((r)=>server.close(r)); await removeTemp(temp); }
}
main().catch((error)=>{console.error(error?.stack||error);process.exitCode=1;});
