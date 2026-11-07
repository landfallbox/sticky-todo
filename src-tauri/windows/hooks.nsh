; Custom NSIS installer hooks for Sticky Todo

!macro NSIS_HOOK_PREINSTALL
  ; Clean up legacy / debug development shortcuts (e.g. from early development named "便签 Todo")
  ; and any stale shortcuts on the common (public) desktop to prevent duplicates.
  Delete "$DESKTOP\便签 Todo.lnk"
  Delete "$COMMONDESKTOP\便签 Todo.lnk"
  Delete "$COMMONDESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\便签 Todo.lnk"
  Delete "$COMMONPROGRAMS\便签 Todo.lnk"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\便签 Todo.lnk"
  Delete "$COMMONDESKTOP\便签 Todo.lnk"
  Delete "$COMMONDESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\便签 Todo.lnk"
  Delete "$COMMONPROGRAMS\便签 Todo.lnk"
!macroend
