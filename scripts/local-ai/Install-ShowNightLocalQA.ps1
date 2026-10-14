[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RepositoryRoot,
    [Parameter(Mandatory)][ValidatePattern('^\+[1-9]\d{7,14}$')][string]$Recipient,
    [Parameter(Mandatory)][string]$NodePath,
    [Parameter(Mandatory)][string]$GitPath,
    [Parameter(Mandatory)][string]$PackageManagerPath,
    [Parameter(Mandatory)][string]$ChromePath,
    [ValidateRange(1,120)][int]$DailyTaskLimit = 120,
    [switch]$AutoStart,
    [switch]$RefreshTools
)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'ShowNight\LocalAI'
$qaRoot = Join-Path $root 'qa'
if (!(Test-Path -LiteralPath (Join-Path $root 'installation.json'))) { throw 'Zuerst lokale KI einrichten.' }
foreach ($exePath in @($NodePath,$GitPath,$PackageManagerPath,$ChromePath)) { if (!(Test-Path -LiteralPath $exePath -PathType Leaf)) { throw 'Erforderliche Laufzeit fehlt.' } }
$repository = (Resolve-Path -LiteralPath $RepositoryRoot).Path
& $GitPath -C $repository rev-parse --show-toplevel | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Kein Git-Repository.' }
$control = Join-Path $root 'ShowNightLocalQA.ps1'
if (Test-Path -LiteralPath (Join-Path $qaRoot 'config.json')) {
    $oldStatus = & $control -Action Status | ConvertFrom-Json
    if ($oldStatus.running) { throw 'Vor dem Aktualisieren eigenen QA-Dienst stoppen.' }
}
New-Item -ItemType Directory -Path (Join-Path $qaRoot 'state') -Force | Out-Null
# Browser session/history and destination are private, outside OneDrive and repository.
$accountSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $qaRoot /inheritance:r /grant:r "*${accountSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Private Zugriffsrechte konnten nicht gesetzt werden.' }
foreach ($name in @('core.mjs','github.mjs','dashboard.mjs','notifications.mjs','worker.mjs','reconcile-whatsapp.mjs','Invoke-ShowNightQARequest.ps1','package.json','pnpm-lock.yaml','pnpm-workspace.yaml')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "qa\$name") -Destination (Join-Path $qaRoot $name) -Force
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ShowNightLocalQA.ps1') -Destination $control -Force
foreach($name in @('Get-ShowNightLocalFindings.ps1','Get-ShowNightGitHubInbox.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $root $name) -Force}
New-Item -ItemType Directory -Path (Join-Path $qaRoot 'patches') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'qa\patches\whatsapp-web.js@1.34.7.patch') -Destination (Join-Path $qaRoot 'patches\whatsapp-web.js@1.34.7.patch') -Force
foreach ($name in @('no-archive-extraction','no-ftp')) {
    New-Item -ItemType Directory -Path (Join-Path $qaRoot $name) -Force | Out-Null
    foreach ($fileName in @('package.json','index.cjs')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot "qa\$name\$fileName") -Destination (Join-Path $qaRoot "$name\$fileName") -Force }
}
$configFile = Join-Path $qaRoot 'config.json'
if (!$RefreshTools -or !(Test-Path -LiteralPath $configFile)) {
    @{ version=1; repositoryRoot=$repository; recipient=$Recipient; nodePath=$NodePath; gitPath=$GitPath;
       powerShellPath=(Get-Process -Id $PID).Path; chromePath=$ChromePath; scanIntervalSeconds=300; dailyTaskLimit=$DailyTaskLimit } | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding utf8
}
if (!$RefreshTools) {
    $previousCache = $env:PUPPETEER_CACHE_DIR
    $previousSkip = $env:PUPPETEER_SKIP_DOWNLOAD
    $previousPath = $env:PATH
    try {
        $env:PUPPETEER_CACHE_DIR = Join-Path $qaRoot 'browser-cache'
        if ($ChromePath) { $env:PUPPETEER_SKIP_DOWNLOAD = 'true' }
        $env:PATH = (Split-Path $NodePath -Parent) + ';' + $env:PATH
        Push-Location $qaRoot
        try { & $NodePath $PackageManagerPath install --prod --frozen-lockfile --ignore-scripts; if ($LASTEXITCODE -ne 0) { throw 'WhatsApp-Abhaengigkeiten nicht installiert.' } } finally { Pop-Location }
    } finally { $env:PUPPETEER_CACHE_DIR=$previousCache; $env:PUPPETEER_SKIP_DOWNLOAD=$previousSkip; $env:PATH=$previousPath }
}
if ($AutoStart) {
    $startupCommand = '"{0}" -NoProfile -WindowStyle Hidden -File "{1}" -Action Start' -f (Get-Process -Id $PID).Path, $control
    New-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Force | Out-Null
    New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'ShowNightLocalQA' -Value $startupCommand -PropertyType String -Force | Out-Null
}
Write-Host 'Lokale QA eingerichtet. ShowNightLocalQA.ps1 -Action Start, dann -Action Connect. Versand erst nach eigener WhatsApp-Verknuepfung.'
