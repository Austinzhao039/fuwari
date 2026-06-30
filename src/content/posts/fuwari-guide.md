---
title: fuwari使用指南
published: 2026-02-22
description: 'Fuwari基本操作'
image: ''
tags: ["技术","Fuwari"]
category: 'Tech'
draft: false 
lang: ''
---

:::note
只是从网上找的教程并翻译为了中文
:::

# ✨ 功能特性

- [x] 基于 Astro 和 Tailwind CSS 开发
- [x] 流畅的动画和页面过渡
- [x] 亮色 / 暗色模式
- [x] 自定义主题色和横幅图片
- [x] 响应式设计
- [x] 使用 [Pagefind](https://pagefind.app/) 实现搜索功能
- [x] [Markdown 扩展语法](https://github.com/saicaca/fuwari?tab=readme-ov-file#-markdown-extended-syntax)
- [x] 文内目录
- [x] RSS 订阅

# 🚀 快速开始


1. 若要进行本地编辑，请克隆你的仓库，然后运行 `pnpm install` 安装依赖。

   - 如果尚未安装 [pnpm](https://pnpm.io/)，请先执行 `npm install -g pnpm`。

2. 编辑配置文件 `src/config.ts` 以自定义博客。

3. 运行 `pnpm new-post <filename>` 创建新文章，并在 `src/content/posts/` 目录中进行编辑。



# 🧩 Markdown 扩展语法

除了 Astro 默认支持的 [GitHub 风味 Markdown](https://github.github.com/gfm/) 之外，还包含以下几项额外功能：

- 提示框（Admonitions）（[预览与用法](https://fuwari.vercel.app/posts/markdown-extended/#admonitions)）
- GitHub 仓库卡片（[预览与用法](https://fuwari.vercel.app/posts/markdown-extended/#github-repository-cards)）
- 使用 Expressive Code 增强的代码块（[预览](https://fuwari.vercel.app/posts/expressive-code/) / [文档](https://expressive-code.com/)）

# ⚡ 命令

所有命令均需在项目根目录下的终端中执行：

| Command                    | Action                                             |
| :------------------------- | :------------------------------------------------- |
| `pnpm install`             | 安装依赖                                           |
| `pnpm dev`                 | 在 `localhost:4321` 启动本地开发服务器             |
| `pnpm build`               | 构建生产版本到 `./dist/`                           |
| `pnpm preview`             | 在部署前本地预览构建结果                           |
| `pnpm check`               | 执行代码错误检查                                   |
| `pnpm format`              | 使用 Biome 格式化代码                              |
| `pnpm new-post <filename>` | 创建新文章                                         |
| `pnpm astro ...`           | 运行 Astro CLI 命令，如 `astro add`, `astro check` |
| `pnpm astro --help`        | 获取 Astro CLI 帮助信息                            |

