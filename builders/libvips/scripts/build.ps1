param([string]$Profile = "browser-full")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
function Read-EnvFile([string]$Path) { $map=@{}; Get-Content -LiteralPath $Path | ForEach-Object { $line=$_.Trim(); if(-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')){return}; $i=$line.IndexOf('='); $map[$line.Substring(0,$i)]=$line.Substring($i+1).Trim('"') }; return $map }
$envs=Read-EnvFile (Join-Path $Root 'versions.env')
foreach($script in @('scripts\smoke-test.mjs','scripts\compare-profiles.mjs','runtime\browser-libvips.js')) {
  & node --check (Join-Path $Root $script)
  if($LASTEXITCODE -ne 0){throw "libvips JavaScript syntax error: $script"}
}
function Invoke-ProfileBuild([string]$Name) {
  if(-not (Test-Path (Join-Path $Root "profiles\$Name\profile.env"))){ throw "Unknown profile: $Name" }
  $out=Join-Path $Root "dist\$Name"; if(Test-Path $out){Remove-Item -Recurse -Force $out}; New-Item -ItemType Directory -Path $out -Force | Out-Null
  $args=@('buildx','build','--file',(Join-Path $Root 'docker\Dockerfile'),'--target','export',
    '--build-arg',"BUILDER_VERSION=$($envs.BUILDER_VERSION)",
    '--build-arg',"EMSDK_VERSION=$($envs.EMSDK_VERSION)",
    '--build-arg',"EMSCRIPTEN_REF=$($envs.EMSCRIPTEN_REF)",
    '--build-arg',"EMSCRIPTEN_COMMIT=$($envs.EMSCRIPTEN_COMMIT)",
    '--build-arg',"LIBVIPS_REF=$($envs.LIBVIPS_REF)",
    '--build-arg',"LIBVIPS_COMMIT=$($envs.LIBVIPS_COMMIT)",
    '--build-arg',"WASM_VIPS_REPOSITORY=$($envs.WASM_VIPS_REPOSITORY)",
    '--build-arg',"WASM_VIPS_COMMIT=$($envs.WASM_VIPS_COMMIT)",
    '--build-arg',"WASM_VIPS_VERSION=$($envs.WASM_VIPS_VERSION)",
    '--build-arg',"WASM_VIPS_LIBVIPS_PATCH_REPOSITORY=$($envs.WASM_VIPS_LIBVIPS_PATCH_REPOSITORY)",
    '--build-arg',"WASM_VIPS_LIBVIPS_PATCH_COMMIT=$($envs.WASM_VIPS_LIBVIPS_PATCH_COMMIT)",
    '--build-arg',"WASM_VIPS_EMSCRIPTEN_PATCH_REPOSITORY=$($envs.WASM_VIPS_EMSCRIPTEN_PATCH_REPOSITORY)",
    '--build-arg',"WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT=$($envs.WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT)",
    '--build-arg',"PROFILE=$Name",'--output',"type=local,dest=$out",$Root)
  Write-Host "WASM Zoo / libvips $Name" -ForegroundColor Cyan
  & docker @args
  if($LASTEXITCODE -ne 0){throw "Docker build failed with exit code $LASTEXITCODE"}
  & node (Join-Path $Root 'scripts\smoke-test.mjs') $Name
  if($LASTEXITCODE -ne 0){throw "Browser smoke test failed with exit code $LASTEXITCODE"}
  Write-Host "[OK] libvips $Name build + browser smoke test passed" -ForegroundColor Green
}
$profiles = if($Profile -eq 'all') { @('browser-core','browser-full') } else { @($Profile) }
foreach($name in $profiles){ Invoke-ProfileBuild $name }
& node (Join-Path $Root 'scripts\compare-profiles.mjs')
if($LASTEXITCODE -ne 0){throw "Profile size comparison failed with exit code $LASTEXITCODE"}
