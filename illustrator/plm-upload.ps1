<#
  plm-upload.ps1 — Austral PLM

  Faz a parte de rede do SubirParaPLM.jsx: upload das imagens no Storage do
  Supabase e gravação das URLs na ficha técnica.

  Autenticação: tenta com a chave pública (anon) primeiro, que é o que o banco
  aceita hoje — assim ninguém precisa digitar senha. Se o Supabase recusar
  (401/403), aí sim pede o e-mail e a senha do PLM e repete a chamada. Ou seja,
  no dia em que o RLS por papel (supabase/004_role_based_rls.sql) entrar em
  vigor, o script continua funcionando, só passa a pedir login.

  Não é para ser rodado à mão — o script do Illustrator chama este arquivo
  passando o job.json que ele acabou de escrever.
#>

param(
  [Parameter(Mandatory = $true)][string]$Job
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null

# O PowerShell 5.1 (o que vem no Windows) ainda negocia TLS 1.0 por padrão e o
# Supabase recusa — sem isto, todo request morre com "conexão encerrada".
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$BUCKET = 'fichas-imagens'
$PASTA_TOKEN = Join-Path $env:APPDATA 'AustralPLM'
$ARQUIVO_TOKEN = Join-Path $PASTA_TOKEN 'plm-refresh-token.dat'

# Definido assim que o job é lido; até lá só sai no console.
$LOG = $null

function Escrever($texto, $cor = 'Gray') {
  Write-Host $texto -ForegroundColor $cor
  if ($script:LOG) {
    $carimbo = (Get-Date).ToString('HH:mm:ss')
    Add-Content -LiteralPath $script:LOG -Value "$carimbo  $texto" -Encoding UTF8 -ErrorAction SilentlyContinue
  }
}

function Finalizar($titulo, $texto, $icone) {
  if ($script:LOG) {
    Add-Content -LiteralPath $script:LOG -Value "---- $icone ----`r`n$texto" -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($icone -ne 'Information') { $texto = "$texto`n`nDetalhes em:`n$script:LOG" }
  }
  [System.Windows.Forms.MessageBox]::Show($texto, $titulo, 'OK', $icone) | Out-Null
  if ($icone -eq 'Information') { exit 0 } else { exit 1 }
}

# O Storage recusa chave com acento ou caractere especial — mesma normalização
# de sanitizePath() em lib/storage.ts.
function Limpar-Caminho([string]$caminho) {
  $partes = $caminho -split '/' | ForEach-Object {
    $semAcento = ($_.Normalize([Text.NormalizationForm]::FormD).ToCharArray() |
      Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' }) -join ''
    $limpo = $semAcento -replace '[^A-Za-z0-9._-]', '_' -replace '_+', '_'
    $limpo.Trim('_')
  }
  ($partes | Where-Object { $_ }) -join '/'
}

# ─── Configuração ────────────────────────────────────────────────────────────

if (-not (Test-Path -LiteralPath $Job)) { Finalizar 'PLM' "Nao achei o job:`n$Job" 'Error' }
# Não reaproveitar o nome $Job: o param é [string] e o PowerShell converteria o
# objeto do ConvertFrom-Json em texto na atribuição (e tudo viraria nulo).
$tarefa = Get-Content -LiteralPath $Job -Raw -Encoding UTF8 | ConvertFrom-Json

# Cada envio tem a própria pasta (o .jsx cria uma por execução); o log vive nela
# e só é apagado junto quando dá tudo certo.
$PASTA_ENVIO = Split-Path -Parent $Job
$LOG = Join-Path $PASTA_ENVIO 'envio.log'
Set-Content -LiteralPath $LOG -Value "==== $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss') ====" -Encoding UTF8 -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath $tarefa.config)) { Finalizar 'PLM' "Nao achei o plm-config.json:`n$($tarefa.config)" 'Error' }
$cfg = Get-Content -LiteralPath $tarefa.config -Raw -Encoding UTF8 | ConvertFrom-Json

# Aguenta um endereço colado com o caminho da API (já vimos .env.local assim).
$BASE = ($cfg.supabaseUrl -replace '/(rest|auth|storage)/v1/?$', '').TrimEnd('/')
$APIKEY = $cfg.anonKey

# Sem isto, um endereço errado só aparecia como "o nome remoto nao pode ser
# resolvido" na hora de subir a imagem, sem dizer onde consertar.
if ($BASE -notmatch '^https?://[^\s/]+\.[^\s/]+' -or $APIKEY -notmatch '^ey[A-Za-z0-9_-]' -or $APIKEY.Length -lt 100) {
  Finalizar 'PLM' ("A instalacao esta com endereco ou chave invalidos.`n`n" +
    "endereco: $BASE`n" +
    "arquivo:  $($tarefa.config)`n`n" +
    'Rode o instalador de novo (INSTALAR .bat como administrador) — ele agora recusa valor invalido.') 'Error'
}

$ref = $tarefa.ref
$itens = @($tarefa.itens)   # @() para 1 item não virar objeto solto sem .Count
Escrever ''
Escrever '  AUSTRAL PLM — subindo do Illustrator' 'Cyan'
Escrever "  REF $ref — $($itens.Count) imagem(ns)" 'Cyan'
Escrever ''

# ─── Autenticação sob demanda ────────────────────────────────────────────────
# O refresh token fica guardado com DPAPI: só o usuário do Windows que salvou
# consegue ler de volta. A senha em si nunca é gravada.

$TOKEN = $APIKEY   # começa com a chave pública

function Salvar-RefreshToken([string]$token) {
  if (-not (Test-Path -LiteralPath $PASTA_TOKEN)) { New-Item -ItemType Directory -Path $PASTA_TOKEN | Out-Null }
  ConvertTo-SecureString -String $token -AsPlainText -Force |
    ConvertFrom-SecureString |
    Set-Content -LiteralPath $ARQUIVO_TOKEN -Encoding UTF8
}

function Ler-RefreshToken {
  if (-not (Test-Path -LiteralPath $ARQUIVO_TOKEN)) { return $null }
  try {
    $seguro = Get-Content -LiteralPath $ARQUIVO_TOKEN -Raw | ConvertTo-SecureString
    return [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))
  } catch { return $null }
}

function Escalar-Login {
  $cabecalho = @{ apikey = $APIKEY; 'Content-Type' = 'application/json' }

  # Renova a sessão anterior, se houver, sem incomodar o usuário.
  $refresh = Ler-RefreshToken
  if ($refresh) {
    try {
      $r = Invoke-RestMethod -Uri "$BASE/auth/v1/token?grant_type=refresh_token" -Method Post `
             -Headers $cabecalho -Body (@{ refresh_token = $refresh } | ConvertTo-Json)
      Salvar-RefreshToken $r.refresh_token
      Escrever "  Sessao renovada: $($r.user.email)" 'DarkGray'
      return $r.access_token
    } catch {
      Escrever '  Sessao expirada.' 'Yellow'
    }
  }

  Escrever ''
  Escrever '  O PLM pediu login para gravar.' 'Yellow'
  for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
    $cred = Get-Credential -Message 'Entre com seu e-mail e senha do Austral PLM'
    if (-not $cred) { Finalizar 'PLM' 'Envio cancelado — sem login.' 'Warning' }
    $corpo = @{ email = $cred.UserName; password = $cred.GetNetworkCredential().Password } | ConvertTo-Json
    try {
      $r = Invoke-RestMethod -Uri "$BASE/auth/v1/token?grant_type=password" -Method Post `
             -Headers $cabecalho -Body $corpo
      Salvar-RefreshToken $r.refresh_token
      Escrever "  Conectado como $($r.user.email)" 'Green'
      return $r.access_token
    } catch {
      Escrever "  Login recusado ($tentativa/3). Confira o e-mail e a senha." 'Red'
    }
  }
  Finalizar 'PLM' "Nao consegui autenticar.`n`nSe voce entra no PLM so pelo link do e-mail, defina uma senha (PLM > entrar > esqueci minha senha) e tente de novo." 'Error'
}

# Chama a API; se vier 401/403, faz login uma vez e repete a mesma chamada.
function Chamar-PLM {
  param(
    [string]$Uri,
    [string]$Metodo = 'Get',
    [string]$Corpo,
    [string]$InFile,
    [string]$TipoConteudo,
    [hashtable]$Extra
  )

  for ($volta = 1; $volta -le 2; $volta++) {
    $h = @{ apikey = $APIKEY; Authorization = "Bearer $script:TOKEN" }
    if ($Extra) { $h += $Extra }

    # Nada de -SkipHttpErrorCheck: não existe no PowerShell 5.1, então o erro
    # de HTTP vem como exceção e o código sai de $_.Exception.Response.
    $par = @{ Uri = $Uri; Method = $Metodo; Headers = $h; UseBasicParsing = $true }
    if ($Corpo)        { $par.Body = $Corpo }
    if ($InFile)       { $par.InFile = $InFile }
    if ($TipoConteudo) { $par.ContentType = $TipoConteudo }

    try {
      $r = Invoke-WebRequest @par
      if ($r.Content) { return ($r.Content | ConvertFrom-Json) }
      return $null
    } catch {
      $codigo = 0
      if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
      if (($codigo -eq 401 -or $codigo -eq 403) -and $volta -eq 1) {
        $script:TOKEN = Escalar-Login
        continue
      }
      $detalhe = $_.ErrorDetails.Message
      if (-not $codigo) { throw $_.Exception.Message }
      throw ("HTTP $codigo " + $detalhe).Trim()
    }
  }
}

# ─── Acha a ficha da REF ─────────────────────────────────────────────────────

$refUrl = [uri]::EscapeDataString($ref)
try {
  $fichas = @(Chamar-PLM -Uri "$BASE/rest/v1/fichas_tecnicas?produto_ref=eq.$refUrl&select=id,colecao,estamparia&order=ordem.asc,id.asc")
} catch {
  Finalizar 'PLM' "Erro ao consultar a ficha da REF $ref`:`n$($_.Exception.Message)" 'Error'
}

if ($fichas.Count -eq 0) {
  Finalizar 'PLM' "A REF $ref ainda nao tem ficha tecnica salva no PLM.`n`nAbrir a ficha na tela nao basta: ela so passa a existir depois de salva`numa vez. Abra a REF no PLM, clique em Salvar e rode o script de novo." 'Error'
}

$ficha = $fichas[0]
# Só referência "clássico" tem temporada (uma ficha por coleção). Nas outras a
# ficha vem com colecao vazia — aí não faz sentido perguntar nada, mesmo que o
# banco tenha mais de uma linha (duplicata de salvamento).
$comTemporada = @($fichas | Where-Object { $_.colecao })
if ($comTemporada.Count -gt 1) {
  Escrever ''
  Escrever "  A REF $ref tem mais de uma temporada:" 'Yellow'
  for ($i = 0; $i -lt $comTemporada.Count; $i++) {
    Escrever ('   [{0}] {1}' -f ($i + 1), $comTemporada[$i].colecao)
  }
  do {
    $escolha = Read-Host '  Numero da temporada'
  } until ($escolha -as [int] -and [int]$escolha -ge 1 -and [int]$escolha -le $comTemporada.Count)
  $ficha = $comTemporada[[int]$escolha - 1]
} elseif ($comTemporada.Count -eq 1) {
  $ficha = $comTemporada[0]
} else {
  # Sem temporada: usa a ficha mais recente da REF, igual o app faz.
  $ficha = @($fichas | Sort-Object id)[-1]
  if ($fichas.Count -gt 1) {
    Escrever "  Atencao: a REF $ref tem $($fichas.Count) fichas sem temporada (duplicadas no banco)." 'Yellow'
    Escrever "  Usando a mais recente (#$($ficha.id)), que e a que o PLM abre." 'Yellow'
  }
}

$temporada = if ($ficha.colecao) { " / $($ficha.colecao)" } else { '' }
Escrever "  Ficha #$($ficha.id)$temporada" 'DarkGray'
Escrever ''

# ─── Upload das imagens ──────────────────────────────────────────────────────
# Caminhos iguais aos que o app usa em FichaModal.tsx, para as imagens da REF
# ficarem todas sob o mesmo prefixo no bucket.

function Caminho-Storage([string]$destino) {
  $p = $destino -split ':'
  switch ($p[0]) {
    'col' { return "$ref/$($p[1])" }
    'est' {
      switch ($p[1]) {
        'arte'  { return "$ref/estamparia/arte_$($p[2])" }
        'local' { return "$ref/estamparia/local_$($p[2])" }
        'sim'   { return "$ref/estamparia/sim_$($p[2])" }
      }
    }
  }
  return "$ref/$($destino -replace '[^A-Za-z0-9]','_')"
}

$enviados = @()
$erros = @()

foreach ($item in $itens) {
  $rotulo = $item.label
  if (-not (Test-Path -LiteralPath $item.arquivo)) {
    $erros += "$rotulo`: PNG nao encontrado"
    continue
  }
  $marca = [int64]([datetime]::UtcNow - [datetime]'1970-01-01').TotalMilliseconds
  $caminho = (Limpar-Caminho (Caminho-Storage $item.destino)) + "/$marca.png"
  Escrever "  -> $($item.arquivo) ($((Get-Item -LiteralPath $item.arquivo).Length) bytes) para $caminho" 'DarkGray'
  try {
    Chamar-PLM -Uri "$BASE/storage/v1/object/$BUCKET/$caminho" -Metodo Post `
      -InFile $item.arquivo -TipoConteudo 'image/png' -Extra @{ 'x-upsert' = 'true' } | Out-Null
    $enviados += [pscustomobject]@{
      destino = $item.destino
      label   = $rotulo
      url     = "$BASE/storage/v1/object/public/$BUCKET/$caminho"
    }
    Escrever "  OK   $rotulo" 'Green'
  } catch {
    $erros += "$rotulo`: $($_.Exception.Message)"
    Escrever "  ERRO $rotulo" 'Red'
  }
}

if ($enviados.Count -eq 0) {
  Finalizar 'PLM' ("Nenhuma imagem subiu.`n`n" + ($erros -join "`n")) 'Error'
}

# ─── Grava as URLs na ficha ──────────────────────────────────────────────────

$cabJson = @{ 'Content-Type' = 'application/json'; Prefer = 'return=minimal' }

# Colunas simples de fichas_tecnicas: um PATCH só.
$colunas = @{}
foreach ($e in $enviados) {
  if ($e.destino -like 'col:*') { $colunas[($e.destino -split ':')[1]] = $e.url }
}
if ($colunas.Count -gt 0) {
  try {
    Chamar-PLM -Uri "$BASE/rest/v1/fichas_tecnicas?id=eq.$($ficha.id)" -Metodo Patch `
      -Corpo ($colunas | ConvertTo-Json) -Extra $cabJson | Out-Null
  } catch {
    $erros += "Gravar campos da ficha: $($_.Exception.Message)"
  }
}

# Estamparia é um JSONB: lê, mescla e devolve inteiro.
$deEstamparia = @($enviados | Where-Object { $_.destino -like 'est:*' })
if ($deEstamparia.Count -gt 0) {
  $est = $ficha.estamparia
  if (-not $est) {
    $est = [pscustomobject]@{ artes = @(); tecnicas = @(); simulacoes = [pscustomobject]@{}; observacoes = '' }
  }
  if (-not $est.PSObject.Properties['artes'])      { $est | Add-Member artes @() -Force }
  if (-not $est.PSObject.Properties['simulacoes']) { $est | Add-Member simulacoes ([pscustomobject]@{}) -Force }

  foreach ($e in $deEstamparia) {
    $p = $e.destino -split ':'
    if ($p[1] -eq 'sim') {
      $vk = $p[2]
      if (-not $est.simulacoes.PSObject.Properties[$vk]) {
        $est.simulacoes | Add-Member $vk ([pscustomobject]@{ nome = ''; imgSim = ''; imgFoto = ''; status = '' }) -Force
      }
      $est.simulacoes.$vk | Add-Member imgSim $e.url -Force
    } else {
      $posicao = $p[2]
      $campo = if ($p[1] -eq 'arte') { 'imagem' } else { 'imagemLocal' }
      $arte = @($est.artes) | Where-Object { $_.posicao -eq $posicao } | Select-Object -First 1
      if (-not $arte) {
        $arte = [pscustomobject]@{ posicao = $posicao; imagem = ''; largura = ''; localizacao = '' }
        $est.artes = @($est.artes) + $arte
      }
      $arte | Add-Member $campo $e.url -Force
    }
  }

  try {
    Chamar-PLM -Uri "$BASE/rest/v1/fichas_tecnicas?id=eq.$($ficha.id)" -Metodo Patch `
      -Corpo (@{ estamparia = $est } | ConvertTo-Json -Depth 25) -Extra $cabJson | Out-Null
  } catch {
    $erros += "Gravar estamparia: $($_.Exception.Message)"
  }
}

# ─── Resultado ───────────────────────────────────────────────────────────────

$linhas = @("REF $ref$temporada", '')
foreach ($e in $enviados) { $linhas += "OK   $($e.label)" }
if ($erros.Count -gt 0) {
  $linhas += ''
  $linhas += 'Problemas:'
  foreach ($x in $erros) { $linhas += " - $x" }
}
$linhas += ''
$linhas += 'Abra a ficha no PLM para conferir.'

$icone = if ($erros.Count -gt 0) { 'Warning' } else { 'Information' }

# Só limpa a pasta do envio quando deu tudo certo. Com qualquer problema, os
# PNGs e o envio.log ficam lá para dar para investigar depois.
if ($erros.Count -eq 0) {
  Escrever ''
  Escrever "  Limpando $PASTA_ENVIO" 'DarkGray'
  $LOG = $null
  Remove-Item -LiteralPath $PASTA_ENVIO -Recurse -Force -ErrorAction SilentlyContinue
}

Finalizar 'Austral PLM' ($linhas -join "`n") $icone
