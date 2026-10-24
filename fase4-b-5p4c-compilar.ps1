[CmdletBinding()]
param([switch]$ExecutarBuild)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$raizCosmos = $PSScriptRoot
Push-Location -LiteralPath $raizCosmos
$autoInstallAnterior = $env:RUSTUP_AUTO_INSTALL
try {
    $env:RUSTUP_AUTO_INSTALL = '0'
    $headCosmos = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $headCosmos -ne 'fde305b5106c23f0e4a24cb419ebb19371a89c2d') {
        throw 'HEAD diferente da base preparada; revisar a selecao antes de compilar.'
    }
    $pinsCosmos = @{
        'fase4-b-5p4c/entrada.bin' = 'affa7efa353813570254cfa98cab972e84889843f0cd7348962b3e76ee4813c1'
        'fase4-b-5p4c/host/kernel.wgsl' = '31a3c66e68dcbf6401a55fd0f2736d0aadcd1f00f3b5a8d997f8d12dacb53e22'
        'fase4-b-5p4c/host/Cargo.lock' = '9fab7f9f7917878da0adffb178bfc1145937a20b2e565cbbbb8f627cb03c7e82'
    }
    foreach ($arquivoCosmos in $pinsCosmos.Keys) {
        $observadoCosmos = (Get-FileHash -LiteralPath $arquivoCosmos -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($observadoCosmos -ne $pinsCosmos[$arquivoCosmos]) { throw "Pin divergente: $arquivoCosmos" }
    }
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue) -or -not (Get-Command rustc -ErrorAction SilentlyContinue)) {
        throw 'Rust/Cargo indisponiveis. Nenhuma instalacao automatica sera feita.'
    }
    $cargoCosmos = & cargo '+1.99.1' --version
    if ($LASTEXITCODE -ne 0 -or $cargoCosmos -notmatch '^cargo 1\.99\.1\s') { throw 'Cargo diferente de 1.99.1.' }
    $rustCosmos = & rustc '+1.99.1' --version
    if ($LASTEXITCODE -ne 0 -or $rustCosmos -notmatch '^rustc 1\.99\.1\s') { throw 'Rustc diferente de 1.99.1.' }
    if (-not $ExecutarBuild) { Write-Output 'Preflight OK; compilacao nao solicitada.'; return }
    Push-Location -LiteralPath 'fase4-b-5p4c/host'
    try {
        # Sem downloads implicitos. Usa apenas toolchain/crates ja disponiveis.
        & cargo '+1.99.1' test --release --locked --offline --target x86_64-pc-windows-gnu
        if ($LASTEXITCODE -ne 0) { throw 'Naga/testes nao aprovados; nao prosseguir.' }
        & cargo '+1.99.1' build --release --locked --offline --target x86_64-pc-windows-gnu
        if ($LASTEXITCODE -ne 0) { throw 'Build falhou.' }
        $exeCosmos = 'target/x86_64-pc-windows-gnu/release/cosmos-b-gpu-host.exe'
        Get-FileHash -LiteralPath $exeCosmos -Algorithm SHA256 | Select-Object Hash,Path
        Write-Output 'Build apenas. Sem execucao GPU, alteracao de manifesto ou publicacao.'
    } finally { Pop-Location }
} finally {
    $env:RUSTUP_AUTO_INSTALL = $autoInstallAnterior
    Pop-Location
}
