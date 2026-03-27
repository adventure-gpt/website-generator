; ============================================================
; Website Generator — Inno Setup Installer Script
; Compile with Inno Setup 6+ to produce a single .exe
; ============================================================

#define MyAppName "Website Generator"
#define MyAppVersion "1.0"
#define MyAppPublisher "Website Generator"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={userdocs}\websites
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=WebsiteGenerator-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=120
SetupIconFile=icon.ico
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DisableWelcomePage=no
UsePreviousAppDir=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "templates\*"; DestDir: "{tmp}\wg-templates"; Flags: recursesubdirs createallsubdirs deleteafterinstall
Source: "post-install.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "tool-installer.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\Website Generator.code-workspace"; IconFilename: "{app}\icon.ico"; Comment: "Open your website workspace"
Name: "{group}\{#MyAppName}"; Filename: "{app}\Website Generator.code-workspace"; IconFilename: "{app}\icon.ico"
Name: "{group}\User Guide"; Filename: "{app}\USER_GUIDE.md"
Name: "{group}\Re-run Setup Wizard"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\tool-installer.ps1"" -UserName ""{code:GetUserName}"" -UserEmail ""{code:GetUserEmail}"" -AdminName ""{code:GetAdminName}"" -PronounSubject ""{code:GetPronounSubject}"" -PronounObject ""{code:GetPronounObject}"" -PronounPossessive ""{code:GetPronounPossessive}"" -InstallDir ""{app}"""; IconFilename: "{app}\icon.ico"

[Run]
; First: generate config files from templates (hidden)
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\post-install.ps1"" -InstallDir ""{app}"" -TemplateDir ""{tmp}\wg-templates"" -UserName ""{code:GetUserName}"" -UserEmail ""{code:GetUserEmail}"" -AdminName ""{code:GetAdminName}"" -PronounSubject ""{code:GetPronounSubject}"" -PronounObject ""{code:GetPronounObject}"" -PronounPossessive ""{code:GetPronounPossessive}"""; StatusMsg: "Setting up workspace files..."; Flags: runhidden waituntilterminated
; Then: launch the guided setup wizard (always, not optional)
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\tool-installer.ps1"" -UserName ""{code:GetUserName}"" -UserEmail ""{code:GetUserEmail}"" -AdminName ""{code:GetAdminName}"" -PronounSubject ""{code:GetPronounSubject}"" -PronounObject ""{code:GetPronounObject}"" -PronounPossessive ""{code:GetPronounPossessive}"" -InstallDir ""{app}"""; StatusMsg: "Opening setup wizard..."; Flags: nowait

[Code]
var
  SetupTypePage: TInputOptionWizardPage;
  UserInfoPage: TInputQueryWizardPage;
  AdminInfoPage: TInputQueryWizardPage;
  PronounPage: TInputOptionWizardPage;
  IsForSelf: Boolean;

procedure InitializeWizard;
begin
  // Page 1: Who is this for?
  SetupTypePage := CreateInputOptionPage(wpWelcome,
    'Who is this for?',
    'Choose who will be using this website builder.',
    'This installer sets up a workspace where someone can describe websites in plain English and an AI builds them automatically. Who will be using it?',
    True, False);
  SetupTypePage.Add('I''m setting this up for myself');
  SetupTypePage.Add('I''m setting this up for someone else (friend, family member, etc.)');
  SetupTypePage.SelectedValueIndex := 0;

  // Page 2: User info
  UserInfoPage := CreateInputQueryPage(SetupTypePage.ID,
    'User Information',
    'Tell us about the person who will use this workspace.',
    'The AI will use this name when talking to you, and the email is used for your code accounts.');
  UserInfoPage.Add('First name:', False);
  UserInfoPage.Add('Email address:', False);

  // Page 3: Pronouns
  PronounPage := CreateInputOptionPage(UserInfoPage.ID,
    'Pronouns',
    'How should the AI refer to you?',
    'The AI uses pronouns naturally in its instructions. Pick whichever feels right:',
    True, False);
  PronounPage.Add('She / Her');
  PronounPage.Add('He / Him');
  PronounPage.Add('They / Them');
  PronounPage.SelectedValueIndex := 1;

  // Page 4: Admin/helper info (only if setting up for someone else)
  AdminInfoPage := CreateInputQueryPage(PronounPage.ID,
    'Your Information',
    'You''re setting this up for someone else — we need your name too.',
    'If the AI ever gets truly stuck on a hard problem, it will suggest reaching out to you. This is extremely rare — the AI is very persistent and will try many approaches first.');
  AdminInfoPage.Add('Your name (the helper):', False);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if PageID = AdminInfoPage.ID then
  begin
    IsForSelf := (SetupTypePage.SelectedValueIndex = 0);
    Result := IsForSelf;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = UserInfoPage.ID then
  begin
    if Trim(UserInfoPage.Values[0]) = '' then
    begin
      MsgBox('Please enter a first name.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if (Trim(UserInfoPage.Values[1]) = '') or (Pos('@', UserInfoPage.Values[1]) = 0) then
    begin
      MsgBox('Please enter a valid email address.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
  if CurPageID = AdminInfoPage.ID then
  begin
    if (not IsForSelf) and (Trim(AdminInfoPage.Values[0]) = '') then
    begin
      MsgBox('Please enter your name.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

function GetUserName(Param: String): String;
begin Result := Trim(UserInfoPage.Values[0]); end;

function GetUserEmail(Param: String): String;
begin Result := Trim(UserInfoPage.Values[1]); end;

function GetAdminName(Param: String): String;
begin
  if IsForSelf then Result := Trim(UserInfoPage.Values[0])
  else Result := Trim(AdminInfoPage.Values[0]);
end;

function GetPronounSubject(Param: String): String;
begin
  case PronounPage.SelectedValueIndex of
    0: Result := 'She'; 1: Result := 'He'; 2: Result := 'They';
  else Result := 'They'; end;
end;

function GetPronounObject(Param: String): String;
begin
  case PronounPage.SelectedValueIndex of
    0: Result := 'her'; 1: Result := 'him'; 2: Result := 'them';
  else Result := 'them'; end;
end;

function GetPronounPossessive(Param: String): String;
begin
  case PronounPage.SelectedValueIndex of
    0: Result := 'her'; 1: Result := 'his'; 2: Result := 'their';
  else Result := 'their'; end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := 'User:' + NewLine + Space + GetUserName('') + ' (' + GetUserEmail('') + ')' + NewLine + NewLine;
  Result := Result + 'Pronouns:' + NewLine + Space + GetPronounSubject('') + ' / ' + GetPronounObject('') + NewLine + NewLine;
  if not IsForSelf then
    Result := Result + 'Set up by:' + NewLine + Space + GetAdminName('') + NewLine + NewLine;
  Result := Result + 'Install location:' + NewLine + Space + ExpandConstant('{app}') + NewLine + NewLine;
  Result := Result + 'After clicking Install, a setup wizard will open' + NewLine;
  Result := Result + 'to walk you through choosing your AI, installing' + NewLine;
  Result := Result + 'tools, and connecting your accounts.';
end;
