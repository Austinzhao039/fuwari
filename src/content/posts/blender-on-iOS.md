---
title: 在iOS上运行的blender
published: 2026-08-07
description: 'blender on iOS'
image: ''
tags: ["技术","建模","iOS","Github"]
category: 'Tech'
draft: true 
lang: ''
---

# 编译 Blender iOS 分支的完整记录与踩坑指南

> 本文记录了从零开始，在 GitHub Actions 上为 iPad 侧载构建未签名 `Blender.ipa` 的全过程，包括遇到的 LFS 速率限制、缺失库、CMake 配置问题以及最终的解决方案。

---

## 目标

生成一个可用于 iPad 侧载的未签名 `Blender.ipa` 文件，基于 Blender 官方 `ios` 分支，使用 iOS 预编译库进行交叉编译。

---

## 环境与工具

- **平台**：GitHub Actions (macos-15 runner)
- **Xcode**：26.3 (iOS SDK 26.2)
- **Blender 分支**：`ios`
- **依赖管理**：Homebrew (git-lfs, cmake, fmt)
- **外部库**：从 BeeWare 下载 Python 3.13，从 Blender 官方 LFS 获取部分预编译库

---

## 遇到的主要问题及解决方案

### 1. LFS 速率限制

Blender 官方 LFS 服务有请求限制，直接 `git lfs pull` 会触发 `Rate limit exceeded`。

**解决办法**：
- 克隆时使用 `GIT_LFS_SKIP_SMUDGE=1` 跳过所有 LFS 文件。
- 只按需拉取必要的目录（例如 `openexr/**`），而非全量。
- 对于大型依赖（如 `startup.blend`、`OpenImageIO`、`macOS Python`），手动从 Release 下载或使用第三方源。

### 2. 缺少 CMake 配置文件

许多库（OpenEXR、Eigen3、Ceres、Boost、TBB）需要 `Config.cmake` 文件，但预编译库中未提供。

**解决办法**：在工作流中动态生成假的配置文件，并创建对应的 IMPORTED 目标，例如：

```cmake
set(OpenEXR_FOUND TRUE)
set(OPENEXR_INCLUDE_DIR "${OPENEXR_DIR}/include/OpenEXR")
set(OPENEXR_LIBRARY "${OPENEXR_DIR}/lib/libOpenEXR.dylib")
add_library(OpenEXR::OpenEXR UNKNOWN IMPORTED)
set_target_properties(OpenEXR::OpenEXR PROPERTIES
  INTERFACE_INCLUDE_DIRECTORIES "${OPENEXR_INCLUDE_DIR}"
  IMPORTED_LOCATION "${OPENEXR_LIBRARY}")
```

### 3. Eigen 头文件找不到

`extern_quadriflow` 模块需要 `<Eigen/Core>`，但 CMake 无法定位 Eigen 的包含路径。

**解决办法**：设置环境变量 `EIGEN3_ROOT_DIR` 指向 Eigen 头文件所在目录，让 Blender 自带的 `FindEigen3.cmake` 能够找到。最终方案如下：

```yaml
- name: Set Eigen3 root directory
  run: echo "EIGEN3_ROOT_DIR=/usr/include/eigen3" >> $GITHUB_ENV
```

### 4. TBB 与 OpenImageIO 目标重复

Blender 内部依赖 `TBB::tbb` 和 `OpenImageIO::OpenImageIO` 等 IMPORTED 目标，若重复定义会报错。

**解决办法**：在假配置中使用 `if(NOT TARGET ...)` 条件保护创建。

### 5. Python 头文件路径错误

iOS Python 的头文件位于 `include/python3.13/` 子目录，需正确设置 `PYTHON_INCLUDE_DIR`。

---

##  最终完整工作流

经过反复调试，形成了一套完整的 GitHub Actions 工作流，涵盖了所有修复。您可以直接使用以下 YAML 文件（已放入您的仓库 `.github/workflows/build-ios.yml`）：

```yaml
# 完整代码见前文，此处省略重复（实际博客中可嵌入完整YAML）
```

>  完整 YAML 可在我的博客配套仓库中找到 [链接]。

---

##  下载链接

本次构建生成的未签名 IPA 文件可从以下地址下载（如构建成功）：

### 最新构建（#114）的 Artifact

**下载地址**（临时 Artifact，保留 7 天）：
```
https://github.com/Austinzhao039/blender/actions/runs/31145421291/artifacts/8981354081
```
（请替换为实际可用的 artifact ID）

### 稳定版 Release

我将会把最终可用的 IPA 上传到 GitHub Release，方便长期下载：

 [**Blender-iOS-IPA Release**](https://github.com/Austinzhao039/blender/releases/tag/ios-ipa)

（如果尚未发布，请稍后查看）

---

## 如何使用 IPA 文件

1. **下载** `Blender.ipa`。
2. 使用侧载工具（如 [AltStore](https://altstore.io/)、[Sideloadly](https://sideloadly.io/) 或 [爱思助手](https://www.i4.cn/)）安装到您的 iPad。
3. 首次启动可能需要信任开发者证书（未签名 IPA 需在设置中允许）。

> **注意**：此 IPA 未签名，仅适合个人开发者测试使用。如需公开分发，请使用 Apple Developer 账号签名。

---

##  经验总结

- **不要盲目拉取 LFS**：按需下载，避免触发配额限制。
- **善用 GitHub Actions 缓存**：对 `lib/ios_arm64` 进行缓存可大幅减少后续构建时间。
- **CMake 配置要全面**：许多第三方库需要手动生成配置文件，确保所有依赖都被正确发现。
- **环境变量有时比 CMake 参数更管用**：比如 `EIGEN3_ROOT_DIR` 能让 Blender 的查找模块正常工作。

---

## 致谢

- Blender 官方团队提供 iOS 分支和预编译库。
- BeeWare 项目提供 Python 3.13 iOS 支持包。
- 社区开发者们的踩坑经验分享。

---

## 反馈与交流

如果您在构建过程中遇到其他问题，欢迎在我的博客评论区留言(目前还没做，暂时可通过我的邮箱联系我，邮箱在关于页面)，或通过 GitHub Issue 联系。

---

*最后更新：2026-08-07*
