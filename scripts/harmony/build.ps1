param(
    [string]$DevEcoHome = $env:DEVECO_STUDIO_HOME,
    [ValidateSet('debug', 'release')][string]$BuildMode = 'debug'
)
$ErrorActionPreference = 'Stop'
if (-not $DevEcoHome) {
    $candidate = Get-ChildItem "$env:LOCALAPPDATA/Programs/Huawei/DevEcoStudio-*" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($candidate) { $DevEcoHome = $candidate.FullName }
}
if (-not $DevEcoHome) { throw 'Set DEVECO_STUDIO_HOME or pass -DevEcoHome.' }
$ide = (Resolve-Path -LiteralPath $DevEcoHome).Path
$project = (Resolve-Path (Join-Path $PSScriptRoot '../../apps/harmony')).Path
$profile = Join-Path $project 'build-profile.json5'
$runtime = Join-Path $project 'entry/src/main/resources/rawfile/runtime-config.json'
if (-not (Test-Path -LiteralPath $profile)) { Copy-Item -LiteralPath (Join-Path $project 'build-profile.example.json5') -Destination $profile }
if (-not (Test-Path -LiteralPath $runtime)) { Copy-Item -LiteralPath (Join-Path $project 'entry/src/main/resources/rawfile/runtime-config.example.json') -Destination $runtime }
$savedNode = $env:NODE_HOME
$savedJava = $env:JAVA_HOME
$savedSdk = $env:DEVECO_SDK_HOME
$savedPath = $env:Path
Push-Location -LiteralPath $project
try {
    $env:NODE_HOME = Join-Path $ide 'tools/node'
    $env:JAVA_HOME = Join-Path $ide 'jbr'
    $env:DEVECO_SDK_HOME = Join-Path $ide 'sdk'
    $env:Path = "$env:NODE_HOME;$env:JAVA_HOME/bin;$savedPath"
    & (Join-Path $env:NODE_HOME 'node.exe') (Join-Path $PSScriptRoot 'prepare-assets.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'HarmonyOS asset preparation failed' }
    & (Join-Path $env:NODE_HOME 'node.exe') (Join-Path $ide 'tools/hvigor/bin/hvigorw.js') --mode module -p product=default -p module=entry@default -p "buildMode=$BuildMode" assembleHap --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "HarmonyOS build failed: $LASTEXITCODE" }
} finally {
    Pop-Location
    $env:NODE_HOME = $savedNode
    $env:JAVA_HOME = $savedJava
    $env:DEVECO_SDK_HOME = $savedSdk
    $env:Path = $savedPath
}
