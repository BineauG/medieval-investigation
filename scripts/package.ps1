$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$OutputDirectory = Join-Path $ProjectRoot 'outputs'
$Manifest = Get-Content -Raw (Join-Path $ProjectRoot 'module.json') | ConvertFrom-Json
$ZipPath = Join-Path $OutputDirectory 'module.zip'
$VersionedZipPath = Join-Path $OutputDirectory "medieval-investigation-toolkit-$($Manifest.version).zip"
$ResolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$ResolvedProject = [System.IO.Path]::GetFullPath($ProjectRoot)
if (-not $ResolvedOutput.StartsWith($ResolvedProject, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Packaging output is outside the project.'
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$RuntimeEntries = @(
  'assets',
  'languages',
  'scripts',
  'styles',
  'templates',
  'CHANGELOG.md',
  'LICENSE',
  'module.json',
  'README.md',
  'THIRD_PARTY_NOTICES.md'
)
$Files = foreach ($Entry in $RuntimeEntries) {
  $Path = Join-Path $ProjectRoot $Entry
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Packaging entry is missing: $Entry"
  }
  Get-Item -LiteralPath $Path
}
Compress-Archive -Path $Files.FullName -DestinationPath $ZipPath -Force
Copy-Item -LiteralPath $ZipPath -Destination $VersionedZipPath -Force
Write-Output $ZipPath
Write-Output $VersionedZipPath
