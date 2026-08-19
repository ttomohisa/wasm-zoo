param([string]$Profile = "browser-full")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
function Read-EnvFile([string]$Path) { $map=@{}; Get-Content -LiteralPath $Path | ForEach-Object { $line=$_.Trim(); if(-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')){return}; $i=$line.IndexOf('='); $map[$line.Substring(0,$i)]=$line.Substring($i+1).Trim('"') }; return $map }
$envs=Read-EnvFile (Join-Path $Root 'versions.env')
& node --check (Join-Path $Root 'scripts\smoke-test.mjs')
if($LASTEXITCODE -ne 0){throw "ImageMagick smoke test script has a JavaScript syntax error"}
& node --check (Join-Path $Root 'runtime\browser-imagemagick.js')
if($LASTEXITCODE -ne 0){throw "ImageMagick runtime wrapper has a JavaScript syntax error"}
if(-not (Test-Path (Join-Path $Root "profiles\$Profile\profile.env"))){ throw "Unknown profile: $Profile" }
$out=Join-Path $Root "dist\$Profile"; if(Test-Path $out){Remove-Item -Recurse -Force $out}; New-Item -ItemType Directory -Path $out -Force | Out-Null
$args=@('buildx','build','--file',(Join-Path $Root 'docker\Dockerfile'),'--target','export','--build-arg',"BUILDER_VERSION=$($envs.BUILDER_VERSION)",'--build-arg',"EMSDK_VERSION=$($envs.EMSDK_VERSION)",'--build-arg',"EMSCRIPTEN_COMMIT=$($envs.EMSCRIPTEN_COMMIT)",'--build-arg',"IMAGEMAGICK_REPOSITORY=$($envs.IMAGEMAGICK_REPOSITORY)",'--build-arg',"IMAGEMAGICK_REF=$($envs.IMAGEMAGICK_REF)",'--build-arg',"IMAGEMAGICK_COMMIT=$($envs.IMAGEMAGICK_COMMIT)",'--build-arg',"PROFILE=$Profile",'--output',"type=local,dest=$out",$Root)
Write-Host "WASM Zoo / ImageMagick $Profile" -ForegroundColor Cyan
& docker @args
if($LASTEXITCODE -ne 0){throw "Docker build failed with exit code $LASTEXITCODE"}
& node (Join-Path $Root 'scripts\smoke-test.mjs') $Profile
if($LASTEXITCODE -ne 0){throw "Browser smoke test failed with exit code $LASTEXITCODE"}
Write-Host "[OK] ImageMagick $Profile build + browser smoke test passed" -ForegroundColor Green
