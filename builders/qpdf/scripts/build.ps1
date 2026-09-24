param([string]$Profile = "browser-full")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
function Read-EnvFile([string]$Path) { $map=@{}; Get-Content -LiteralPath $Path | ForEach-Object { $line=$_.Trim(); if(-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')){return}; $i=$line.IndexOf('='); $map[$line.Substring(0,$i)]=$line.Substring($i+1).Trim('"') }; return $map }
$envs=Read-EnvFile (Join-Path $Root 'versions.env')
if(-not (Test-Path (Join-Path $Root "profiles\$Profile\profile.env"))){ throw "Unknown profile: $Profile" }
$out=Join-Path $Root "dist\$Profile"; if(Test-Path $out){Remove-Item -Recurse -Force $out}; New-Item -ItemType Directory -Path $out -Force | Out-Null
$args=@('buildx','build','--file',(Join-Path $Root 'docker\Dockerfile'),'--target','export','--build-arg',"BUILDER_VERSION=$($envs.BUILDER_VERSION)",'--build-arg',"EMSDK_VERSION=$($envs.EMSDK_VERSION)",'--build-arg',"EMSCRIPTEN_COMMIT=$($envs.EMSCRIPTEN_COMMIT)",'--build-arg',"QPDF_REPOSITORY=$($envs.QPDF_REPOSITORY)",'--build-arg',"QPDF_REF=$($envs.QPDF_REF)",'--build-arg',"QPDF_COMMIT=$($envs.QPDF_COMMIT)",'--build-arg',"QPDF_VERSION=$($envs.QPDF_VERSION)",'--build-arg',"QPDF_SOURCE_URL=$($envs.QPDF_SOURCE_URL)",'--build-arg',"QPDF_SOURCE_SHA256=$($envs.QPDF_SOURCE_SHA256)",'--build-arg',"ZLIB_VERSION=$($envs.ZLIB_VERSION)",'--build-arg',"ZLIB_SOURCE_URL=$($envs.ZLIB_SOURCE_URL)",'--build-arg',"ZLIB_SOURCE_SHA512=$($envs.ZLIB_SOURCE_SHA512)",'--build-arg',"LIBJPEG_VERSION=$($envs.LIBJPEG_VERSION)",'--build-arg',"LIBJPEG_SOURCE_URL=$($envs.LIBJPEG_SOURCE_URL)",'--build-arg',"LIBJPEG_SOURCE_SHA512=$($envs.LIBJPEG_SOURCE_SHA512)",'--build-arg',"PROFILE=$Profile",'--output',"type=local,dest=$out",$Root)
Write-Host "WASM Zoo / qpdf $Profile" -ForegroundColor Cyan
& docker @args
if($LASTEXITCODE -ne 0){throw "Docker build failed with exit code $LASTEXITCODE"}
& node (Join-Path $Root 'scripts\smoke-test.mjs') $Profile
if($LASTEXITCODE -ne 0){throw "Browser smoke test failed with exit code $LASTEXITCODE"}
$RepoRoot = Split-Path -Parent (Split-Path -Parent $Root)
& node (Join-Path $RepoRoot 'scripts\generate-build-metadata.mjs') --slug qpdf --profile $Profile --dist $out
if($LASTEXITCODE -ne 0){throw "Supply-chain metadata generation failed with exit code $LASTEXITCODE"}
Write-Host "[OK] qpdf $Profile build + browser smoke test + provenance/SBOM passed" -ForegroundColor Green
