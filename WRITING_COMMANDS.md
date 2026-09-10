# Blog Writing Commands

这份文档记录本地启动博客、打开写作后台、构建和部署的常用命令。

## 进入项目目录

每次操作前，先进入博客项目目录：

```bash
cd /Users/sunliye/Blog/allensun-post
```

## 启动本地博客

默认启动：

```bash
corepack pnpm run dev
```

固定使用 4321 端口启动：

```bash
corepack pnpm exec astro dev --host 127.0.0.1 --port 4321
```

启动成功后，终端会显示类似：

```text
Local    http://127.0.0.1:4321/
```

## 打开写作后台

本地写作后台地址：

```text
http://127.0.0.1:4321/admin
```

如果 4321 被占用，Astro 可能会自动切换到 4322 或其他端口。此时后台地址也要跟着改，例如：

```text
http://127.0.0.1:4322/admin
```

## 停止本地服务

在运行 dev server 的终端里按：

```text
Ctrl + C
```

如果服务在后台运行，可在项目目录执行 `corepack pnpm exec astro dev stop`。

## 写作流程

1. 启动本地服务。
2. 打开 `/admin`。
3. 在 `博客文章` 中选择文章或点击 `新建文章`。
4. 使用 Markdown 写作。
5. 可切换 `写作 / 预览` 查看效果。
6. 点击 `保存文章` 保存到本地 Markdown 文件。
7. 如需删除文章，选中文章后点击 `删除文章`，确认后会删除对应 Markdown 文件。

## 编辑独立页面

后台的 `个人简介` 区域用于编辑独立页面，例如：

- `个人简介`

适合维护个人介绍、简历、项目经历等长期页面内容。

## 编辑站点配置

后台的 `站点设置` 区域用于编辑站点级配置，例如：

- 站点标题
- 作者信息
- 首页文案
- 社交链接
- 站点描述

## 本地构建检查

发布前建议运行：

```bash
ASTRO_TELEMETRY_DISABLED=1 corepack pnpm run build
```

如果只是检查 Astro/TypeScript 问题，可以运行：

```bash
corepack pnpm exec astro check
```

## 提交到 GitHub

查看改动：

```bash
git status
```

暂存改动：

```bash
git add .
```

提交改动：

```bash
git commit -m "Update blog content"
```

推送到 GitHub：

```bash
git push origin main
```

## Vercel 部署

当前项目已经关联 Vercel。通常推送到 GitHub 后，Vercel 会自动部署。

线上地址：

```text
https://allensun-post.vercel.app
```

如果需要手动触发生产部署，可以运行：

```bash
vercel --prod
```

## 常见问题

### 访问 /admin 失败

先确认本地服务是否启动。终端中应该能看到类似：

```text
Local    http://127.0.0.1:4321/
```

如果端口不是 4321，请使用终端显示的实际端口访问后台。

### 4321 被占用

说明已有一个本地服务正在使用该端口。可以在旧终端里按 `Ctrl + C` 停止旧服务，然后重新启动。

### 线上看不到 /admin

生产环境不提供写作 API，即使能打开后台页面也不能在线保存。请在本地写作后提交并推送 GitHub。
