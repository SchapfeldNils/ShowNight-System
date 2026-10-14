#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$InstallRoot)
$ErrorActionPreference = 'Stop'
$hash = 'a3de86cd1c132c822487ededd47a324c50491393e6565cd14bafa40d0b8e686f'
$total = 5225374496L
$partSize = 32MB
$downloadRoot = Join-Path $InstallRoot 'downloads'
$partsRoot = Join-Path $downloadRoot 'qwen3-8b-parts'
$partial = Join-Path $downloadRoot 'qwen3-8b.gguf.partial'
New-Item -ItemType Directory -Path $partsRoot -Force | Out-Null
$count = [int][math]::Ceiling($total / $partSize)
# Retain complete segments from a previous sequential download.
if (Test-Path -LiteralPath $partial) {
    $inputStream = [IO.File]::OpenRead($partial)
    try {
        $prefixParts = [int][math]::Floor([math]::Min($inputStream.Length, $total) / $partSize)
        $buffer = [byte[]]::new($partSize)
        for ($index = 0; $index -lt $prefixParts; $index++) {
            $part = Join-Path $partsRoot ("{0:D4}.part" -f $index)
            $marker = "$part.ok"
            if (Test-Path -LiteralPath $marker) { continue }
            $null = $inputStream.Seek([long]$index * $partSize, [IO.SeekOrigin]::Begin)
            $read = 0
            while ($read -lt $partSize) {
                $next = $inputStream.Read($buffer, $read, $partSize - $read)
                if ($next -eq 0) { throw 'Unerwartetes Ende des vorherigen Teilbestands.' }
                $read += $next
            }
            [IO.File]::WriteAllBytes($part, $buffer)
            'prefix' | Set-Content -LiteralPath $marker
        }
        Write-Host "$prefixParts vollstaendige 32-MiB-Abschnitte aus dem Teilbestand erhalten."
    } finally { $inputStream.Dispose() }
}
$completed = 0..($count - 1) | ForEach-Object -Parallel {
    $ErrorActionPreference = 'Stop'
    $index = $_
    $size = $using:partSize
    $totalBytes = $using:total
    $start = [long]$index * $size
    $end = [math]::Min($start + $size - 1, $totalBytes - 1)
    $length = $end - $start + 1
    $part = Join-Path $using:partsRoot ("{0:D4}.part" -f $index)
    $marker = "$part.ok"
    if ((Test-Path -LiteralPath $marker) -and (Get-Item -LiteralPath $part).Length -eq $length) { return $index }
    $valid = $false
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        $headers = "$part.headers"
        & curl.exe -4 --fail --silent --show-error --location --range "$start-$end" --max-filesize $length --connect-timeout 20 --max-time 120 --dump-header $headers --output $part "https://registry.ollama.ai/v2/library/qwen3/blobs/sha256:$($using:hash)"
        if ($LASTEXITCODE -eq 0 -and (Get-Item -LiteralPath $part).Length -eq $length -and
            (Get-Content -Raw -LiteralPath $headers) -match "(?im)^content-range: bytes $start-$end/$totalBytes\s*$") {
            'range-verified' | Set-Content -LiteralPath $marker
            $valid = $true
            break
        }
    }
    if (!$valid) { throw "Modellabschnitt $index nicht bestaetigt. Fertige Abschnitte bleiben erhalten." }
    Write-Host "Modellabschnitt $index fertig."
    $index
} -ThrottleLimit 4
if (@($completed).Count -ne $count) { throw 'Modell noch nicht vollstaendig. Fertige Abschnitte bleiben erhalten.' }
$assembled = Join-Path $downloadRoot 'qwen3-8b.verified-download'
$outputStream = [IO.File]::Create($assembled)
try {
    for ($index = 0; $index -lt $count; $index++) {
        $inputStream = [IO.File]::OpenRead((Join-Path $partsRoot ("{0:D4}.part" -f $index)))
        try { $inputStream.CopyTo($outputStream) } finally { $inputStream.Dispose() }
    }
} finally { $outputStream.Dispose() }
if ((Get-FileHash -LiteralPath $assembled -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'Zusammengesetzte Modell-Pruefsumme stimmt nicht. Modell wird nicht verwendet.' }
Write-Host 'Vollstaendiges Modell SHA256-geprueft.'
$assembled
