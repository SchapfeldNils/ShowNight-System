#ifndef PayloadDir
  #error PayloadDir fehlt
#endif
#ifndef OutputDir
  #error OutputDir fehlt
#endif
[Setup]
AppId={{91B460DA-7153-4619-9B7D-DC6EAD45982B}
AppName=ShowNight Streaming
AppVersion=0.3.12
VersionInfoVersion=0.3.12
VersionInfoProductName=ShowNight Streaming
AppPublisher=ShowNight
AppPublisherURL=https://github.com/SchapfeldNils/ShowNight-System
DefaultDirName={localappdata}\Programs\ShowNight\Streaming
DefaultGroupName=ShowNight Streaming
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#OutputDir}
OutputBaseFilename=ShowNight-Streaming-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableWelcomePage=no
CloseApplications=no
RestartApplications=no
UninstallDisplayIcon={app}\node.exe
SetupLogging=yes
InfoBeforeFile={#PayloadDir}\Installationshinweise.txt

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "Verknüpfung auf dem Desktop erstellen"; Flags: unchecked

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
#ifdef WithRenderer
Name: "{group}\ShowNight Streaming starten"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\Server-Oberflaeche.ps1"" -Renderer"; WorkingDir: "{app}"
#else
Name: "{group}\ShowNight Streaming starten"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\Server-Oberflaeche.ps1"""; WorkingDir: "{app}"
#endif
Name: "{group}\1 - Lokalen Server einrichten"; Filename: "{app}\Server-Einrichten.cmd"; WorkingDir: "{app}"
Name: "{group}\Inhaltspaket importieren"; Filename: "{app}\Server-Paket-Importieren.cmd"; WorkingDir: "{app}"
Name: "{group}\2 - Serverschlüssel importieren"; Filename: "{app}\Serverschluessel-Importieren.cmd"; WorkingDir: "{app}"
Name: "{group}\3 - Anmeldestand importieren"; Filename: "{app}\Anmeldestand-Importieren.cmd"; WorkingDir: "{app}"
Name: "{group}\Netzwerk prüfen"; Filename: "{app}\Server-Netzwerk-Pruefen.cmd"; WorkingDir: "{app}"
Name: "{group}\Einrichtungsstatus prüfen"; Filename: "{app}\Server-Status.cmd"; WorkingDir: "{app}"
Name: "{group}\Server stoppen"; Filename: "{app}\Server-Stoppen.cmd"; WorkingDir: "{app}"
Name: "{group}\Installationshinweise"; Filename: "{app}\Installationshinweise.txt"
Name: "{group}\Programmordner"; Filename: "{app}"
Name: "{group}\Deinstallieren"; Filename: "{uninstallexe}"
#ifdef WithRenderer
Name: "{autodesktop}\ShowNight Streaming"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\Server-Oberflaeche.ps1"" -Renderer"; WorkingDir: "{app}"; Tasks: desktopicon
#else
Name: "{autodesktop}\ShowNight Streaming"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\Server-Oberflaeche.ps1"""; WorkingDir: "{app}"; Tasks: desktopicon
#endif

[Code]
function OwnApplicationRunning: Boolean;
var
  Services, Processes, Process: Variant;
  I: Integer;
  RuntimePath, RendererPath: String;
begin
  Result := True;
  try
    RuntimePath := Lowercase(ExpandConstant('{app}\node.exe'));
    RendererPath := Lowercase(ExpandConstant('{app}\renderer\shownight-renderer.exe'));
    Services := CreateOleObject('WbemScripting.SWbemLocator');
    Services := Services.ConnectServer('', 'root\CIMV2');
    Processes := Services.ExecQuery('SELECT ExecutablePath FROM Win32_Process WHERE Name = ''node.exe'' OR Name = ''shownight-renderer.exe''');
    for I := 0 to Processes.Count - 1 do begin
      Process := Processes.ItemIndex(I);
      if not VarIsNull(Process.ExecutablePath) then
        if (Lowercase(String(Process.ExecutablePath)) = RuntimePath) or
           (Lowercase(String(Process.ExecutablePath)) = RendererPath) then exit;
    end;
    Result := False;
  except
    Log('Prozessprüfung nicht verfügbar; Installation wird angehalten.');
  end;
end;

function StopOwnServer: Boolean;
var
  ResultCode, Attempt: Integer;
begin
  // Issue #32: nur den eigenen Server über den lokalen, tokengeschützten Steuerkanal
  // geordnet beenden. Kein Prozessabschuss; fremde Prozesse bleiben unberührt.
  Result := False;
  if not FileExists(ExpandConstant('{app}\main.js')) then exit;
  Log('Eigenen ShowNight-Server geordnet beenden.');
  if not Exec(ExpandConstant('{app}\node.exe'), '"' + ExpandConstant('{app}\main.js') + '" stop',
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then exit;
  Log('Stoppbefehl beendet mit Code ' + IntToStr(ResultCode) + '.');
  if ResultCode <> 0 then exit;
  // Programmdateien erst nach dem tatsächlichen Prozessende freigeben.
  for Attempt := 1 to 20 do begin
    if not OwnApplicationRunning then begin
      Result := True;
      exit;
    end;
    Sleep(500);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not OwnApplicationRunning then exit;
  if not WizardSilent then
    if MsgBox('Der lokale ShowNight-Server dieser Installation läuft noch.' + #13#10 + #13#10 +
        'Für das Update wird er jetzt geordnet beendet. Daten, Profil und Pakete bleiben erhalten. ' +
        'Läuft gerade eine Probe oder Veranstaltung, bitte „Nein“ wählen und später aktualisieren.' + #13#10 + #13#10 +
        'Server jetzt beenden und fortfahren?', mbConfirmation, MB_YESNO) <> IDYES then begin
      Result := 'Update auf Wunsch abgebrochen. Der Server läuft unverändert weiter.';
      exit;
    end;
  if not StopOwnServer then
    Result := 'Der laufende ShowNight-Prozess konnte nicht geordnet beendet werden oder gehört nicht eindeutig zum lokalen Server dieser Installation. ' +
      'Es wurde nichts überschrieben. Bitte über „Server stoppen“ oder im Serverfenster mit Strg+C beenden und erneut versuchen.';
end;

function InitializeUninstall: Boolean;
begin
  Result := True;
  if not OwnApplicationRunning then exit;
  if not UninstallSilent then
    if MsgBox('Der lokale ShowNight-Server dieser Installation läuft noch. Für die Deinstallation wird er geordnet beendet; Daten, Profil und Pakete bleiben erhalten. Fortfahren?',
        mbConfirmation, MB_YESNO) <> IDYES then begin
      Result := False;
      exit;
    end;
  Result := StopOwnServer;
  if not Result then
    MsgBox('ShowNight konnte nicht geordnet beendet werden oder gehört nicht eindeutig zu dieser Installation. Es wurde nichts entfernt. Bitte über „Server stoppen“ oder mit Strg+C im Serverfenster beenden.', mbError, MB_OK);
end;
