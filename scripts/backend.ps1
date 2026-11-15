param([ValidateSet('install','build','dev','migrate','seed','worker','test')][string]$Task = 'dev')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$portableNode = Join-Path $projectRoot '.tools\node-v22.14.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $portableNode 'node.exe')) { $env:PATH = $portableNode + ';' + $env:PATH }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Cần Node.js 22.14+ và npm, hoặc runtime portable trong .tools.' }
Push-Location (Join-Path $projectRoot 'backend')
try {
  switch ($Task) {
    'install' { & npm.cmd ci }
    'build' { & npm.cmd run build }
    'dev' { & npm.cmd run start:dev }
    'migrate' { & npm.cmd run db:migrate }
    'seed' { & npm.cmd run db:seed }
    'worker' { & npm.cmd run worker }
    'test' { & npm.cmd test }
  }
  if ($LASTEXITCODE -ne 0) { throw "Backend task '$Task' failed ($LASTEXITCODE)." }
} finally { Pop-Location }
