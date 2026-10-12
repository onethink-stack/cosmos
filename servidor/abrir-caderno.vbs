' Atalho "Caderno Logico" da Area de Trabalho: liga o motor de fundo, se ele
' nao estiver respondendo, e abre o Caderno Logico no navegador.
Set sh = CreateObject("WScript.Shell")
ligado = False
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.setTimeouts 1000, 1000, 2000, 2000
http.open "GET", "http://127.0.0.1:47390/estado", False
http.send
If Err.Number = 0 Then
  If http.status = 200 Then ligado = True
End If
Err.Clear
On Error GoTo 0
If Not ligado Then sh.Run "schtasks /run /tn ""Caderno Logico - motor de fundo""", 0, True
sh.Run "https://onethink-stack.github.io/cosmos/#/cadeia"
