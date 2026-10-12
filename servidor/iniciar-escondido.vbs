' Liga o motor de fundo do Caderno Logico sem abrir janela nenhuma (usado pela
' tarefa do Windows criada por iniciar-com-o-windows.ps1). Espera o motor
' terminar e devolve o codigo de saida dele: se ele cair, o Windows o religa.
Set fs = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fs.GetParentFolderName(fs.GetParentFolderName(WScript.ScriptFullName))
WScript.Quit sh.Run("cmd /c npm run motor >> ""%LOCALAPPDATA%\CadernoLogico\motor-de-fundo.log"" 2>&1", 0, True)
