param(
  [string]$DshHome = '',
  [string]$ProfileDir = '',
  [string]$NodePath = ''
)

# 星图开机 · 安装脚本
#
# 做四件事，任何一步失败都会说清楚原因，绝不半途留下一个「声明了却装不起来」的
# profile（那会让 DSH 下次启动直接打不开窗口）：
#   1. 找 DSH 数据目录和 profile
#   2. 把插件拷到 <DSH_HOME>\plugins\dsh-star-boot
#   3. 在 profile 的 package.json 里加 dependency + bundles 两处声明
#   4. 建 node_modules 链接，并校验没有孤儿 bundle

$ErrorActionPreference = 'Stop'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) { Write-Host "`n× $text" -ForegroundColor Red; exit 1 }

Say '星图开机 · 安装' 'Cyan'
Say '----------------'

# 1) DSH 数据目录
if ([string]::IsNullOrWhiteSpace($DshHome)) {
  if ($env:DSH_HOME) { $DshHome = $env:DSH_HOME } else { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
}
if (-not (Test-Path $DshHome)) { Fail "找不到 DSH 数据目录：$DshHome`n  先启动一次 DSH 再来装。" }
Say "DSH 数据目录  $DshHome"

# 2) profile
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
if ([string]::IsNullOrWhiteSpace($ProfileDir) -or -not (Test-Path (Join-Path $ProfileDir 'package.json'))) {
  Fail "找不到 DSH profile。`n  用 -ProfileDir 指定，例如：-ProfileDir `"$DshHome\profiles\desktop`""
}
Say "profile       $ProfileDir"

# 3) 插件来源：脚本旁边应当有一个 dsh-star-boot 目录
$source = Join-Path $PSScriptRoot 'dsh-star-boot'
if (-not (Test-Path (Join-Path $source 'package.json'))) { $source = $PSScriptRoot }
if (-not (Test-Path (Join-Path $source 'package.json'))) { Fail '找不到插件文件（dsh-star-boot 目录）' }

# 4) 找一个能用的 node：优先 DSH 自带的运行时
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
if (-not $node) { Fail '找不到 node.exe（DSH 自带的运行时也没找到）。请先启动一次 DSH。' }
Say "node          $node"

# 5) 拷插件
$target = Join-Path $DshHome 'plugins\dsh-star-boot'
New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
if (Test-Path $target) {
  Say '已存在旧版本，先移除旧的插件目录（设置与素材配置不受影响）'
  Remove-Item $target -Recurse -Force
}
Copy-Item $source $target -Recurse -Force
Say "插件已就绪  $target"

# 6) node_modules 链接（pnpm 的 link: 依赖在缺少 pnpm 时不会自己建）
#    必须放在改清单之前：patch.cjs 会校验「每个 bundle 都装得上」，链接不在就必然判孤儿。
$link = Join-Path $ProfileDir 'node_modules\dsh-star-boot'
if (Test-Path $link) { (Get-Item $link).Delete() }
New-Item -ItemType Junction -Path $link -Target $target | Out-Null
Say "已建链接    node_modules\dsh-star-boot"

# 7) 改清单（失败就回滚，绝不留半截状态）
$manifest = Join-Path $ProfileDir 'package.json'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$manifest.bak-star-boot-$stamp"
Copy-Item $manifest $backup -Force
Say "已备份清单  package.json.bak-star-boot-$stamp"

& $node (Join-Path $PSScriptRoot 'patch.cjs') add $manifest $target
if ($LASTEXITCODE -ne 0) {
  Copy-Item $backup $manifest -Force
  if (Test-Path $link) { (Get-Item $link).Delete() }
  Fail "校验没通过（有「声明了却装不起来」的 bundle），已把清单回滚、链接移除。`n  插件目录留着：$target"
}

Say ''
Say '装好了。'  'Green'
Say '重启 DSH 生效：开机时应当看到星尘 + 名字 + 状态卡 + 接入确认。'
Say '设置 → 左侧「星图开机」可以调模式、配色、节奏、素材。'
