// 只做一件事：往 profile 的 package.json 里加/删「dsh-star-boot」这两处声明，
// 并把结果写回成带缩进的 JSON。用 Node 而不是 PowerShell，是因为 Windows
// PowerShell 5.1 的 ConvertTo-Json 会把数组/转义弄成另一副样子，diff 会很难看。
//
// 用法：
//   node patch.cjs add    <profile/package.json> <插件绝对路径>
//   node patch.cjs remove <profile/package.json>

const fs = require('node:fs')

const NAME = 'dsh-star-boot'
const [, , mode, manifestPath, targetDir] = process.argv

if (mode !== 'add' && mode !== 'remove') {
  console.error('usage: node patch.cjs add|remove <manifest> [targetDir]')
  process.exit(2)
}
if (!manifestPath || !fs.existsSync(manifestPath)) {
  console.error(`找不到 profile 清单：${manifestPath}`)
  process.exit(2)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))
manifest.dependencies = manifest.dependencies ?? {}
manifest.dsh = manifest.dsh ?? {}
manifest.dsh.profile = manifest.dsh.profile ?? {}
const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : []
manifest.dsh.profile.bundles = bundles

if (mode === 'add') {
  if (!targetDir) {
    console.error('add 需要插件目录')
    process.exit(2)
  }
  // pnpm 的 link: 说明符用正斜杠，Windows 反斜杠会被当成转义。
  manifest.dependencies[NAME] = `link:${targetDir.replace(/\\/g, '/')}`
  if (!bundles.includes(NAME)) bundles.push(NAME)
  // 官方 bundle 必须在最前面；我们的放最后，加载顺序也晚于别的插件。
  const official = bundles.filter((name) => String(name).startsWith('@deepseek-ai/'))
  const rest = bundles.filter((name) => !String(name).startsWith('@deepseek-ai/'))
  manifest.dsh.profile.bundles = [...official, ...rest]
} else {
  delete manifest.dependencies[NAME]
  manifest.dsh.profile.bundles = bundles.filter((name) => name !== NAME)
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

// 顺手报一下孤儿：声明了却装不上的 bundle 会让下一次启动直接失败。
const profileDir = require('node:path').dirname(manifestPath)
const orphans = (manifest.dsh.profile.bundles || []).filter((name) => {
  if (String(name).startsWith('@deepseek-ai/')) return false
  return !fs.existsSync(require('node:path').join(profileDir, 'node_modules', String(name), 'package.json'))
})

console.log(`bundles: ${manifest.dsh.profile.bundles.length}`)
console.log(`orphans: ${orphans.length ? orphans.join(', ') : 'none'}`)
process.exitCode = orphans.length ? 1 : 0
