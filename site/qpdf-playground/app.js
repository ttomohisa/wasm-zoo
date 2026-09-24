const $=(s)=>document.querySelector(s);
const runButton=$('#run'),downloadButton=$('#download'),fileInput=$('#pdf-file'),fileName=$('#file-name'),operation=$('#operation'),password=$('#password'),result=$('#result'),logOutput=$('#log'),coreStatus=$('#core-status'),manifestSummary=$('#manifest-summary'),runtimeStatus=$('#runtime-status');
let pkg,runner=null,wrapperPromise=null,downloadUrl=null,downloadName='qpdf-output.pdf';
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatBytes=(bytes)=>{if(!Number.isFinite(bytes))return'—';let v=bytes,u=0,units=['B','KB','MB','GB'];while(v>=1024&&u<units.length-1){v/=1024;u++;}return`${v.toFixed(u===0?0:v>=10?1:2)} ${units[u]}`;};
const log=(m,stream='info')=>{const el=document.createElement('div');el.className=`log-line ${stream}`;el.textContent=m;logOutput.append(el);logOutput.scrollTop=logOutput.scrollHeight;};
const assetBase=()=>new URL(`../assets/qpdf/${pkg.upstream.version}/browser-full/`,location.href);
async function loadManifest(){const r=await fetch(new URL('manifest.json',assetBase()),{cache:'no-store'});if(!r.ok)throw new Error(`Release manifest unavailable (HTTP ${r.status}).`);return r.json();}
async function renderManifest(){try{const m=await loadManifest();const wasm=Object.entries(m.files||{}).filter(([n])=>n.endsWith('.wasm')&&!n.endsWith('.wasm.gz')).reduce((s,[,f])=>s+(f.bytes||0),0);const gz=Object.entries(m.files||{}).filter(([n])=>n.endsWith('.wasm.gz')).reduce((s,[,f])=>s+(f.bytes||0),0);manifestSummary.innerHTML=`<strong>${esc(m.profileLabel||'Browser Full')}</strong><span>QPDF ${esc(m.upstream.version)}</span><span>native crypto</span><span>WASM ${formatBytes(wasm)}</span><span>gzip ${formatBytes(gz)}</span>`;}catch(e){manifestSummary.innerHTML=`<span>${esc(e.message)}</span>`;}}
function ensureWrapper(){if(window.WasmZooQpdf)return Promise.resolve();if(wrapperPromise)return wrapperPromise;wrapperPromise=new Promise((res,rej)=>{const s=document.createElement('script');s.src=new URL('browser-qpdf.js',assetBase()).href;s.onload=()=>window.WasmZooQpdf?res():rej(new Error('QPDF runtime wrapper did not initialize.'));s.onerror=()=>rej(new Error('Could not load browser-qpdf.js.'));document.head.append(s);});return wrapperPromise;}
async function loadRuntime(){if(typeof Worker==='undefined'||typeof WebAssembly==='undefined')throw new Error('QPDF requires Web Workers and WebAssembly.');await ensureWrapper();if(!runner){coreStatus.textContent='Loading QPDF…';runner=window.WasmZooQpdf.loadHosted({baseUrl:assetBase().href});await runner.load();}coreStatus.textContent='Loaded · qpdf';coreStatus.dataset.state='ready';return runner;}
function clearDownload(){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;downloadButton.disabled=true;}
function setDownload(bytes,name){clearDownload();downloadUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));downloadName=name;downloadButton.disabled=false;}
function outputFile(execResult,name){return execResult.files.find((entry)=>entry.name===name)?.data;}
fileInput.addEventListener('change',()=>{clearDownload();fileName.textContent=fileInput.files?.[0]?.name||'No file selected';});
downloadButton.addEventListener('click',()=>{if(!downloadUrl)return;const a=document.createElement('a');a.href=downloadUrl;a.download=downloadName;a.click();});
runButton.addEventListener('click',async()=>{
  const file=fileInput.files?.[0];if(!file){result.textContent='Choose a PDF first.';return;}
  runButton.disabled=true;clearDownload();result.textContent='Running…';logOutput.textContent='';
  try{
    const qpdf=await loadRuntime();const bytes=new Uint8Array(await file.arrayBuffer());const op=operation.value;const secret=password.value;
    let args,outputs=[];
    if(op==='check')args=['--check','/input.pdf'];
    else if(op==='linearize'){args=['/input.pdf','/output.pdf','--linearize'];outputs=['/output.pdf'];}
    else if(op==='encrypt'){if(!secret)throw new Error('Enter a password before encrypting.');args=['--encrypt',secret,secret,'256','--','/input.pdf','/output.pdf'];outputs=['/output.pdf'];}
    else {if(!secret)throw new Error('Enter the PDF password before decrypting.');args=[`--password=${secret}`,'--decrypt','/input.pdf','/output.pdf'];outputs=['/output.pdf'];}
    const out=await qpdf.exec(args,{files:[{name:'/input.pdf',data:bytes}],outputs,timeoutMs:60000,onLog:({stream,message})=>log(message,stream)});
    if(op==='check'){result.textContent=(out.stdout||out.stderr||'QPDF check completed successfully.').trim();return;}
    const produced=outputFile(out,'/output.pdf');if(!produced)throw new Error('QPDF completed without returning /output.pdf.');
    const suffix=op==='linearize'?'linearized':op==='encrypt'?'encrypted':'decrypted';setDownload(produced,`${file.name.replace(/\.pdf$/i,'')}-${suffix}.pdf`);result.textContent=`QPDF ${op} completed. Output: ${formatBytes(produced.byteLength)}`;
  }catch(e){result.textContent=`Error: ${e.message}`;log(e.stack||e.message,'stderr');}
  finally{runButton.disabled=false;}
});
(async()=>{try{const c=await fetch('../catalog.json',{cache:'no-store'});const catalog=await c.json();pkg=catalog.packages.find(p=>p.slug==='qpdf');if(!pkg)throw new Error('QPDF package metadata missing.');$('#version').textContent=pkg.upstream.version;runtimeStatus.textContent='Ready to load';runtimeStatus.dataset.state='ready';await renderManifest();}catch(e){runtimeStatus.textContent=e.message;runtimeStatus.dataset.state='error';manifestSummary.textContent=e.message;}})();
