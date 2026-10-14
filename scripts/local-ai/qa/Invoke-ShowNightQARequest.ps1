[CmdletBinding()]
param([Parameter(Mandatory)][string]$RequestPath, [Parameter(Mandatory)][string]$ResponsePath)
$ErrorActionPreference = 'Stop'
$stateRoot = Join-Path $PSScriptRoot 'state'
foreach ($candidate in @($RequestPath, $ResponsePath)) {
    $absolute = [IO.Path]::GetFullPath($candidate)
    if (![string]::Equals([IO.Path]::GetDirectoryName($absolute), $stateRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Anfragepfad ausserhalb des privaten QA-Zustands.' }
}
$mutex = [Threading.Mutex]::new($false, 'Local\ShowNightLocalAI')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (!$locked) { exit 75 }
    & (Join-Path (Split-Path $PSScriptRoot -Parent) 'ShowNightLocalAI.Server.ps1') -Action Start | Out-Null
    $request = Get-Content -Raw -LiteralPath $RequestPath | ConvertFrom-Json
    if ($request.system.Length -gt 3000 -or $request.user.Length -gt 12000 -or !$request.schema) { throw 'Anfragevertrag verletzt.' }
    $body = @{
        model = 'shownight-local:8b'; stream = $false; think = $false; keep_alive = '2m'; format = $request.schema
        messages = @(@{role='system'; content=$request.system}, @{role='user'; content=$request.user})
        options = @{num_ctx=8192; num_predict=1536; temperature=0}
    } | ConvertTo-Json -Depth 20 -Compress
    $answer = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/chat' -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 180
    $temporary = "$ResponsePath.tmp"
    $answer | ConvertTo-Json -Depth 24 | Set-Content -LiteralPath $temporary -Encoding utf8
    Move-Item -LiteralPath $temporary -Destination $ResponsePath -Force
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
