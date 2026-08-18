param([string]$Profile = "browser-full")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Read-EnvFile([string]$Path) {
  $map = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $i = $line.IndexOf("=")
    $map[$line.Substring(0,$i)] = $line.Substring($i+1).Trim('"')
  }
  return $map
}
$envs = Read-EnvFile (Join-Path $Root "versions.env")
$profilePath = Join-Path $Root "profiles\$Profile\profile.env"
if (-not (Test-Path $profilePath)) { throw "Unknown profile: $Profile" }
$profileText = Get-Content -Raw $profilePath
$useX264 = if ($profileText -match '(?m)^PROFILE_USE_X264=([01])\s*$') { $Matches[1] } else { throw "PROFILE_USE_X264 missing" }
$target = if ($useX264 -eq "1") { "export-with-x264" } else { "export-no-x264" }
$out = Join-Path $Root "dist\$Profile"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Path $out -Force | Out-Null

$args = @(
  "buildx","build","--file",(Join-Path $Root "docker\Dockerfile"),"--target",$target,
  "--build-arg","BUILDER_VERSION=$($envs.BUILDER_VERSION)",
  "--build-arg","EMSDK_VERSION=$($envs.EMSDK_VERSION)",
  "--build-arg","EMSCRIPTEN_COMMIT=$($envs.EMSCRIPTEN_COMMIT)",
  "--build-arg","FFMPEG_REPOSITORY=$($envs.FFMPEG_REPOSITORY)",
  "--build-arg","FFMPEG_REF=$($envs.FFMPEG_REF)",
  "--build-arg","FFMPEG_COMMIT=$($envs.FFMPEG_COMMIT)",
  "--build-arg","X264_REPOSITORY=$($envs.X264_REPOSITORY)",
  "--build-arg","X264_FALLBACK_REPOSITORY=$($envs.X264_FALLBACK_REPOSITORY)",
  "--build-arg","X264_REF=$($envs.X264_REF)",
  "--build-arg","X264_COMMIT=$($envs.X264_COMMIT)",
  "--build-arg","PROFILE=$Profile",
  "--output","type=local,dest=$out",$Root
)
Write-Host "WASM Zoo / FFmpeg $Profile" -ForegroundColor Cyan
& docker @args
if ($LASTEXITCODE -ne 0) { throw "Docker build failed with exit code $LASTEXITCODE" }
& node (Join-Path $Root "scripts\smoke-test.mjs") $Profile
if ($LASTEXITCODE -ne 0) { throw "Browser smoke test failed with exit code $LASTEXITCODE" }
Write-Host "[OK] FFmpeg $Profile build + browser smoke test passed" -ForegroundColor Green
