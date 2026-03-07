' start-silent.vbs — Launch server without any visible window
' Double-click this file to start the server in the background.
' Use stop-server.bat to stop it, view-logs.bat to see logs.

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script lives
strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Run start-background.js with hidden window
objShell.CurrentDirectory = strDir
objShell.Run "node start-background.js", 0, False
