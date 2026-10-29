# Mon View: set Mon View as the default app for image extensions (Windows 10).
# Uses Set-FTA from PS-SFTA (MIT, see vendor/SFTA-LICENSE.txt).
# -Pairs "MonView.png=.png;MonView.jpg=.jpg"
param([string]$Pairs)
. (Join-Path $PSScriptRoot 'vendor\SFTA.ps1')
foreach ($pair in $Pairs.Split(';')) {
  if (-not $pair) { continue }
  $prog, $ext = $pair.Split('=')
  try { Set-FTA -ProgId $prog -Extension $ext; Write-Output "OK $ext" }
  catch { Write-Output "ERR $ext $($_.Exception.Message)" }
}
