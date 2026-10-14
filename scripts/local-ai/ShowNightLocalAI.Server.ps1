[CmdletBinding()]
param([ValidateSet('Start', 'Status', 'Unload', 'Stop')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
$installRoot = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'installation.json')) { $PSScriptRoot } else { Join-Path $env:LOCALAPPDATA 'ShowNight\LocalAI' }
$runtime = Join-Path $installRoot 'runtime-0.40.4'
$exe = Join-Path $runtime 'ollama.exe'
$pidFile = Join-Path $installRoot 'server.pid'
$endpoint = 'http://127.0.0.1:11434'
function Get-OwnedServer {
    if (!(Test-Path -LiteralPath $pidFile)) { return $null }
    $serverProcess = Get-Process -Id ([int](Get-Content -Raw -LiteralPath $pidFile)) -ErrorAction SilentlyContinue
    if ($serverProcess -and $serverProcess.Path -eq $exe) { return $serverProcess }
    return $null
}
if ($Action -eq 'Unload') {
    Invoke-RestMethod -Uri "$endpoint/api/generate" -Method Post -ContentType 'application/json' -Body '{"model":"shownight-local:8b","keep_alive":0}' -TimeoutSec 60 | Out-Null
    Write-Host 'Modell aus dem Grafikspeicher entladen.'
    return
}
if ($Action -eq 'Stop') {
    $serverProcess = Get-OwnedServer
    if ($serverProcess) { Stop-Process -Id $serverProcess.Id; Remove-Item -LiteralPath $pidFile }
    Write-Host 'Eigener ShowNight-KI-Server gestoppt.'
    return
}
if ($Action -eq 'Start') {
    if (!(Test-Path -LiteralPath $exe)) { throw 'Ollama ist noch nicht eingerichtet. Install-ShowNightLocalAI.ps1 ausfuehren.' }
    $serverProcess = Get-OwnedServer
    if (!$serverProcess) {
        $occupied = $false
        try { $null = Invoke-RestMethod -Uri "$endpoint/api/version" -TimeoutSec 2; $occupied = $true } catch {}
        if ($occupied) { throw 'Port 11434 wird von einer anderen Ollama-Instanz verwendet. Diese zuerst bewusst beenden.' }
        $settings = @{
            OLLAMA_HOST = '127.0.0.1:11434'; OLLAMA_MODELS = (Join-Path $installRoot 'models'); OLLAMA_NO_CLOUD = '1'
            OLLAMA_CONTEXT_LENGTH = '8192'; OLLAMA_NUM_PARALLEL = '1'; OLLAMA_MAX_LOADED_MODELS = '1'
            OLLAMA_FLASH_ATTENTION = '1'; OLLAMA_KV_CACHE_TYPE = 'q8_0'; OLLAMA_KEEP_ALIVE = '2m'
        }
        $previous = @{}
        try {
            foreach ($key in $settings.Keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process'); [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process') }
            New-Item -ItemType Directory -Path (Join-Path $installRoot 'models') -Force | Out-Null
            $serverProcess = Start-Process -FilePath $exe -ArgumentList 'serve' -WorkingDirectory $installRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $installRoot 'server.stdout.log') -RedirectStandardError (Join-Path $installRoot 'server.stderr.log') -PassThru
            $serverProcess.Id | Set-Content -LiteralPath $pidFile
        } finally {
            foreach ($key in $settings.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
        }
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $null = Invoke-RestMethod -Uri "$endpoint/api/version" -TimeoutSec 2; $ready = $true; break } catch { Start-Sleep -Milliseconds 500 }
    }
    if (!$ready) { throw "KI-Server startet nicht. Siehe $installRoot\server.stderr.log" }
}
$version = Invoke-RestMethod -Uri "$endpoint/api/version" -TimeoutSec 5
$models = Invoke-RestMethod -Uri "$endpoint/api/ps" -TimeoutSec 5
[pscustomobject]@{ endpoint = $endpoint; version = $version.version; ownedProcess = (Get-OwnedServer).Id; loadedModels = $models.models } | ConvertTo-Json -Depth 8
