$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot 'private-output'
$stage = Join-Path $projectRoot 'tmp/tencent-scf-package'
New-Item -ItemType Directory -Force -Path $stage, $outputDir | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'backend/tencent-entry.cjs') -Destination (Join-Path $stage 'index.js')
Copy-Item -LiteralPath (Join-Path $projectRoot 'backend/worker.mjs') -Destination (Join-Path $stage 'worker.mjs')
Set-Content -LiteralPath (Join-Path $stage 'package.json') -Encoding utf8 -Value '{"name":"hola-luna-tencent","private":true,"type":"commonjs","engines":{"node":">=20"}}'
$files = @('index.js', 'worker.mjs', 'package.json') | ForEach-Object { Join-Path $stage $_ }
foreach ($file in $files) {
  if ([IO.File]::ReadAllText($file) -match 'sk-(?:kimi-)?[A-Za-z0-9_-]{20,}') {
    throw 'Credential-like value found; package creation stopped.'
  }
}
$archive = Join-Path $outputDir 'hola-luna-tencent.zip'
Compress-Archive -LiteralPath $files -DestinationPath $archive -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
  $names = @($zip.Entries | ForEach-Object FullName | Sort-Object)
  if (($names -join ',') -ne 'index.js,package.json,worker.mjs') { throw 'Unexpected ZIP layout.' }
} finally { $zip.Dispose() }
Write-Output "Ready: $archive"
Write-Output 'ZIP contains only the handler, shared backend and package manifest; no credentials.'
