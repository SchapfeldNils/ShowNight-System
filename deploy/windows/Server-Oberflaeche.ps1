param([switch]$Renderer, [switch]$CheckOnly, [switch]$UiCheck)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$runtime = Join-Path $PSScriptRoot 'node.exe'
$entry = Join-Path $PSScriptRoot 'main.js'
if (!(Test-Path -LiteralPath $runtime) -or !(Test-Path -LiteralPath $entry)) {
    throw 'ShowNight-Laufzeit fehlt. Anwendung vollständig installieren.'
}
# Read-only diagnostic entry for isolated installer CI, without displaying a window.
if ($CheckOnly) {
    & $runtime $entry status-json
    exit $LASTEXITCODE
}
$script:statusProcess = $null
$script:statusRead = $null
$script:statusStarted = [DateTime]::MinValue
$script:lastStatus = $null
$form = New-Object Windows.Forms.Form
$form.Text = 'ShowNight · Lokaler Server'
$form.Size = New-Object Drawing.Size(950,740)
$form.MinimumSize = New-Object Drawing.Size(740,640)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [Drawing.Color]::FromArgb(13,18,29)
$form.ForeColor = [Drawing.Color]::FromArgb(235,240,248)
$form.Font = New-Object Drawing.Font('Segoe UI',10)
$layout = New-Object Windows.Forms.TableLayoutPanel
$layout.Dock = 'Fill'
$layout.Padding = New-Object Windows.Forms.Padding(28)
$layout.ColumnCount = 1
$layout.RowCount = 7
foreach ($height in @(46,34,42,34)) {
    [void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,$height)))
}
[void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)))
[void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,90)))
[void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,50)))
$form.Controls.Add($layout)
function Label([string]$text,[int]$size) {
    $label = New-Object Windows.Forms.Label
    $label.Text = $text
    $label.Dock = 'Fill'
    $label.Font = New-Object Drawing.Font('Segoe UI',$size)
    $label.AutoEllipsis = $true
    return $label
}
$title = Label 'SHOW NIGHT  /  Lokaler Server' 23
$layout.Controls.Add($title,0,0)
$subtitle = Label 'Einrichtung und Betrieb auf diesem Windows-Rechner' 11
$subtitle.ForeColor = [Drawing.Color]::FromArgb(158,175,200)
$layout.Controls.Add($subtitle,0,1)
$safety = Label 'SOFTWAREVORBEREITUNG  ·  Geräteausgabe aus  ·  Mail aus' 11
$safety.ForeColor = [Drawing.Color]::FromArgb(114,221,195)
$layout.Controls.Add($safety,0,2)
$state = Label 'Einrichtung wird gelesen …' 13
$layout.Controls.Add($state,0,3)
$details = New-Object Windows.Forms.RichTextBox
$details.Dock = 'Fill'
$details.ReadOnly = $true
$details.BackColor = [Drawing.Color]::FromArgb(23,32,48)
$details.ForeColor = $form.ForeColor
$details.BorderStyle = 'None'
$details.Font = New-Object Drawing.Font('Segoe UI',10)
$details.DetectUrls = $false
$details.AccessibleName = 'Einrichtungsstatus und verwendeter Datenpfad'
$layout.Controls.Add($details,0,4)
$buttons = New-Object Windows.Forms.FlowLayoutPanel
$buttons.Dock = 'Fill'
$buttons.Padding = New-Object Windows.Forms.Padding(0,16,0,0)
$layout.Controls.Add($buttons,0,5)
function Button([string]$text) {
    $button = New-Object Windows.Forms.Button
    $button.Text = $text
    $button.AutoSize = $true
    $button.Padding = New-Object Windows.Forms.Padding(10,6,10,6)
    $button.FlatStyle = 'Flat'
    $button.BackColor = [Drawing.Color]::FromArgb(37,54,76)
    $button.ForeColor = $form.ForeColor
    [void]$buttons.Controls.Add($button)
    return $button
}
$refresh = Button 'Status aktualisieren'
$start = Button 'Server starten'
$open = Button 'Server im Browser'
$folder = Button 'Datenordner'
$guide = Button 'Anleitung'
$start.Enabled = $false
$open.Enabled = $false
$folder.Enabled = $false
$footer = Label 'Serverstart öffnet ein eigenes Fenster. Dort mit Strg+C beenden. Oberfläche: vorläufige Gestaltung.' 9
$footer.ForeColor = $subtitle.ForeColor
$layout.Controls.Add($footer,0,6)
function Read-Status {
    if ($script:statusProcess) { return }
    $refresh.Enabled = $false
    $start.Enabled = $false
    $open.Enabled = $false
    $state.Text = 'Status wird geprüft …'
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $runtime
    $info.Arguments = '"' + $entry + '" status-json'
    $info.WorkingDirectory = $PSScriptRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.Encoding]::UTF8
    $script:statusProcess = New-Object Diagnostics.Process
    $script:statusProcess.StartInfo = $info
    try {
        [void]$script:statusProcess.Start()
        $script:statusRead = $script:statusProcess.StandardOutput.ReadToEndAsync()
        # Do not display raw stderr or use it as executable text.
        $script:statusError = $script:statusProcess.StandardError.ReadToEndAsync()
        $script:statusStarted = [DateTime]::UtcNow
    } catch {
        $script:statusProcess.Dispose()
        $script:statusProcess = $null
        $state.Text = 'Status nicht bestätigt. Laufzeit und Anleitung prüfen.'
        $refresh.Enabled = $true
    }
}
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 250
$timer.Add_Tick({
    if (!$script:statusProcess) { return }
    $expired = ([DateTime]::UtcNow - $script:statusStarted).TotalSeconds -gt 25
    if (!$script:statusProcess.HasExited -and !$expired) { return }
    try {
        if ($expired) { $script:statusProcess.Kill(); throw 'Timeout' }
        if ($script:statusProcess.ExitCode -ne 0) { throw 'Status' }
        $raw = $script:statusRead.GetAwaiter().GetResult()
        if ($raw.Length -gt 65536) { throw 'Limit' }
        $script:lastStatus = $raw | ConvertFrom-Json
        $s = $script:lastStatus
        $lines = @(('Datenordner: ' + $s.dataRoot), ('Paketordner: ' + $s.packageRoot), '') + @($s.lines)
        $details.Text = $lines -join "`r`n`r`n"
        if ($s.listener -eq 'alive') {
            $state.Text = 'HTTPS-Dienst antwortet · ' + $s.origin
            $open.Enabled = $true
        } elseif ($s.ready -eq $true) {
            $state.Text = 'Einrichtung vorbereitet · laufender Dienst nicht bestätigt'
            $start.Enabled = $true
        } else {
            $state.Text = 'Einrichtung benötigt weitere Schritte'
        }
        $folder.Enabled = Test-Path -LiteralPath $s.dataRoot -PathType Container
    } catch {
        $script:lastStatus = $null
        $state.Text = 'Status nicht bestätigt. Aktualisieren oder Anleitung prüfen.'
        $details.Text = 'Vorherige Angaben sind nicht mehr bestätigt. Vorhandene Daten und Schlüssel erhalten.'
        $folder.Enabled = $false
    } finally {
        $script:statusProcess.Dispose()
        $script:statusProcess = $null
        $refresh.Enabled = $true
    }
})
$refresh.Add_Click({ Read-Status })
$start.Add_Click({
    $starter = if ($Renderer) { 'Server-Mit-Renderer-Start.cmd' } else { 'Server-Start.cmd' }
    # Explicit action: the existing starter preserves failures with pause and
    # leaves a visible console for regular shutdown with Ctrl+C.
    try {
        Start-Process -FilePath (Join-Path $PSScriptRoot $starter) -WorkingDirectory $PSScriptRoot -WindowStyle Normal
        $state.Text = 'Serverstart angefordert. Status nach einigen Sekunden aktualisieren.'
        $start.Enabled = $false
    } catch { $state.Text = 'Startwerkzeug nicht verfügbar. Vollständige Installation und Anleitung prüfen.' }
})
$open.Add_Click({
    $uri = $null
    if ($script:lastStatus -and [Uri]::TryCreate($script:lastStatus.origin,[UriKind]::Absolute,[ref]$uri) -and $uri.Scheme -eq 'https' -and $uri.Port -eq 3443) {
        Start-Process -FilePath $uri.AbsoluteUri
    }
})
$folder.Add_Click({
    if ($script:lastStatus -and (Test-Path -LiteralPath $script:lastStatus.dataRoot -PathType Container)) {
        Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') -ArgumentList ('"' + $script:lastStatus.dataRoot + '"')
    }
})
$guide.Add_Click({
    Start-Process -FilePath (Join-Path $env:WINDIR 'System32\notepad.exe') -ArgumentList ('"' + (Join-Path $PSScriptRoot 'Anleitung.md') + '"')
})
$form.Add_Shown({ $timer.Start(); Read-Status })
$form.Add_FormClosed({
    $timer.Stop()
    $timer.Dispose()
    if ($script:statusProcess) {
        if (!$script:statusProcess.HasExited) { $script:statusProcess.Kill() }
        $script:statusProcess.Dispose()
    }
})
if ($UiCheck) {
    # CI constructs the actual controls and reads a synthetic profile without
    # showing a window, launching a server or changing machine/user settings.
    $timer.Start()
    Read-Status
    while ($script:statusProcess) {
        [Windows.Forms.Application]::DoEvents()
        [Threading.Thread]::Sleep(25)
    }
    [ordered]@{
        title = $form.Text
        details = $details.Text
        startEnabled = $start.Enabled
        openEnabled = $open.Enabled
        ready = ($null -ne $script:lastStatus -and $script:lastStatus.ready)
    } | ConvertTo-Json -Compress
    $timer.Stop()
    $timer.Dispose()
} else { [void]$form.ShowDialog() }
$form.Dispose()
