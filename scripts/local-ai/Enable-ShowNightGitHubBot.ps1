[CmdletBinding()]
param([Parameter(Mandatory)][string]$GhPath,[string]$InstallRoot=(Join-Path $env:USERPROFILE 'AppData\Local\ShowNight\LocalAI'),[ValidateRange(300,86400)][int]$IntervalSeconds=900)
$ErrorActionPreference='Stop'
if(!(Test-Path -LiteralPath $GhPath -PathType Leaf)){throw 'GitHub CLI fehlt.'}
$qa=Join-Path $InstallRoot 'qa'
$configPath=Join-Path $qa 'config.json'
$config=Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json -AsHashtable
$origin=& $config.gitPath -C $config.repositoryRoot remote get-url origin
if($LASTEXITCODE-ne 0 -or $origin -notmatch '^(https://github\.com/|git@github\.com:)SchapfeldNils/ShowNight-System(?:\.git)?$'){throw 'Pruefbot nur fuer ShowNight zugelassen.'}
# Test an actual read without printing account credentials or external descriptions.
& $GhPath api --hostname github.com --method GET repos/SchapfeldNils/ShowNight-System --jq .full_name | Out-Null
if($LASTEXITCODE-ne 0){throw 'GitHub-Lesezugriff fehlt.'}
$controller=Join-Path $InstallRoot 'ShowNightLocalQA.ps1'
& $controller -Action Stop | Out-Null
foreach($name in @('core.mjs','github.mjs','worker.mjs','dashboard.mjs')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot "qa\$name") -Destination (Join-Path $qa $name) -Force}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Get-ShowNightLocalFindings.ps1') -Destination (Join-Path $InstallRoot 'Get-ShowNightLocalFindings.ps1') -Force
$config.githubEnabled=$true
$config.ghPath=(Resolve-Path -LiteralPath $GhPath).Path
$config.githubIntervalSeconds=$IntervalSeconds
[IO.File]::WriteAllText("$configPath.tmp",($config|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath "$configPath.tmp" -Destination $configPath -Force
& $controller -Action Start
