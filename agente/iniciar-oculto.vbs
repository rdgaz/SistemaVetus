' Inicia o AutoLaudoVet Transferencia sem janela.
'   wscript iniciar-oculto.vbs          -> so inicia (inicio automatico do Windows)
'   wscript iniciar-oculto.vbs /painel  -> inicia (se nao estiver rodando) e abre o painel no navegador
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)

' porta do painel, lida do config.bat
porta = "2346"
Set f = fso.OpenTextFile(pasta & "\config.bat", 1)
Do Until f.AtEndOfStream
  linha = Trim(f.ReadLine)
  p = InStr(1, linha, "PAINEL_PORTA=", 1)
  If p > 0 And LCase(Left(linha, 3)) = "set" Then porta = Replace(Mid(linha, p + 13), """", "")
Loop
f.Close

sh.Run """" & pasta & "\iniciar.bat""", 0, False

If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "/painel" Then
    WScript.Sleep 2500
    sh.Run "http://127.0.0.1:" & Trim(porta)
  End If
End If
