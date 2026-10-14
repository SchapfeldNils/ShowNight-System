[CmdletBinding()]
param([string]$CodexHome=(Join-Path $env:USERPROFILE '.codex'),[string]$InstallRoot=(Join-Path $env:USERPROFILE 'AppData\Local\ShowNight\LocalAI'))
$ErrorActionPreference='Stop'
if(!(Test-Path -LiteralPath (Join-Path $InstallRoot 'installation.json'))){throw 'Lokale KI fehlt.'}
foreach($name in @('Get-ShowNightLocalFindings.ps1','Get-ShowNightGitHubInbox.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $InstallRoot $name) -Force}
[string]$template=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'codex-review-workflow.md'))
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'codex-review-workflow.md') -Destination (Join-Path $InstallRoot 'codex-review-workflow.md') -Force
$override=Join-Path $CodexHome 'AGENTS.override.md'
$target=if((Test-Path -LiteralPath $override)-and (Get-Item -LiteralPath $override).Length-gt 0){$override}else{Join-Path $CodexHome 'AGENTS.md'}
New-Item -ItemType Directory -Path $CodexHome -Force|Out-Null
[string]$existing=''
if(Test-Path -LiteralPath $target){$existing=[IO.File]::ReadAllText($target)}
$marker='(?s)<!-- SHOW NIGHT LOCAL REVIEW START -->.*?<!-- SHOW NIGHT LOCAL REVIEW END -->'
if($existing -match 'SHOW NIGHT LOCAL REVIEW START' -and $existing -notmatch $marker){throw 'Vorhandener ShowNight-Anweisungsblock unvollständig; nicht überschreiben.'}
$updated=if($existing -match $marker){[regex]::Replace($existing,$marker,[Text.RegularExpressions.MatchEvaluator]{param($match)$template.TrimEnd()})}else{$existing.TrimEnd()+"`n`n"+$template.TrimEnd()+"`n"}
if((Test-Path -LiteralPath $target)-and !(Test-Path -LiteralPath "$target.shownight-before-local-review.bak")){Copy-Item -LiteralPath $target -Destination "$target.shownight-before-local-review.bak"}
[IO.File]::WriteAllText("$target.tmp",$updated,[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath "$target.tmp" -Destination $target -Force
[pscustomobject]@{enabled=$true;scope='SchapfeldNils/ShowNight-System';instructionsFile=$target;effective='Neue Codex-Läufe; laufende Chats müssen die Ergänzung erneut lesen.'}|ConvertTo-Json
