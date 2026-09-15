# Verifies the electron-builder Windows unpacked output contains a complete
# Electron/Chromium runtime (especially icudtl.dat next to Sofia.exe).
#
# Expected Electron 41 Windows layout (from electron-v*-win32-x64.zip):
#   win-unpacked/Sofia.exe
#   win-unpacked/icudtl.dat          (~10 MB, beside the exe — NOT inside asar)
#   win-unpacked/resources/app.asar
#   win-unpacked/resources/cloud-config.json  (Sofia extraResources)
#
# Usage (from repo root, after `npm run build:win`):
#   powershell -File scripts/verify-windows-packaging.ps1

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$candidates = @(
  (Join-Path $repoRoot "dist\win-unpacked"),
  (Join-Path $repoRoot "dist\win-unpacked-x64"),
  (Join-Path $repoRoot "dist\win-arm64-unpacked")
)

$unpacked = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $unpacked) {
  Write-Host "ERROR: No Windows unpacked output found under dist/."
  Write-Host "Looked for:"
  $candidates | ForEach-Object { Write-Host "  $_" }
  if (Test-Path (Join-Path $repoRoot "dist")) {
    Write-Host "dist contents:"
    Get-ChildItem (Join-Path $repoRoot "dist") -Force | ForEach-Object { Write-Host "  $($_.Name)" }
  }
  exit 1
}

Write-Host "Unpacked app directory: $unpacked"
Write-Host ""
Write-Host "Root files:"
Get-ChildItem $unpacked -Force | ForEach-Object {
  $size = if ($_.PSIsContainer) { "<DIR>" } else { $_.Length }
  Write-Host ("  {0,-40} {1}" -f $_.Name, $size)
}

$exe = Get-ChildItem $unpacked -Filter "*.exe" -File |
  Where-Object { $_.Name -notmatch '^(Uninstall|elevate)' } |
  Select-Object -First 1

$icu = Join-Path $unpacked "icudtl.dat"
$resourcesDir = Join-Path $unpacked "resources"
$asar = Join-Path $resourcesDir "app.asar"
$cloudConfig = Join-Path $resourcesDir "cloud-config.json"

$failed = $false

function Assert-Exists([string]$label, [string]$path, [int64]$minBytes = 0) {
  if (-not (Test-Path $path)) {
    Write-Host "FAIL: $label missing at $path"
    $script:failed = $true
    return
  }
  $item = Get-Item $path
  if ($item.PSIsContainer) {
    Write-Host "OK:   $label -> $path"
    return
  }
  if ($minBytes -gt 0 -and $item.Length -lt $minBytes) {
    Write-Host "FAIL: $label too small ($($item.Length) bytes, expected >= $minBytes) at $path"
    $script:failed = $true
    return
  }
  Write-Host "OK:   $label -> $path ($($item.Length) bytes)"
}

Write-Host ""
Write-Host "Required Electron runtime checks:"

if (-not $exe) {
  Write-Host "FAIL: Sofia.exe (or product executable) not found in $unpacked"
  $failed = $true
} else {
  Assert-Exists "Application executable" $exe.FullName 1MB
}

# Electron ships icudtl.dat beside the executable on Windows (not inside app.asar).
# A healthy Electron 41 x64 icudtl.dat is about 10.8 MB.
Assert-Exists "icudtl.dat (Chromium ICU data)" $icu 5MB
Assert-Exists "resources/" $resourcesDir
Assert-Exists "resources/app.asar" $asar 100KB
Assert-Exists "resources/cloud-config.json" $cloudConfig 20

# Extra Chromium assets that should sit beside the exe on Windows.
Assert-Exists "resources.pak" (Join-Path $unpacked "resources.pak") 100KB
Assert-Exists "v8_context_snapshot.bin" (Join-Path $unpacked "v8_context_snapshot.bin") 10KB

Write-Host ""
if ($failed) {
  Write-Host "Windows packaging validation FAILED."
  Write-Host "The NSIS installer must not be trusted until win-unpacked contains a complete Electron runtime."
  exit 1
}

Write-Host "Windows packaging validation PASSED."
Write-Host "icudtl.dat found: YES"
Write-Host "Correct location: $icu"
if (Test-Path $icu) {
  Write-Host "File size: $((Get-Item $icu).Length) bytes"
}
exit 0
