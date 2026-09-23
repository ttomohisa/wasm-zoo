const $ = (id) => document.getElementById(id);
const runtimeStatus = $("runtime-status"), coreStatus = $("core-status"), message = $("message"),
  summary = $("manifest-summary"), logNode = $("log"), profileInput = $("profile"),
  modeInput = $("operation"), levelInput = $("level"), levelLabel = $("level-label"),
  fileInput = $("input-file"), runButton = $("run"), demoButton = $("demo"),
  selection = $("selection"), download = $("download");
const MAX_BYTES = 64 * 1024 * 1024;
const UPSTREAM_SHA = "f8745da6ff1ad1e7bab384bd1f9d742439278e99";
let pkg = null, canRun = false, input = null, outputUrl = null, activeRunner = null;
const formatBytes = (n) => { let value=n, i=0; const units=["B","KiB","MiB"]; while(value>=1024&&i<units.length-1){value/=1024;i++;} return value.toFixed(i?1:0)+" "+units[i]; };
const log = (text) => { logNode.textContent += String(text)+"\n"; logNode.scrollTop=logNode.scrollHeight; };
const assetBase = (profile) => new URL(`../assets/zstd/${pkg.upstream.version}/${profile}/`, location.href);
const safeName = (name) => String(name||"file").replace(/[\\/\x00-\x1f]/g,"_").slice(0,160);
const setStatus = (state, label) => { runtimeStatus.dataset.state=state; runtimeStatus.textContent=label; };
const clearOutput = () => {
  download.hidden=true; download.removeAttribute("href");
  if(outputUrl){URL.revokeObjectURL(outputUrl); outputUrl=null;}
};
function updateState(){
  const isCompress = modeInput.value==="compress";
  levelLabel.hidden = !isCompress;
  fileInput.accept = isCompress ? "" : ".zst,application/zstd,application/octet-stream";
  runButton.textContent = isCompress ? "Compress locally" : "Decompress locally";
  runButton.disabled = !canRun || !input;
  if(!isCompress && input?.sample){input=null;fileInput.value="";selection.textContent="Select a .zst file to decompress.";}
}
function selectFile(blob, name, sample=false){
  if(blob.size>MAX_BYTES){message.textContent="Input exceeds the 64 MiB limit.";return;}
  input={blob,name,sample};
  selection.textContent=`${name} · ${formatBytes(blob.size)}`;
  clearOutput();
  updateState();
}
demoButton.addEventListener("click",()=>{
  if(modeInput.value!=="compress"){message.textContent="The sample is for compression. Select a .zst file to decompress.";return;}
  const text=(`WASM Zoo: official Zstandard ${pkg?.upstream?.version || "release"} browser compression.\n`).repeat(1000);
  selectFile(new Blob([text],{type:"text/plain"}),"zstd-sample.txt",true);
});
fileInput.addEventListener("change",()=>{
  const file=fileInput.files?.[0];
  if(file)selectFile(file,safeName(file.name));
});
modeInput.addEventListener("change",()=>{clearOutput();updateState();});
profileInput.addEventListener("change",()=>{
  if(activeRunner){activeRunner.dispose();activeRunner=null;}
  clearOutput();
  void renderManifest();
});
async function manifestFor(profile){
  const url=new URL("manifest.json",assetBase(profile));
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw new Error(`Published ${profile} manifest unavailable (HTTP ${response.status})`);
  const manifest=await response.json();
  if(manifest.profile!==profile ||
     manifest.upstream?.version!==pkg.upstream.version ||
     manifest.upstream?.commit!==UPSTREAM_SHA ||
     manifest.build?.builderVersion!==pkg.zoo.builderVersion)
    throw new Error("Published manifest does not match the reviewed Zstandard pin");
  return manifest;
}
async function renderManifest(){
  summary.textContent="";
  if(!canRun){summary.textContent="Published release not yet available.";return;}
  try{
    const m=await manifestFor(profileInput.value);
    for(const value of [m.profileLabel,`Zstandard ${m.upstream.version}`,
      `WASM ${formatBytes(m.files?.[`${profileInput.value==="browser-core"?"zstd-core":"zstd-cli"}.wasm`]?.bytes||0)}`,
      `Builder ${m.build.builderVersion}`]){
      const span=document.createElement("span");span.textContent=value;summary.append(span);
    }
  }catch(error){summary.textContent=error.message;setStatus("error","Release integrity check failed");canRun=false;updateState();}
}
async function loadRuntime(profile){
  const base=assetBase(profile);
  const moduleName=profile==="browser-core"?"wasm-zoo.mjs":"wasm-zoo-cli.mjs";
  const mod=await import(new URL(moduleName,base).href);
  const runner=await mod.load({baseUrl:base.href});
  activeRunner=runner;
  coreStatus.textContent=profile+" loaded";
  coreStatus.dataset.state="ready";
  return runner;
}
async function processInput(){
  if(!canRun || !input) return;
  clearOutput();
  runButton.disabled=true;
  logNode.textContent="";
  coreStatus.textContent="Working…";coreStatus.dataset.state="working";
  let runner=null;
  try{
    const profile=profileInput.value,mode=modeInput.value;
    await manifestFor(profile);
    const source=await input.blob.arrayBuffer();
    if(source.byteLength>MAX_BYTES)throw new Error("Input exceeds 64 MiB");
    message.textContent="Running Zstandard locally…";
    const level=Number(levelInput.value);
    runner=await loadRuntime(profile);
    let result;
    if(profile==="browser-core"){
      result=mode==="compress"
        ? await runner.compress(source,{level,timeoutMs:90000})
        : await runner.decompress(source,{timeoutMs:90000});
    }else{
      const inPath=mode==="compress"?"/input.bin":"/input.zst";
      const outPath=mode==="compress"?"/output.zst":"/output.bin";
      const args=mode==="compress"
        ? ["-q","-f",`-${level}`,"-o",outPath,inPath]
        : ["-q","-f","-d","-o",outPath,inPath];
      const execution=await runner.exec(args,{
        files:[{name:inPath,data:source}],outputs:[outPath],timeoutMs:90000,
        onLog:({stream,message:line})=>log(`${stream}: ${line}`)
      });
      result=execution.files?.[0]?.data;
      if(!result)throw new Error("Upstream CLI did not return the requested output file");
      if(execution.stdout)log("stdout:\n"+execution.stdout);
      if(execution.stderr)log("stderr:\n"+execution.stderr);
    }
    const outName=mode==="compress"
      ? safeName(input.name)+".zst"
      : safeName(input.name.toLowerCase().endsWith(".zst")?input.name.slice(0,-4):input.name+".decompressed");
    outputUrl=URL.createObjectURL(new Blob([result],{type:"application/octet-stream"}));
    download.href=outputUrl;download.download=outName;download.textContent=`Download ${outName} (${formatBytes(result.byteLength)})`;
    download.hidden=false;
    message.textContent=`Finished locally: ${formatBytes(source.byteLength)} → ${formatBytes(result.byteLength)}.`;
    coreStatus.textContent="Success";coreStatus.dataset.state="ready";
    log(`PASS ${profile} ${mode}: ${source.byteLength} → ${result.byteLength} bytes`);
  }catch(error){
    coreStatus.textContent="Error";coreStatus.dataset.state="error";
    message.textContent=error?.message||String(error);
    log(error?.stack||String(error));
  }finally{
    if(runner){runner.dispose();if(activeRunner===runner)activeRunner=null;}
    updateState();
  }
}
runButton.addEventListener("click",()=>void processInput());
window.addEventListener("pagehide",()=>{clearOutput();activeRunner?.dispose();});
async function init(){
  try{
    const [catalogResponse,stateResponse]=await Promise.all([
      fetch("../catalog.json",{cache:"no-store"}),
      fetch("./release-status.json",{cache:"no-store"})
    ]);
    if(!catalogResponse.ok||!stateResponse.ok)throw new Error("Release status or catalog unavailable");
    const catalog=await catalogResponse.json(),state=await stateResponse.json();
    pkg=catalog.packages.find(p=>p.slug==="zstd");
    if(!pkg)throw new Error("Zstandard package metadata missing");
    $("version").textContent=pkg.upstream.version;
    const localhost=["localhost","127.0.0.1"].includes(location.hostname);
    if(state.tag!==`zstd-v${pkg.zoo.builderVersion}` ||
       state.upstreamCommit!==UPSTREAM_SHA ||
       !(state.state==="published" || (localhost && state.state==="local-preview"))){
      setStatus("working","Release pending");
      summary.textContent="Only published, verified release assets will be enabled here.";
      message.textContent="The reviewed release has not been published. No experimental CI binary is served publicly.";
      logNode.textContent="The Playground will activate after the manually tagged GitHub Release passes CI.\n";
      if(localhost && new URL(location.href).searchParams.get("ci-smoke")==="1")
        location.hash="#SMOKE_TEST_FAIL_Release_status_not_ready";
      return;
    }
    for(const profile of ["browser-core","browser-full"]) await manifestFor(profile);
    canRun=true;
    setStatus("ready",state.state==="published"?"Verified release ready":"Local build preview");
    message.textContent="Choose a local file, or use the sample to try compression.";
    logNode.textContent="Release manifests verified for both browser profiles.\n";
    await renderManifest();
    updateState();
    // Explicit localhost-only smoke: run real Playground UI across both profiles,
    // cross-decode frames and require byte-identical results. Never runs publicly.
    if(localhost && state.state==="local-preview" &&
       new URL(location.href).searchParams.get("ci-smoke")==="1"){
      const processChecked=async()=>{
        await processInput();
        if(download.hidden || !outputUrl)throw new Error("Playground operation failed: "+message.textContent);
        return new Uint8Array(await (await fetch(outputUrl)).arrayBuffer());
      };
      try{
        demoButton.click();
        if(!input)throw new Error("Sample input was not selected");
        const original=new Uint8Array(await input.blob.arrayBuffer());
        const coreFrame=await processChecked();
        profileInput.value="browser-full";
        profileInput.dispatchEvent(new Event("change"));
        modeInput.value="decompress";
        modeInput.dispatchEvent(new Event("change"));
        selectFile(new Blob([coreFrame]),"core.zst");
        const fullDecoded=await processChecked();
        if(fullDecoded.length!==original.length ||
           fullDecoded.some((byte,i)=>byte!==original[i]))
          throw new Error("Full CLI could not decode the Playground core profile frame");
        modeInput.value="compress";
        modeInput.dispatchEvent(new Event("change"));
        selectFile(new Blob([original]),"sample.txt");
        const cliFrame=await processChecked();
        profileInput.value="browser-core";
        profileInput.dispatchEvent(new Event("change"));
        modeInput.value="decompress";
        modeInput.dispatchEvent(new Event("change"));
        selectFile(new Blob([cliFrame]),"cli.zst");
        const coreDecoded=await processChecked();
        if(coreDecoded.length!==original.length ||
           coreDecoded.some((byte,i)=>byte!==original[i]))
          throw new Error("Core profile could not decode the Playground upstream CLI frame");
        location.hash="#SMOKE_TEST_PASS_zstd_playground_bidirectional_profiles";
      }catch(smokeError){
        log("Playground UI smoke failed: "+smokeError.stack);
        location.hash="#SMOKE_TEST_FAIL_"+encodeURIComponent(smokeError.message);
      }
    }
  }catch(error){
    setStatus("error","Release check unavailable");
    message.textContent=error.message;logNode.textContent=error.stack||String(error);
    if(["localhost","127.0.0.1"].includes(location.hostname) &&
       new URL(location.href).searchParams.get("ci-smoke")==="1")
      location.hash="#SMOKE_TEST_FAIL_"+encodeURIComponent(error.message);
  }
}
updateState();void init();
