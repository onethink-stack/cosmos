# Liga o motor de fundo do Caderno Lógico sozinho quando você entra no Windows
# (uma tarefa agendada do seu usuário, sem precisar de administrador). Ele
# roda escondido, com prioridade baixa, e é religado se cair. O registro do
# que ele faz fica em %LOCALAPPDATA%\CadernoLogico\motor-de-fundo.log.
# Também põe na Área de Trabalho o atalho "Caderno Lógico" (liga o motor, se
# precisar, e abre o app) e abre o app no fim.
#
#   powershell -ExecutionPolicy Bypass -File servidor\iniciar-com-o-windows.ps1            (instala e já liga)
#   powershell -ExecutionPolicy Bypass -File servidor\iniciar-com-o-windows.ps1 -Remover   (desfaz)

param([switch]$Remover)

$nome = 'Caderno Logico - motor de fundo'
$projeto = Split-Path -Parent $PSScriptRoot
$endereco = 'https://onethink-stack.github.io/cosmos/#/cadeia'
$atalho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Caderno Lógico.lnk'

# para a tarefa e o motor que estiver ligado (parar só a tarefa deixaria o motor rodando)
function Parar-Motor {
  Stop-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
  $c = Get-NetTCPConnection -LocalPort 47390 -State Listen -ErrorAction SilentlyContinue
  if ($c) {
    $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force; Start-Sleep -Seconds 1 }
  }
}

if ($Remover) {
  Parar-Motor
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $atalho -ErrorAction SilentlyContinue
  Write-Host "Removido: o motor de fundo não liga mais sozinho."
  exit 0
}

$pasta = Join-Path $env:LOCALAPPDATA 'CadernoLogico'
New-Item -ItemType Directory -Force $pasta | Out-Null
$registro = Join-Path $pasta 'motor-de-fundo.log'
Parar-Motor
# o registro recomeça a cada instalação (o motor escreve pouco: uma linha por trabalho)
Remove-Item $registro -ErrorAction SilentlyContinue

# monta o motor e roda sem abrir janela (iniciar-escondido.vbs); a saída vai para o registro.
# Se o motor já estiver ligado (noutra janela), a tarefa só termina, sem erro.
$lancador = Join-Path $PSScriptRoot 'iniciar-escondido.vbs'
$acao = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$lancador`"" -WorkingDirectory $projeto
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config -Force | Out-Null
Start-ScheduledTask -TaskName $nome

# o atalho da Área de Trabalho
$a = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
$a.TargetPath = 'wscript.exe'
$a.Arguments = '"' + (Join-Path $PSScriptRoot 'abrir-caderno.vbs') + '"'
$a.WorkingDirectory = $projeto
$a.IconLocation = Join-Path $PSScriptRoot 'caderno.ico'
$a.Description = 'Abre o Caderno Lógico (e liga o motor de fundo, se precisar)'
$a.Save()

# abre o app (o motor não tem janela: o que aparece é o Caderno, no navegador)
Start-Sleep -Seconds 3
Start-Process $endereco
Write-Host "Pronto: o motor de fundo liga sozinho ao entrar no Windows (e já foi ligado agora)."
Write-Host "Registro: $registro"
Write-Host "Atalho 'Caderno Lógico' na Área de Trabalho: abre o app (e liga o motor, se precisar)."
Write-Host "O motor não tem janela. Para ver se está ligado: http://127.0.0.1:47390"
