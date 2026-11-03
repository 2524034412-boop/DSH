param(
  [string]$DshHome = '',
  [string]$ProfileDir = '',
  [string]$NodePath = '',
  [switch]$Purge
)

# 星图开机 · 卸载脚本
#
# 只删「加载声明」，不删插件目录（除非加了 -Purge）。
# 删之前会备份清单，出问题可以原样放回去。

$ErrorActionPreference = 'Stop'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) { Write-Host "`n× $text" -ForegroundColor Red; exit 1 }

Say '星图开机 · 卸载' 'Cyan'
Say '----------------'

if ([string]::IsNullOrWhiteSpace($DshHome)) {
  if ($env:DSH_HOME) { $DshHome = $env:DSH_HOME } else { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
}

if ([string]::IsNullOrWhiteSpace($ProfileDir)) {
  $desktop = Join-Path $DshHome 'profiles\desktop'
  if (Test-Path (Join-Path $desktop 'package.json')) {
    $ProfileDir = $desktop
  } else {
    $candidate = Get-ChildItem (Join-Path $DshHome 'profiles') -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } |
      Select-Object -First 1
    if ($candidate) { $ProfileDir = $candidate.FullName }
  }
}
$manifest = Join-Path $ProfileDir 'package.json'
if (-not (Test-Path $manifest)) { Fail "找不到 profile 清单：$manifest" }

$node = $null
if (-not [string]::IsNullOrWhiteSpace($NodePath)) { $node = $NodePath }
if (-not $node) {
  $runtimeNode = Get-ChildItem (Join-Path $DshHome 'dsh-runtimes') -Recurse -Filter 'node.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($runtimeNode) { $node = $runtimeNode.FullName }
}
if (-not $node) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { $node = $cmd.Source }
}
if (-not $node) { Fail '找不到 node.exe。' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $manifest "$manifest.bak-unstar-$stamp" -Force
Say "已备份清单  package.json.bak-unstar-$stamp"

& $node (Join-Path $PSScriptRoot 'patch.cjs') remove $manifest
if ($LASTEXITCODE -ne 0) { Fail '清单写入后校验失败（有孤儿 bundle），已中止。请把备份放回去。' }

$link = Join-Path $ProfileDir 'node_modules\dsh-star-boot'
if (Test-Path $link) {
  (Get-Item $link).Delete()
  Say '已移除链接  node_modules\dsh-star-boot'
}

if ($Purge) {
  $target = Join-Path $DshHome 'plugins\dsh-star-boot'
  if (Test-Path $target) { Remove-Item $target -Recurse -Force; Say "已删除目录  $target" }
}

Say ''
Say '卸载完成，重启 DSH 生效。' 'Green'
if (-not $Purge) { Say '插件目录保留着，想装回来再跑一次安装脚本即可。' }
