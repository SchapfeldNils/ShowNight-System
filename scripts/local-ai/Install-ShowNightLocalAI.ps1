#requires -Version 7.0
[CmdletBinding()]
param([switch]$RefreshTools)
$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:LOCALAPPDATA 'ShowNight\LocalAI'
$version = '0.40.4'
$expectedHash = '7485a1172f8527db4342a63521b9342fc466185ff0855da378cc864ecf6354cf'
$archive = Join-Path $installRoot "ollama-$version.zip"
$runtime = Join-Path $installRoot "runtime-$version"
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
$recordPath = Join-Path $installRoot 'installation.json'
$installed = $false
if (Test-Path -LiteralPath $recordPath) {
    $record = Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json
    $installed = $record.version -eq $version -and $record.archiveSha256 -eq $expectedHash -and (Test-Path -LiteralPath (Join-Path $runtime 'ollama.exe'))
}
if ($RefreshTools) {
    if (!(Test-Path -LiteralPath (Join-Path $runtime 'ollama.exe'))) { throw 'Zuerst die vollstaendige Installation ausfuehren.' }
    foreach ($name in @('ShowNightLocalAI.Server.ps1', 'Invoke-ShowNightLocalAI.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $installRoot $name) -Force
    }
    Write-Host 'Installierte Startwerkzeuge aktualisiert; Modell und Server bleiben erhalten.'
    return
}
if (!$installed -and !(Test-Path -LiteralPath (Join-Path $runtime 'installation.sha256'))) {
    Write-Host "Offizielles Ollama $version herunterladen (ca. 1,47 GB)."
    $cached = (Test-Path -LiteralPath $archive) -and ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -eq $expectedHash)
    if (!$cached) {
        & curl.exe --fail --location --retry 4 --connect-timeout 30 --output $archive "https://github.com/ollama/ollama/releases/download/v$version/ollama-windows-amd64.zip"
        if ($LASTEXITCODE -ne 0) { throw 'Ollama-Download fehlgeschlagen.' }
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Ollama-Pruefsumme stimmt nicht. Keine Installation.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $runtime -Force
    $expectedHash | Set-Content -LiteralPath (Join-Path $runtime 'installation.sha256') -Encoding ASCII
}
foreach ($name in @('ShowNightLocalAI.Server.ps1', 'Invoke-ShowNightLocalAI.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $installRoot $name) -Force
}
@{ version = $version; archiveSha256 = $expectedHash; installedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding UTF8
$env:OLLAMA_HOST = 'http://127.0.0.1:11434'
$env:OLLAMA_MODELS = Join-Path $installRoot 'models'
$env:OLLAMA_NO_CLOUD = '1'
$modelHash = 'a3de86cd1c132c822487ededd47a324c50491393e6565cd14bafa40d0b8e686f'
$blobRoot = Join-Path $installRoot 'models\blobs'
$blob = Join-Path $blobRoot "sha256-$modelHash"
if (!(Test-Path -LiteralPath $blob)) {
    # Small individually retained ranges avoid losing incomplete 326-MB parts.
    & (Join-Path $installRoot 'ShowNightLocalAI.Server.ps1') -Action Stop
    New-Item -ItemType Directory -Path $blobRoot -Force | Out-Null
    $partial = & (Join-Path $PSScriptRoot 'Get-ShowNightLocalModel.ps1') -InstallRoot $installRoot
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $modelHash) { throw 'Modell-Pruefsumme stimmt nicht. Modell wird nicht verwendet.' }
    $expectedRoot = [IO.Path]::GetFullPath($installRoot).TrimEnd('\') + '\'
    foreach ($target in @($partial, $blob)) {
        if (![IO.Path]::GetFullPath($target).StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Dateiziel ausserhalb der eigenen KI-Installation.' }
    }
    Move-Item -LiteralPath $partial -Destination $blob
}
& (Join-Path $installRoot 'ShowNightLocalAI.Server.ps1') -Action Start
Write-Host 'Offizielles Modellmanifest und Lizenzmetadaten ueber Ollama vervollstaendigen.'
& (Join-Path $runtime 'ollama.exe') pull qwen3:8b
if ($LASTEXITCODE -ne 0) { throw 'Modelldownload fehlgeschlagen.' }
$modelfile = Join-Path $installRoot 'Modelfile'
@'
FROM qwen3:8b
PARAMETER num_ctx 8192
PARAMETER temperature 0.2
PARAMETER num_predict 2048
'@ | Set-Content -LiteralPath $modelfile -Encoding UTF8
& (Join-Path $runtime 'ollama.exe') create shownight-local:8b -f $modelfile
if ($LASTEXITCODE -ne 0) { throw 'Lokales ShowNight-Modell konnte nicht angelegt werden.' }
$cacheRoot = Join-Path $installRoot 'downloads\qwen3-8b-parts'
$cacheFiles = @()
if (Test-Path -LiteralPath $cacheRoot) { $cacheFiles += Get-ChildItem -LiteralPath $cacheRoot -File | Where-Object { $_.Name -match '^\d{4}\.part(\.ok|\.headers)?$' } }
foreach ($name in @('downloads\qwen3-8b.gguf.partial', 'downloads\qwen3-8b.verified-download')) {
    $cachePath = Join-Path $installRoot $name
    if (Test-Path -LiteralPath $cachePath) { $cacheFiles += Get-Item -LiteralPath $cachePath }
}
$cacheFiles += Get-ChildItem -LiteralPath $blobRoot -File | Where-Object { $_.Name -match "^sha256-$modelHash-partial(-\d+)?$" }
$expectedRoot = [IO.Path]::GetFullPath($installRoot).TrimEnd('\') + '\'
foreach ($cacheFile in $cacheFiles) {
    if (!$cacheFile.FullName.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cachedatei ausserhalb der eigenen KI-Installation.' }
    Remove-Item -LiteralPath $cacheFile.FullName
}
Write-Host 'Eigene unbenoetigte Modell-Downloadteile entfernt; geprueftes Modell bleibt erhalten.'
Write-Host "Bereit: $installRoot\Invoke-ShowNightLocalAI.ps1"
