# 交接：GitHub 仓库管理（DSH / dsh-star-boot）

> 给接手这个仓库的 AI / 人。你不需要之前的对话，读完这份就能上手。

## 一句话

你在管 GitHub 仓库 **2524034412-boop/DSH** —— 里面是 DeepSeek Harness 的启动片头插件「星图开机」，当前版本 **v1.7.1**，已发布 Release。

## 地址

| | |
|---|---|
| 仓库 | https://github.com/2524034412-boop/DSH （Public，默认分支 `main`） |
| Release | https://github.com/2524034412-boop/DSH/releases/tag/v1.7.1 |
| 安装包 | `dsh-star-boot-1.7.1.zip`（7.49 MB，解压后双击 `安装.cmd`） |
| 仓库内容 | 29 个条目：插件源码、安装脚本、三张截图、五套测试、LICENSE / NOTICE、本交接文档 |

## 凭据（最重要的一条）

```
<Token 文件>      # 本机：%USERPROFILE%\.dsh\github-token.txt
```

- 一行 GitHub Fine-grained PAT，权限：`Contents: Read and write`，覆盖该账号所有仓库
- 到期：**2027-01-02**（到期后推送会 401）
- 用法：

```powershell
$tok = (Get-Content "$env:USERPROFILE\.dsh\github-token.txt" -Raw).Trim()
```

**红线**

1. 不把 token 打印到回复、日志、仓库文件里
2. 命令输出里如果出现 `https://x-access-token:...`，打码成 `***`
3. 不写进 commit、不写进 README、不发给任何第三方域名（只用 `api.github.com` / `github.com`）
4. 推送失败返回 401 → 告诉用户「token 过期或失效，需要换一把」，**不要反复重试、不要自己造 token**

## 本机三份目录（别搞混）

| 路径 | 是什么 |
|---|---|
| `…\dsh-star-boot-repo` | **源码仓库**（有 git 历史、有 .git）。改代码改这里 |
| `…\dsh-star-boot-网页上传` | 给网页上传准备的副本，**没有 .git**，不要在这里提交 |
| `…\.dsh\plugins\dsh-star-boot` | **DSH 实际加载的插件**。改了这里要重启 DSH 才生效 |

仓库是「生效目录」的超集：多了安装脚本、README、截图、测试、`.git`。

## 推送（脚本已备好）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<本机的 push-DSH.ps1>" -Message "改了什么"
```

- 不带 `-Message` 就只推已有提交
- 脚本会：读 token → 提交（有改动时）→ 推 `HEAD:main` → 失败返回非 0
- 它已经处理了 PowerShell 5.1 的一个坑：git 把进度写到 stderr，PS 会当错误抛出，导致「明明推成功了却 exit 1」

## 常规任务

### A. 改代码 / 文档

1. 在源码仓库 `…\dsh-star-boot-repo` 里改
2. 跑测试（见下）
3. `push-DSH.ps1 -Message "..."`
4. 用 API 核对：`GET /repos/2524034412-boop/DSH/commits/main`
5. 要本机也生效：把 `lib/` 覆盖到生效目录（`~/.dsh/plugins/dsh-star-boot/lib/`），然后**重启 DSH**

### B. 发新版本

1. 改 `package.json` 的 `version`（仓库和生效目录都改）
2. 打新 zip：把仓库内容打包成 `dsh-star-boot-<ver>.zip`
3. 推送代码
4. 建 Release：

```powershell
$body = @{ tag_name='v1.8.0'; target_commitish='main'; name='星图开机 1.8.0'; body=$notes } | ConvertTo-Json
# ⚠ 中文必须用 UTF-8 字节发，否则 PS 5.1 会写成 "????"
$bytes = [Text.Encoding]::UTF8.GetBytes($body)
Invoke-RestMethod -Uri 'https://api.github.com/repos/2524034412-boop/DSH/releases' `
  -Headers $h -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8'
```

5. 传附件：

```powershell
Invoke-RestMethod -Uri "https://uploads.github.com/repos/2524034412-boop/DSH/releases/<id>/assets?name=<file>.zip" `
  -Headers $h -Method Post -InFile <zip> -ContentType 'application/zip'
```

6. 验：`assets[0].state == 'uploaded'`、下载地址返回 200

## 测试

```powershell
$node = "<DSH 安装目录>\resources\runtime\node\node.exe"
& $node test/host.mjs     # 宿主：注入行、五条路由、Range、上传落盘与清理（59 条）
& $node test/page.mjs     # 设置页：无 React 桩，验构建不抛
& $node test/cache.mjs    # 换素材不吃旧缓存（需 Edge + Playwright）
& $node test/panel.mjs    # 端到端：真 Edge 点「选择文件…」
& $node test/preview.mjs  # 逐帧截图，落在 ~/.dsh/tmp/star-boot-*
```

Playwright 装在 DSH profile 的 `node_modules` 下（`~/.dsh/profiles/desktop/node_modules/playwright`），可用环境变量 `STAR_BOOT_PLAYWRIGHT` 覆盖。

## 项目事实（改之前必须知道的）

- DSH 插件结构：`package.json` 的 `dsh.bundle.patch`（`cordis.patch.yml` 把条目插进 profile）+ `dsh.client`（浏览器那一半）
- **不变式：任何情况下不能让插件「未激活」**——DSH 把未激活当致命错误，会崩启动并重置 profile（2026-11-02 真发生过）
- 浏览器工件 `id` 必须等于包名 `dsh-star-boot`
- 注册设置槽位只能 `ctx.slots.inject`，不能裸 `ctx.slots.register`（槽位不存在会抛 `SlotOwnershipError`）
- 首帧遮盖走 `webserver/index-inject`（早于 shell 画启动卡）
- 素材配置在 `$DSH_HOME/star-boot.json`（`{version:2, assets:{bg,audio}}`），上传落 `$DSH_HOME/star-boot-assets`
- 外观/文案/开关存浏览器 `localStorage`（`dsh-star-boot:*`）
- 默认观感：压暗 85、遮罩 60、玻璃字、素材跟播开、音效关

## 已知限制（别当成 bug 去「修」）

- 安装脚本只覆盖 Windows，macOS / Linux 走 README 里的手动三步
- 「素材跟播」最多等 15 秒，更长的片子会被切
- 音效可能被浏览器/Electron 自动播放策略拦掉，此时静音且不报错
- 视频依赖宿主支持 `Range`（1.4.2 起）
- `assets/default-bg.mp4` 是演示素材，**版权不在 MIT 范围**；公开分发前确认授权，或删掉它（会自动退回 `hero.webp`）

## 和用户打交道的方式

- 中文、直接、先给结论，不要寒暄
- 他说「推上去 / 发个版本 / README 加一段」就是让你执行，不要反问一堆
- 破坏性动作（删仓库文件、改 git 历史、删 token）先说清楚再动手
- 验证过的才说验证过；没验证的明确讲「这个我没验」

## 当前状态（2026-11-03）

```
远端 main  与本地一致（本交接文档已随代码入库）
仓库       29 个条目，README 6.9 KB
Release    v1.7.1 已发布，asset 7.49 MB
本地       与远端一致，工作区干净
```
