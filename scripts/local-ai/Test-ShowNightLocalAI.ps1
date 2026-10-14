[CmdletBinding()]
param([string]$Workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path)
$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:LOCALAPPDATA 'ShowNight\LocalAI'
$invoke = Join-Path $installRoot 'Invoke-ShowNightLocalAI.ps1'
$server = Join-Path $installRoot 'ShowNightLocalAI.Server.ps1'
$endpoint = 'http://127.0.0.1:11434'
$results = [Collections.Generic.List[object]]::new()
& $server -Action Start | Out-Null
$request = @{model='shownight-local:8b';stream=$false;think=$false;keep_alive='2m';format='json';messages=@(@{role='user';content='Antworte nur als JSON mit genau dem Feld summe. Was ist 17 + 25?'});options=@{num_ctx=8192;num_predict=128;temperature=0}}
$answer = Invoke-RestMethod -Uri "$endpoint/api/chat" -Method Post -ContentType 'application/json' -Body ($request | ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 300
if (!$answer.done -or ($answer.message.content | ConvertFrom-Json).summe -ne 42) { throw 'Lokale Modellantwort nicht korrekt oder unvollstaendig.' }
$loaded = (Invoke-RestMethod -Uri "$endpoint/api/ps").models | Where-Object {$_.name -eq 'shownight-local:8b'}
if (!$loaded -or $loaded.size_vram -le 0) { throw 'Kein GPU-Speichernachweis fuer das Modell.' }
$results.Add(@{test='local-api-and-gpu';status='passed';model=$loaded.name;sizeBytes=$loaded.size;vramBytes=$loaded.size_vram;context=$loaded.context_length;answer=42})
$output = & $invoke -Workspace $Workspace -ContextFile 'packages/contracts/src/transfer.ts' -MaxTokens 512 -Task 'Erklaere in hoechstens vier deutschen Saetzen die Pruefung auf doppelte Kennungen, fehlende Medienreferenzen und das Gesamtgroessenlimit. Keine Freigabe behaupten.'
if (($output -join "`n").Length -lt 50) { throw 'Kein nutzbarer quelltextbezogener Entwurf.' }
$results.Add(@{test='tracked-project-context';status='passed';review='Modelltext bleibt ungepruefter Entwurf';answer=$output -join "`n"})
$probeRoot = Join-Path $Workspace '.local\local-ai\smoke'
New-Item -ItemType Directory -Path $probeRoot -Force | Out-Null
Set-Content -LiteralPath (Join-Path $probeRoot '.env') -Value 'SYNTHETIC_ONLY=1' -Encoding UTF8
$blocked = $false
try { & $invoke -Workspace $probeRoot -Task 'Test' -ContextFile '.env' | Out-Null } catch { $blocked = $_.Exception.Message -like '*Geschuetzte Datei*' }
if (!$blocked) { throw 'Geschuetzter Kontext wurde nicht abgewiesen.' }
$results.Add(@{test='protected-context';status='passed'})
$mutex = [Threading.Mutex]::new($false, 'Local\ShowNightLocalAI')
$mutex.WaitOne() | Out-Null
try {
    $hostExe = (Get-Process -Id $PID).Path
    $conflictOutput = & $hostExe -NoProfile -File $invoke -Workspace $probeRoot -Task 'Test' 2>&1
    if ($LASTEXITCODE -eq 0 -or ($conflictOutput -join "`n") -notlike '*bereits einen ShowNight-KI-Auftrag*') { throw 'Konkurrierender Werkzeugauftrag nicht abgewiesen.' }
    $results.Add(@{test='cross-process-gpu-lock';status='passed'})
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
Set-Content -LiteralPath (Join-Path $probeRoot 'AGENTS.md') -Value 'Isolierter synthetischer Lesetest. Lies nur fixture.txt. Keine Schreibzugriffe oder weiteren Agenten.' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $probeRoot 'fixture.txt') -Value 'SYNTHETIC_READ_ONLY_MARKER=SHOWNIGHT-GPU-42' -Encoding UTF8
$cliOutput = & $invoke -Mode Codex -ReadOnly -NonInteractive -Workspace $probeRoot -Task 'Lies ausschliesslich fixture.txt mit einem lesenden Shellwerkzeug. Gib den Wert von SYNTHETIC_READ_ONLY_MARKER aus. Erfinde den Wert nicht. Veraendere nichts.'
$events = @($cliOutput | Where-Object { $_ -is [string] -and $_.TrimStart().StartsWith('{') } | ForEach-Object { $_ | ConvertFrom-Json })
$executed = @($events | Where-Object { $_.type -eq 'item.completed' -and $_.item.type -eq 'command_execution' -and $_.item.exit_code -eq 0 -and $_.item.aggregated_output -like '*SYNTHETIC_READ_ONLY_MARKER=SHOWNIGHT-GPU-42*' })
$reported = @($events | Where-Object { $_.type -eq 'item.completed' -and $_.item.type -eq 'agent_message' -and $_.item.text -like '*SHOWNIGHT-GPU-42*' })
if (!$executed.Count -or !$reported.Count) { throw 'Lokaler Codex hat den Lesetest nicht durch einen erfolgreichen Werkzeugaufruf nachgewiesen.' }
$results.Add(@{test='local-codex-read-only-tool';status='passed';marker='SHOWNIGHT-GPU-42';provider='ollama';sandbox='read-only/unelevated';events=$events})
$dir = Join-Path $Workspace '.local\local-ai'
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $dir 'acceptance.json') -Encoding UTF8
$results | ConvertTo-Json -Depth 8
