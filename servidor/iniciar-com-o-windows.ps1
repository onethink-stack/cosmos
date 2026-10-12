# Liga o motor de fundo do Caderno Lógico sozinho quando você entra no Windows
# (uma tarefa agendada do seu usuário, sem precisar de administrador). Ele
# roda escondido, com prioridade baixa, e é religado se cair. O registro do
# que ele faz fica em %LOCALAPPDATA%\CadernoLogico\motor-de-fundo.log.
#
#   powershell -ExecutionPolicy Bypass -File servidor\iniciar-com-o-windows.ps1            (instala e já liga)
#   powershell -ExecutionPolicy Bypass -File servidor\iniciar-com-o-windows.ps1 -Remover   (desfaz)

param([switch]$Remover)

$nome = 'Caderno Logico - motor de fundo'
$projeto = Split-Path -Parent $PSScriptRoot

if ($Remover) {
  Stop-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removido: o motor de fundo não liga mais sozinho."
  exit 0
}

$pasta = Join-Path $env:LOCALAPPDATA 'CadernoLogico'
New-Item -ItemType Directory -Force $pasta | Out-Null
$registro = Join-Path $pasta 'motor-de-fundo.log'

# monta o motor e roda; a saída vai para o registro
$comando = "Set-Location -LiteralPath '$projeto'; npm run motor *>> '$registro'"
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$comando`""
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config -Force | Out-Null
Start-ScheduledTask -TaskName $nome
Write-Host "Pronto: o motor de fundo liga sozinho ao entrar no Windows (e já foi ligado agora)."
Write-Host "Registro: $registro"
