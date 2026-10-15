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
$script:stopProcess = $null
$script:stopRead = $null
$script:stopStarted = [DateTime]::MinValue
$script:updateProcess = $null
$script:updateRead = $null
$script:updateStarted = [DateTime]::MinValue
$script:updateReady = $null
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
$layout.RowCount = 8
foreach ($height in @(46,34,42,34)) {
    [void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,$height)))
}
[void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)))
[void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,90)))
[void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,34)))
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
$stopButton = Button 'Server stoppen'
$open = Button 'Server im Browser'
$folder = Button 'Datenordner'
$guide = Button 'Anleitung'
$checkUpdate = Button 'Nach Updates suchen'
$installUpdate = Button 'Update installieren'
$installUpdate.Enabled = $false
$start.Enabled = $false
$stopButton.Enabled = $false
$open.Enabled = $false
$folder.Enabled = $false
$footer = Label 'Serverstart öffnet ein eigenes Fenster. Beenden über „Server stoppen“ (alternativ Strg+C im Serverfenster). Oberfläche: vorläufige Gestaltung.' 9
$footer.ForeColor = $subtitle.ForeColor
$updateLabel = Label 'Softwareupdates: noch nicht geprüft' 10
$updateLabel.ForeColor = $subtitle.ForeColor
$updateLabel.AccessibleName = 'Status der Softwareupdates'
$layout.Controls.Add($updateLabel,0,6)
$layout.Controls.Add($footer,0,7)
function Read-Status {
    if ($script:statusProcess) { return }
    $refresh.Enabled = $false
    $start.Enabled = $false
    $stopButton.Enabled = $false
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
function Check-Update {
    # Issue #33: prüft und lädt nur geprüfte Updates herunter, installiert nie selbst.
    if ($script:updateProcess) { return }
    $checkUpdate.Enabled = $false
    $installUpdate.Enabled = $false
    $script:updateReady = $null
    $updateLabel.Text = 'Softwareupdates: Prüfung läuft …'
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $runtime
    $info.Arguments = '"' + $entry + '" update-check'
    $info.WorkingDirectory = $PSScriptRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.Encoding]::UTF8
    $script:updateProcess = New-Object Diagnostics.Process
    $script:updateProcess.StartInfo = $info
    try {
        [void]$script:updateProcess.Start()
        $script:updateRead = $script:updateProcess.StandardOutput.ReadToEndAsync()
        $script:updateError = $script:updateProcess.StandardError.ReadToEndAsync()
        $script:updateStarted = [DateTime]::UtcNow
    } catch {
        $script:updateProcess.Dispose()
        $script:updateProcess = $null
        $updateLabel.Text = 'Softwareupdates: Prüfung nicht möglich.'
        $checkUpdate.Enabled = $true
    }
}
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 250
$timer.Add_Tick({
    if ($script:updateProcess) {
        # Download kann dauern; nach 15 Minuten abbrechen.
        $updateExpired = ([DateTime]::UtcNow - $script:updateStarted).TotalMinutes -gt 15
        if ($script:updateProcess.HasExited -or $updateExpired) {
            try {
                if ($updateExpired) { $script:updateProcess.Kill(); throw 'Timeout' }
                if ($script:updateProcess.ExitCode -ne 0) { throw 'Status' }
                $raw = $script:updateRead.GetAwaiter().GetResult()
                if ($raw.Length -gt 65536) { throw 'Limit' }
                $u = $raw | ConvertFrom-Json
                $updateLabel.Text = 'Softwareupdates: ' + $u.message
                if ($u.state -eq 'ready') {
                    $script:updateReady = $u.version
                    $installUpdate.Enabled = $true
                }
            } catch {
                $updateLabel.Text = 'Softwareupdates: Prüfung nicht bestätigt. Installierte Version bleibt in Betrieb.'
            } finally {
                $script:updateProcess.Dispose()
                $script:updateProcess = $null
                $checkUpdate.Enabled = $true
            }
        }
    }
    if ($script:stopProcess) {
        $stopExpired = ([DateTime]::UtcNow - $script:stopStarted).TotalSeconds -gt 40
        if ($script:stopProcess.HasExited -or $stopExpired) {
            try {
                if ($stopExpired) { $script:stopProcess.Kill(); throw 'Timeout' }
                $message = $script:stopRead.GetAwaiter().GetResult()
                if ($message.Length -gt 4096) { throw 'Limit' }
                if ($script:stopProcess.ExitCode -eq 0) { $state.Text = $message.Trim() }
                else { $state.Text = 'Stopp nicht bestätigt: ' + $message.Trim() }
            } catch {
                $state.Text = 'Stopp nicht bestätigt. Status aktualisieren; nichts gewaltsam beendet.'
            } finally {
                $script:stopProcess.Dispose()
                $script:stopProcess = $null
                Read-Status
            }
        }
        return
    }
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
        $running = $s.service -and $s.service.state -eq 'running'
        $stopButton.Enabled = $running
        if ($s.listener -eq 'alive') {
            $state.Text = 'HTTPS-Dienst antwortet · ' + $s.origin
            $open.Enabled = $true
        } elseif ($running) {
            $state.Text = 'Server läuft · Antwort des HTTPS-Dienstes noch nicht bestätigt'
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
$stopButton.Add_Click({
    if ($script:stopProcess -or $script:statusProcess) { return }
    # Nur der eigene Server dieser Installation wird über den lokalen Steuerkanal
    # geordnet beendet. Kein Prozessabschuss.
    $stopButton.Enabled = $false
    $start.Enabled = $false
    $state.Text = 'Server wird geordnet beendet …'
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $runtime
    $info.Arguments = '"' + $entry + '" stop'
    $info.WorkingDirectory = $PSScriptRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.StandardOutputEncoding = [Text.Encoding]::UTF8
    $script:stopProcess = New-Object Diagnostics.Process
    $script:stopProcess.StartInfo = $info
    try {
        [void]$script:stopProcess.Start()
        $script:stopRead = $script:stopProcess.StandardOutput.ReadToEndAsync()
        $script:stopStarted = [DateTime]::UtcNow
    } catch {
        $script:stopProcess.Dispose()
        $script:stopProcess = $null
        $state.Text = 'Stoppwerkzeug nicht verfügbar. Vollständige Installation und Anleitung prüfen.'
    }
})
$checkUpdate.Add_Click({ Check-Update })
$installUpdate.Add_Click({
    if (!$script:updateReady -or $script:updateProcess) { return }
    $answer = [Windows.Forms.MessageBox]::Show(
        'Version ' + $script:updateReady + ' installieren?' + [Environment]::NewLine + [Environment]::NewLine +
        'Der lokale Server wird dafür geordnet beendet. Daten, Profil und Pakete bleiben erhalten. ' +
        'Während einer Probe oder Veranstaltung bitte „Nein“ wählen und später aktualisieren.',
        'ShowNight · Softwareupdate', 'YesNo', 'Question')
    if ($answer -ne 'Yes') { return }
    $installUpdate.Enabled = $false
    $updateLabel.Text = 'Softwareupdates: Download und Signatur werden erneut geprüft …'
    try {
        $info = New-Object Diagnostics.ProcessStartInfo
        $info.FileName = $runtime
        $info.Arguments = '"' + $entry + '" update-prepare'
        $info.WorkingDirectory = $PSScriptRoot
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true
        $info.StandardOutputEncoding = [Text.Encoding]::UTF8
        $prepare = [Diagnostics.Process]::Start($info)
        $raw = $prepare.StandardOutput.ReadToEnd()
        if (!$prepare.WaitForExit(120000)) { $prepare.Kill(); throw 'Timeout' }
        $p = $raw | ConvertFrom-Json
        if (!$p.ok) { $updateLabel.Text = 'Softwareupdates: ' + $p.message; return }
        if (!(Test-Path -LiteralPath $p.path -PathType Leaf)) { throw 'Datei' }
        $log = Join-Path $env:TEMP ('ShowNight-Update-' + $p.version + '.log')
        # Setup beendet den eigenen Server geordnet (Issue #32) und behält alle Daten.
        Start-Process -FilePath $p.path -ArgumentList @('/SILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',('/LOG="' + $log + '"'))
        [void][Windows.Forms.MessageBox]::Show('Das Update wird installiert. Danach „ShowNight Streaming starten“ erneut öffnen.', 'ShowNight · Softwareupdate', 'OK', 'Information')
        $form.Close()
    } catch {
        $updateLabel.Text = 'Softwareupdates: Installation nicht gestartet. Nichts geändert; erneut nach Updates suchen.'
        $installUpdate.Enabled = $true
    }
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
$form.Add_Shown({ $timer.Start(); Read-Status; Check-Update })
$form.Add_FormClosed({
    $timer.Stop()
    $timer.Dispose()
    if ($script:statusProcess) {
        if (!$script:statusProcess.HasExited) { $script:statusProcess.Kill() }
        $script:statusProcess.Dispose()
    }
    # Ein laufender Stoppbefehl wird nicht abgebrochen; er beendet sich selbst.
    if ($script:stopProcess) { $script:stopProcess.Dispose() }
    if ($script:updateProcess) {
        if (!$script:updateProcess.HasExited) { $script:updateProcess.Kill() }
        $script:updateProcess.Dispose()
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
        stopEnabled = $stopButton.Enabled
        installUpdateEnabled = $installUpdate.Enabled
        openEnabled = $open.Enabled
        ready = ($null -ne $script:lastStatus -and $script:lastStatus.ready)
    } | ConvertTo-Json -Compress
    $timer.Stop()
    $timer.Dispose()
} else { [void]$form.ShowDialog() }
$form.Dispose()
