param(
  [string]$Target,
  [switch]$Force
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir 'install-openclaw-plugin.mjs'

$args = @($nodeScript)
if ($Target) {
  $args += '--target'
  $args += $Target
}
if ($Force) {
  $args += '--force'
}

node @args
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
