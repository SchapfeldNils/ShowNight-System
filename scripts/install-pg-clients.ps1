$ErrorActionPreference = 'Stop'
$toolsDir = Join-Path $env:LOCALAPPDATA 'ShowNight\tools'
$archivePath = Join-Path $toolsDir 'postgresql-17.11.zip'
New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $archivePath)) {
    Invoke-WebRequest -Uri 'https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip' -OutFile $archivePath
}
$expected = '6EABDF00D2893713B75DB4336A23C3FDF505F056E217EC6E2E95D901750CFEA3'
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expected) { throw 'SHA-256 des Archivs stimmt nicht; kein Entpacken.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName -match '^pgsql/(bin/|lib/)' -and -not $entry.FullName.EndsWith('/')) {
            $target = [System.IO.Path]::GetFullPath((Join-Path $toolsDir $entry.FullName))
            $root = [System.IO.Path]::GetFullPath($toolsDir).TrimEnd('\') + '\'
            if (-not $target.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unzulässiger Archivpfad.' }
            New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
        }
    }
} finally { $archive.Dispose() }
& (Join-Path $toolsDir 'pgsql\bin\pg_dump.exe') --version
