<#
  Instalar-PLM.ps1 — Austral PLM

  Instala a automação do Illustrator na máquina: copia os scripts para a pasta
  de Scripts de todas as versões do Illustrator encontradas e escreve o
  plm-config.json com o endereço do Supabase.

  Precisa rodar como Administrador (a pasta do Illustrator fica em Program Files).

  Uso (na pasta onde estão os scripts):
      .\Instalar-PLM.ps1
      .\Instalar-PLM.ps1 -SupabaseUrl "https://xxx.supabase.co" -AnonKey "eyJ..."
#>

param(
  [string]$SupabaseUrl,
  [string]$AnonKey
)

$ErrorActionPreference = 'Stop'
$origem = Split-Path -Parent $MyInvocation.MyCommand.Path
$ARQUIVOS = @('SubirParaPLM.jsx', 'CriarModeloPLM.jsx', 'plm-upload.ps1')

function Titulo($t) { Write-Host ''; Write-Host "  $t" -ForegroundColor Cyan }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host ''
  Write-Host '  Abra o PowerShell como Administrador e rode de novo.' -ForegroundColor Red
  Write-Host '  (a pasta de Scripts do Illustrator fica em Program Files)' -ForegroundColor DarkGray
  Write-Host ''
  exit 1
}

Titulo 'AUSTRAL PLM — automação do Illustrator'

foreach ($a in $ARQUIVOS) {
  if (-not (Test-Path -LiteralPath (Join-Path $origem $a))) {
    Write-Host "  Falta o arquivo $a nesta pasta." -ForegroundColor Red
    exit 1
  }
}

# ─── Configuração do Supabase ────────────────────────────────────────────────
# Ordem: parâmetro > plm-config.json que já veio nesta pasta > .env.local do
# repositório > perguntar. O plm-config.json vem antes de tudo porque é o caso
# normal do rollout: a pasta é distribuída pronta e ninguém digita nada.

function Endereco-Valido([string]$v) { return $v -match '^https?://[^\s/]+\.[^\s/]+' }
function Chave-Valida([string]$v)    { return $v -match '^ey[A-Za-z0-9_-]' -and $v.Length -ge 100 }

if (-not $SupabaseUrl -or -not $AnonKey) {
  $pronto = Join-Path $origem 'plm-config.json'
  if (Test-Path -LiteralPath $pronto) {
    try {
      $c = Get-Content -LiteralPath $pronto -Raw -Encoding UTF8 | ConvertFrom-Json
      if (-not $SupabaseUrl -and (Endereco-Valido $c.supabaseUrl)) { $SupabaseUrl = $c.supabaseUrl }
      if (-not $AnonKey     -and (Chave-Valida   $c.anonKey))      { $AnonKey     = $c.anonKey }
      if ($SupabaseUrl -and $AnonKey) {
        Write-Host '  Usando o plm-config.json que veio nesta pasta.' -ForegroundColor DarkGray
      }
    } catch {
      Write-Host '  plm-config.json desta pasta esta ilegivel — vou perguntar.' -ForegroundColor Yellow
    }
  }
}

if (-not $SupabaseUrl -or -not $AnonKey) {
  $env_local = Join-Path (Split-Path -Parent $origem) '.env.local'
  if (Test-Path -LiteralPath $env_local) {
    Write-Host "  Lendo as chaves de $env_local" -ForegroundColor DarkGray
    foreach ($linha in Get-Content -LiteralPath $env_local) {
      if ($linha -match '^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+?)\s*$'      -and -not $SupabaseUrl) { $SupabaseUrl = $Matches[1] }
      if ($linha -match '^\s*NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.+?)\s*$' -and -not $AnonKey)     { $AnonKey = $Matches[1] }
    }
  }
}

# Valida antes de gravar: já aconteceu de o instalador guardar "sim" como
# endereço, e o erro só aparecia depois, ao subir a primeira imagem.
for ($t = 1; $t -le 3 -and -not (Endereco-Valido $SupabaseUrl); $t++) {
  if ($SupabaseUrl) { Write-Host "  '$SupabaseUrl' nao e um endereco. Tem que comecar com https://" -ForegroundColor Red }
  $SupabaseUrl = Read-Host '  Endereço do Supabase (https://xxx.supabase.co)'
}
for ($t = 1; $t -le 3 -and -not (Chave-Valida $AnonKey); $t++) {
  if ($AnonKey) { Write-Host '  Isso nao parece a chave anon (comeca com "eyJ" e tem centenas de caracteres).' -ForegroundColor Red }
  $AnonKey = Read-Host '  Chave anon (NEXT_PUBLIC_SUPABASE_ANON_KEY)'
}
if (-not (Endereco-Valido $SupabaseUrl) -or -not (Chave-Valida $AnonKey)) {
  Write-Host ''
  Write-Host '  Endereco ou chave invalidos — nao instalei nada.' -ForegroundColor Red
  Write-Host '  Pegue os dois em: Supabase > Project Settings > API' -ForegroundColor DarkGray
  exit 1
}

# Guarda só a raiz do projeto: o .env.local do PLM já apareceu com o caminho da
# API colado no fim ("...supabase.co/rest/v1/"), o que quebraria todo request.
$raizSupabase = ($SupabaseUrl -replace '/(rest|auth|storage)/v1/?$', '').TrimEnd('/')

$config = [pscustomobject]@{
  supabaseUrl = $raizSupabase
  anonKey     = $AnonKey
} | ConvertTo-Json

# ─── Acha as pastas de Scripts do Illustrator ────────────────────────────────

$destinos = @()
foreach ($raiz in @("$env:ProgramFiles\Adobe", "${env:ProgramFiles(x86)}\Adobe")) {
  if (-not (Test-Path -LiteralPath $raiz)) { continue }
  $destinos += Get-ChildItem -Path $raiz -Directory -Filter 'Adobe Illustrator*' -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ChildItem -Path (Join-Path $_.FullName 'Presets') -Directory -ErrorAction SilentlyContinue } |
    ForEach-Object { Join-Path $_.FullName 'Scripts' } |
    Where-Object { Test-Path -LiteralPath $_ }
}
$destinos = $destinos | Select-Object -Unique

if ($destinos.Count -eq 0) {
  Write-Host '  Não achei nenhuma instalação do Illustrator nesta máquina.' -ForegroundColor Red
  exit 1
}

# ─── Copia ───────────────────────────────────────────────────────────────────

Titulo 'Instalando'
foreach ($d in $destinos) {
  foreach ($a in $ARQUIVOS) {
    Copy-Item -LiteralPath (Join-Path $origem $a) -Destination $d -Force
  }
  Set-Content -LiteralPath (Join-Path $d 'plm-config.json') -Value $config -Encoding UTF8
  Write-Host "  OK  $d" -ForegroundColor Green
}

Titulo 'Pronto'
Write-Host '  No Illustrator: Arquivo > Scripts > SubirParaPLM' -ForegroundColor Gray
Write-Host '  (se o Illustrator estava aberto, feche e abra de novo)' -ForegroundColor DarkGray
Write-Host ''
Write-Host "  Endereço gravado: $raizSupabase" -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Na primeira vez que subir algo, pede o e-mail e a senha do PLM.' -ForegroundColor Gray
Write-Host '  Depois a sessão fica guardada nesta máquina e não pergunta mais.' -ForegroundColor Gray
Write-Host ''
