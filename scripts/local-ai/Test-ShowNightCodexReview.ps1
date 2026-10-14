[CmdletBinding()]
param([Parameter(Mandatory)][string]$GitPath)
$ErrorActionPreference='Stop'
$testParent=[IO.Path]::GetFullPath($env:TEMP)
$fixture=Join-Path $testParent ('shownight-codex-review-test-'+[Guid]::NewGuid().ToString('N'))
$repo=Join-Path $fixture 'repo';$install=Join-Path $fixture 'install';$homeFolder=Join-Path $fixture 'codex'
function JsonFile([string]$File,$Value){New-Item -ItemType Directory -Path (Split-Path $File -Parent) -Force|Out-Null;$Value|ConvertTo-Json -Depth 20|Set-Content -LiteralPath $File -Encoding utf8}
function Check([bool]$Condition,[string]$Message){if(!$Condition){throw $Message}}
try{
    New-Item -ItemType Directory -Path (Join-Path $repo 'packages\contracts\src') -Force|Out-Null
    & $GitPath -C $repo init -q
    & $GitPath -C $repo config user.name 'Synthetic Test'
    & $GitPath -C $repo config user.email 'test@example.invalid'
    & $GitPath -C $repo remote add origin 'https://github.com/SchapfeldNils/ShowNight-System.git'
    $sourceFile=Join-Path $repo 'packages\contracts\src\fixture.ts'
    'export const value = 1;'|Set-Content -LiteralPath $sourceFile -Encoding utf8
    & $GitPath -C $repo add .
    & $GitPath -C $repo commit -qm fixture
    if($LASTEXITCODE-ne 0){throw 'Git-Fixture fehlgeschlagen.'}
    $commit=& $GitPath -C $repo rev-parse HEAD
    $blob=& $GitPath -C $repo rev-parse 'HEAD:packages/contracts/src/fixture.ts'
    JsonFile (Join-Path $install 'installation.json') @{}
    JsonFile (Join-Path $install 'qa\config.json') @{gitPath=$GitPath}
    $task=@{id=('a'*64);status='done';file='packages/contracts/src/fixture.ts';commit=$commit;blob=$blob;completedAt='2026-10-14T19:00:00Z';result=@{findings=@(@{line=1;evidence='export const value';description='synthetic candidate';suggestion='verify'});testIdeas=@(@{line=1;evidence='export const value';idea='synthetic test idea'})}}
    JsonFile (Join-Path $install 'qa\state\state.json') @{tasks=@{first=$task}}
    $helper=Join-Path $PSScriptRoot 'Get-ShowNightLocalFindings.ps1'
    $first=& $helper -InstallRoot $install -Workspace $repo -PathPrefix 'packages/contracts' -MaxItems 1|ConvertFrom-Json
    Check ($first.findings.Count-eq 1 -and $first.openRelevant-eq 2 -and $first.findings[0].sameCommittedFile) 'Filter/Limit/Git-Abgleich falsch.'
    $triage=@{};$triage[$first.findings[0].id]=@{status='rejected';blob=$blob;reason='synthetic rejected'}
    JsonFile (Join-Path $repo '.local\local-ai\triage.json') $triage
    $remaining=& $helper -InstallRoot $install -Workspace $repo|ConvertFrom-Json
    Check ($remaining.findings.Count-eq 1 -and $remaining.findings[0].kind-eq 'testIdeas') 'Erledigter Hinweis nicht dedupliziert.'
    $triage[$remaining.findings[0].id]=@{status='deferred';blob=$blob;reason='later authorized package'}
    JsonFile (Join-Path $repo '.local\local-ai\triage.json') $triage
    $deferred=& $helper -InstallRoot $install -Workspace $repo|ConvertFrom-Json
    Check ($deferred.findings.Count-eq 1 -and $deferred.findings[0].previousDecision.status-eq 'deferred') 'Aufgeschobener Hinweis verloren.'
    'export const value = 2;'|Set-Content -LiteralPath $sourceFile -Encoding utf8
    & $GitPath -C $repo add packages/contracts/src/fixture.ts
    & $GitPath -C $repo commit -qm changed
    $stale=& $helper -InstallRoot $install -Workspace $repo|ConvertFrom-Json
    Check (!$stale.findings[0].sameCommittedFile) 'Veralteter Quellstand nicht erkannt.'
    New-Item -ItemType Directory -Path $homeFolder -Force|Out-Null
    [IO.File]::WriteAllText((Join-Path $homeFolder 'AGENTS.md'),'')
    & (Join-Path $PSScriptRoot 'Enable-ShowNightCodexReview.ps1') -CodexHome $homeFolder -InstallRoot $install|Out-Null
    Add-Content -LiteralPath (Join-Path $homeFolder 'AGENTS.md') -Value 'Synthetic existing user instruction.'
    & (Join-Path $PSScriptRoot 'Enable-ShowNightCodexReview.ps1') -CodexHome $homeFolder -InstallRoot $install|Out-Null
    $instructions=[IO.File]::ReadAllText((Join-Path $homeFolder 'AGENTS.md'))
    Check (($instructions.Split('<!-- SHOW NIGHT LOCAL REVIEW START -->').Count-1)-eq 1) 'Anweisung doppelt eingetragen.'
    Check ($instructions.Contains('Synthetic existing user instruction.')) 'Vorhandene Benutzeranweisung verloren.'
    Write-Output 'Codex-Integration: Filter/Limit, Deduplizierung, Deferred, Quellwechsel und idempotente Anweisungserhaltung bestanden.'
}finally{
    $absolute=[IO.Path]::GetFullPath($fixture)
    if(!$absolute.StartsWith($testParent.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)-or !(Split-Path $absolute -Leaf).StartsWith('shownight-codex-review-test-')){throw 'Unsicherer Test-Cleanup-Pfad.'}
    if(Test-Path -LiteralPath $absolute){Remove-Item -LiteralPath $absolute -Recurse -Force}
}
