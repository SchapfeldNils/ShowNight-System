#ifndef PayloadDir
  #error PayloadDir fehlt
#endif
#ifndef OutputDir
  #error OutputDir fehlt
#endif
[Setup]
AppId={{91B460DA-7153-4619-9B7D-DC6EAD45982B}
AppName=ShowNight Streaming
AppVersion=0.3.5
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
Name: "{group}\ShowNight Streaming starten"; Filename: "{app}\Streaming-Start.cmd"; WorkingDir: "{app}"
Name: "{group}\1 - Lokalen Server einrichten"; Filename: "{app}\Server-Einrichten.cmd"; WorkingDir: "{app}"
Name: "{group}\2 - Serverschlüssel importieren"; Filename: "{app}\Serverschluessel-Importieren.cmd"; WorkingDir: "{app}"
Name: "{group}\3 - Anmeldestand importieren"; Filename: "{app}\Anmeldestand-Importieren.cmd"; WorkingDir: "{app}"
Name: "{group}\Netzwerk prüfen"; Filename: "{app}\Server-Netzwerk-Pruefen.cmd"; WorkingDir: "{app}"
Name: "{group}\Installationshinweise"; Filename: "{app}\Installationshinweise.txt"
Name: "{group}\Programmordner"; Filename: "{app}"
Name: "{group}\Deinstallieren"; Filename: "{uninstallexe}"
Name: "{autodesktop}\ShowNight Streaming"; Filename: "{app}\Streaming-Start.cmd"; WorkingDir: "{app}"; Tasks: desktopicon

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

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if OwnApplicationRunning then
    Result := 'ShowNight im Zielordner läuft noch oder die Prozessprüfung ist nicht verfügbar. Bitte Server und Renderer regulär beenden und erneut versuchen.';
end;

function InitializeUninstall: Boolean;
begin
  Result := not OwnApplicationRunning;
  if not Result then
    MsgBox('Bitte ShowNight im Installationsordner regulär beenden. Die Deinstallation beendet keine laufenden Prozesse.', mbError, MB_OK);
end;
