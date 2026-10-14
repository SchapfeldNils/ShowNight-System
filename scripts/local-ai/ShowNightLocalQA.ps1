[CmdletBinding()]
param([ValidateSet('Start','Status','Pause','Resume','Scan','Stop','Connect')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
$root = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'qa\config.json')) { Join-Path $PSScriptRoot 'qa' } else { Join-Path $env:LOCALAPPDATA 'ShowNight\LocalAI\qa' }
$config = Get-Content -Raw -LiteralPath (Join-Path $root 'config.json') | ConvertFrom-Json
$state = Join-Path $root 'state'
function Get-QAProcess {
    $metadataPath = Join-Path $state 'process.json'
    if (!(Test-Path -LiteralPath $metadataPath)) { return $null }
    $metadata = Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json
    $candidate = Get-Process -Id $metadata.pid -ErrorAction SilentlyContinue
    $expectedTicks = if ($metadata.startTimeTicks) { [long]$metadata.startTimeTicks } else { ([DateTime]$metadata.startTime).ToUniversalTime().Ticks }
    if ($candidate -and $candidate.Path -eq $config.nodePath -and $candidate.StartTime.ToUniversalTime().Ticks -eq $expectedTicks) { return $candidate }
    return $null
}
function Set-Control([string]$Mode) {
    $target = Join-Path $state 'control.json'
    $value = @{ action=$Mode; scanId=[Guid]::NewGuid().ToString('N') } | ConvertTo-Json
    [IO.File]::WriteAllText("$target.tmp", $value, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath "$target.tmp" -Destination $target -Force
}
if ($Action -eq 'Start') {
    if (!(Get-QAProcess)) {
        Set-Control 'run'
        $worker = Join-Path $root 'worker.mjs'
        $candidate = Start-Process -FilePath $config.nodePath -ArgumentList ('"{0}"' -f $worker) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'worker.stdout.log') -RedirectStandardError (Join-Path $state 'worker.stderr.log') -PassThru
        @{ pid=$candidate.Id; startTimeTicks=$candidate.StartTime.ToUniversalTime().Ticks } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $state 'process.json') -Encoding utf8
        Start-Sleep -Seconds 2
    }
}
if ($Action -eq 'Pause') { Set-Control 'pause' }
if ($Action -eq 'Resume' -or $Action -eq 'Scan') { Set-Control 'run' }
if ($Action -eq 'Stop') {
    Set-Control 'stop'
    $candidate = Get-QAProcess
    if ($candidate) {
        try { Wait-Process -Id $candidate.Id -Timeout 25 -ErrorAction Stop } catch { throw 'Dienst reagiert nicht auf Stop. Kein ungepruefter Fremdprozess wird beendet.' }
    }
}
if ($Action -eq 'Connect') {
    $connection = Get-Content -Raw -LiteralPath (Join-Path $state 'connect.json') | ConvertFrom-Json
    [pscustomobject]@{ connectionUrl=$connection.url; note='WhatsApp am Handy: Verknuepfte Geraete. Inoffizielle Bibliothek, Kontosperre moeglich.' } | ConvertTo-Json
    return
}
$statusFile = Join-Path $state 'status.json'
$status = if (Test-Path -LiteralPath $statusFile) { Get-Content -Raw -LiteralPath $statusFile | ConvertFrom-Json } else { @{phase='starting'} }
[pscustomobject]@{ running=[bool](Get-QAProcess); status=$status; report=(Join-Path $state 'Bericht.md') } | ConvertTo-Json -Depth 8
