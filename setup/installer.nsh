!include "x64.nsh"
!macro customInstall
  ${IfNot} ${Silent}
  ${AndIfNot} ${isUpdated}
    DetailPrint "Checking offline prerequisites..."
    ${DisableX64FSRedirection}
    ExecWait '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\setup\Prerequisites.ps1"' $0
    ${EnableX64FSRedirection}
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONINFORMATION "KubeLab installed. Prerequisite setup was not completed. You can retry with the System setup button in KubeLab."
    ${EndIf}
  ${EndIf}
!macroend
