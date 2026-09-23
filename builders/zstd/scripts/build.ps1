param([string]$Profile='browser-core')
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$vars=@{}
Get-Content (Join-Path $Root 'versions.env') | ForEach-Object {
  $line=$_.Trim()
  if($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
    $i=$line.IndexOf('='); $vars[$line.Substring(0,$i)]=$line.Substring($i+1)
  }
}
if($Profile -ne 'browser-core'){throw "Only browser-core canary is supported"}
$out=Join-Path $Root "dist/$Profile"
if(Test-Path $out){Remove-Item $out -Recurse -Force}
New-Item -ItemType Directory -Path $out -Force | Out-Null
$args=@('buildx','build','--file',(Join-Path $Root 'docker/Dockerfile'),'--target','export',
  '--build-arg',"BUILDER_VERSION=$($vars.BUILDER_VERSION)",
  '--build-arg',"EMSDK_VERSION=$($vars.EMSDK_VERSION)",
  '--build-arg',"EMSCRIPTEN_COMMIT=$($vars.EMSCRIPTEN_COMMIT)",
  '--build-arg',"ZSTD_REPOSITORY=$($vars.ZSTD_REPOSITORY)",
  '--build-arg',"ZSTD_REF=$($vars.ZSTD_REF)",
  '--build-arg',"ZSTD_COMMIT=$($vars.ZSTD_COMMIT)",
  '--build-arg',"PROFILE=$Profile",
  '--output',"type=local,dest=$out",$Root)
& docker @args
if($LASTEXITCODE -ne 0){throw "Zstandard Docker build failed"}
& node (Join-Path $Root 'scripts/smoke-test.mjs') $Profile
if($LASTEXITCODE -ne 0){throw "Zstandard browser smoke failed"}
$RepoRoot=Split-Path -Parent (Split-Path -Parent $Root)
& node (Join-Path $RepoRoot 'scripts/generate-build-metadata.mjs') --slug zstd --profile $Profile --dist $out
if($LASTEXITCODE -ne 0){throw "Supply-chain metadata generation failed"}
Write-Host '[OK] experimental Zstandard browser-core canary passed' -ForegroundColor Green
