---
title: 162 次构建，145 次失败：把 Blender 搬上 iPad
published: 2026-11-03
description: 'Blender 5.1.2 交叉编译成 iOS 未签名 IPA 的完整记录——20 个坑按根因分层整理，包括三份 fmt 打架、33 轮才改对的 jacobiSvd，以及构建全绿但上机必崩的 @rpath'
image: ''
tags: ["技术", "Blender", "iOS", "GitHub Actions", "CMake"]
category: 'Tech'
draft: false
lang: ''
---

想在 iPad 上跑 Blender。

这个念头听起来不太现实——一台平板跑完整的三维套件，光是内存就够呛。但 Blender 官方确实有 `ios` 分支，说明有人在往这个方向推。缺的只是**一个能装到设备上的包**。

于是就有了这个项目：用 GitHub Actions 把 Blender 交叉编译成 arm64 的 iOS 未签名 IPA。

结果先说：**做出来了**。代价是 162 次构建、145 次失败、两个多月的零碎时间。

---

## 最后拿到了什么

| | |
|---|---|
| 产物 | `Blender_5.1.2_unsigned.ipa` |
| 体积 | 238 MB |
| 架构 | arm64（真机，非模拟器） |
| 系统 | iPadOS，未签名，需侧载 |
| 仓库 | [Austinzhao039/blender](https://github.com/Austinzhao039/blender)（`blender/blender` 的 fork） |
| 工作流 | `.github/workflows/build-unsigned.yml` |
| 统计 | run #115 → #266，145 失败 / 2 成功 |

两次成功是 #264 和 #266。第一次构建全绿、装上去也打开了，但三秒后退回桌面——这个问题后面单开一节讲。

:::note
IPA 现在是本地留存，没有长期托管。Actions 的 artifact 只保留有限天数，仓库 Release 里目前放的是几个依赖库的 zip，不含成品。
:::

---

## 先看这张表

如果你也在做类似的 iOS 移植，这张表大概是全文最有用的部分。20 条，按出现顺序排：

| 报错关键词 | 根因 | 修法 |
|---|---|---|
| `'Eigen/Core' file not found` | `lib-ios_arm64` 里没有 `eigen/` 目录 | 官方 3.4.0 源码 `cmake --install` 进 `lib/ios_arm64/eigen` |
| `cp: /usr/include/eigen3/... No such file` | macOS runner 没有系统 eigen3 | 同上，别指望系统包 |
| `'ceres/ceres.h' file not found` | 依赖包只放了 LFS 指针，没拉实体 | 三重 `git lfs pull` 兜底 + 官方源码补头 + **手写** `export.h`/`config.h` |
| `'jacobiSvd' does not name a template` | Eigen 3.4 只留了运行时选项版 | `.jacobiSvd<O>()` → `.jacobiSvd(O)`，一次吃掉尖括号和圆括号 |
| `'half.h' file not found` | Alembic 按 Imath 2.x 扁平布局写，包内是 3.x | 头路径加 `imath/include` **和** `imath/include/Imath` |
| `'IlmThreadConfig.h' file not found with <angled>` | 该头在 `openexr/include/OpenEXR/` 下 | 额外加 `openexr/include/OpenEXR` |
| `no template named 'parse_context'` | 编译单元里混进**两份 fmt** | 只留一份，其余物理清除 |
| `library 'FFMPEG_AVFILTER_LIBRARY-NOTFOUND' not found` | iOS 的 ffmpeg 包没有 `libavfilter.a` | 从组件表移除 `avfilter` |
| `no such file: 'OpenImageIO::OpenImageIO-NOTFOUND'` | CMP0111 旧行为把 `-NOTFOUND` 当路径 | 给 imported target 补真实 `IMPORTED_LOCATION` |
| `Attempt to add link library ... not built in this directory` | 跨目录 `target_link_libraries` | `cmake_policy(SET CMP0079 NEW)` |
| `Undefined symbols: OpenImageIO_v3_0::Filesystem::IOProxy` | 兄弟库没被串进链接 | `target_link_libraries` 显式补齐 |
| `building for 'macOS', but linking in ... built for 'iOS'` | 宿主工具误链 iOS 静态库 | 按 `CMAKE_OSX_SYSROOT` 分支给库 |
| `cannot execute binary file`（宿主 python） | 预编译的宿主 python 跑不起来 | 自检失败就换成 runner 真 python 的 wrapper |
| `error.svg.c` 生成失败 | 同上，脚本阶段调不动宿主 python | 同上 |
| `file INSTALL cannot find .../python/lib/python3.13` | BeeWare 包的路径与 install 规则不一致 | 从 xcframework 的 `lib/python3.13` 拼装 |
| `@rpath/Python.framework/Python` 未解析 | BeeWare 的 libpython 的 `LC_ID_DYLIB` 就是 framework 名 | 按 framework 目录结构放 + 软链 |
| 装上去秒退、无崩溃日志 | `Python` 缺 `Modules/Setup.local` | 写 `*static*` 模块表 |
| `includes non-existent path "/include"` | 补丁里 `LIBDIR` 被自己改空了 | 推导后 `set(... FORCE)` 覆盖 |
| 改了 CI 但跑完还是老的 | 缓存跨 run 复用，configure 变了 cache 就脏 | 改 configure 后必须删缓存 |

同一个根因经常连续挂十几轮，所以**按层看比按时间看有用**。下面就是这五层。

---

## 第一层：宿主环境骗了你

这层的坑最气人，因为它们跟你编的东西毫无关系。

### 预编译的宿主 Python 根本跑不起来

`xcodebuild` 里有大量 `PhaseScriptExecution`，负责生成 `icons_svg/*.svg.c`、`register_geometry_nodes.cc`、`locales` 这些。脚本里写死了 `lib/macos_arm64/python/bin/python3.13`。

这个二进制是从 Release 下的预编译包，在本 runner 上 exec 不起来。于是**所有代码生成步骤一起挂**，报错长这样：

```
Script-47CCCEC1A0AE8197511C6FBF.sh: line 9:
  .../lib/macos_arm64/python/bin/python3.13: cannot execute binary file
Command PhaseScriptExecution failed with a nonzero exit code
```

看起来像"图标生成失败"，其实跟图标一点关系都没有。

修法是下载后立刻自检，坏就换成 runner 真 python 的 wrapper：

```bash
HP=lib/macos_arm64/python/bin/python3.13
if ! "$HP" -V > /tmp/hp.out 2>&1; then
  REAL=$(command -v python3.13 || command -v python3)
  rm -f "$HP"
  printf '#!/bin/sh\nexec "%s" "$@"\n' "$REAL" > "$HP"
  chmod +x "$HP"
fi
```

:::caution
这个 wrapper **要在构建前再查一次**。因为 cache restore 会把旧的 `lib/macos_arm64` 带回来，换掉的是上一轮的坏文件。
:::

### 自己改 HOME 把 Homebrew 弄死了

有一批 run 全挂在：

```
Error: $HOME must be set to run brew.
```

原因是我在某个 step 里 `export HOME=...` 覆盖了 HOME（想让工具写缓存），xcodebuild 的 script phase 继承了这个坏 HOME。

修法很土：调用 `xcodebuild` 时显式传 `HOME="$HOME"`，并且**绝对不要**在 step 里改 HOME 指向不存在或不可写的目录。

### macOS 的 sed 会静默失败

Blender 源码里有 UTF-8 中文和 emoji 注释（`octree.cpp`、`track_region.cc` 都有）。BSD `sed` 在 `LANG` 没生效时按单字节处理，遇到多字节序列直接报：

```
sed: RE error: illegal byte sequence
```

该死的是**改写没生效，但 step 返回 0**，下一轮编译又看到老代码，看起来像"改了没用"。

改写含非 ASCII 的源码，老老实实用 Python 按字节读写，或者 `export LC_ALL=C` 加 `perl -pi -e`。

---

## 第二层：依赖包比你想的残缺（最耗时间）

iOS 的预编译库包 `lib-ios_arm64` 比 macOS 的 `lib-macos_arm64` **残缺得多**，而 `platform_apple.cmake` 是按 macOS 包的完整度写的。这一层吃了最多的轮次。

### Eigen 整个目录都不存在

起点：

```
extern/quadriflow/src/subdivide.hpp:1:10: fatal error: 'Eigen/Core' file not found
```

`platform_apple.cmake` 用 `file(GLOB ${LIBDIR}/*)` 加 `find_package(Eigen3 CONFIG)` 找它，但包里的 `eigen/` 目录压根没有。

⚠️ 现在回看旧文，我当时写的是「设置 `EIGEN3_ROOT_DIR=/usr/include/eigen3`」——**这是错的**，macOS runner 从来不预装 eigen，那条路是死的。#121 就是这么挂的。

正解是把官方 3.4.0 按标准前缀装进去，目录名取 `eigen`，正好被 GLOB 命中：

```bash
EIGEN_PREFIX="$PWD/lib/ios_arm64/eigen"
curl -fsSL -o /tmp/eigen.tgz https://gitlab.com/libeigen/eigen/-/archive/3.4.0/eigen-3.4.0.tar.gz
cmake -S /tmp/eigen-src -B /tmp/eigen-build \
      -DCMAKE_INSTALL_PREFIX="$EIGEN_PREFIX" \
      -DBUILD_TESTING=OFF -DEIGEN_BUILD_DOC=OFF -DBUILD_SHARED_LIBS=OFF
cmake --install /tmp/eigen-build
```

装完必须验两件事：`include/eigen3/Eigen/Dense` 和 `share/eigen3/cmake/Eigen3Config.cmake` 都在。

### Ceres 的头是 LFS 指针

`'ceres/ceres.h' file not found` → `'ceres/internal/export.h' file not found` → `'ceres/internal/config.h' file not found`，连续 9 轮。

根因两层：依赖包里的 ceres 头是 Git LFS 对象，`git clone` 只拿到几行指针文件；而 `export.h` / `config.h` 是**构建期生成**的，官方仓库里压根没有。

三步兜底：`git lfs pull --include="ceres/**"` → 全量 `git lfs pull` → 从 `ceres-solver-2.1.0` 源码拷 `include/*`，最后**手写**这两个文件（一组空的 `CERES_EXPORT` 宏）。

头解决了还是不行，因为**库**也没有：`lib-ios_arm64` 里没有 `libceres.a`，也没 glog / gflags / boost。于是链接期 18 个未定义符号。

最后的决定是 `-DWITH_LIBMV=OFF`——iOS 上不做摄像机反求，这个代价可以接受。

### TBB 的导出集只定义了一半

```
TBBTargets.cmake:42 (message):
  Some (but not all) targets in this export set were already defined.
  Targets Defined: TBB::tbb
  Targets not yet defined: TBB::tbbmalloc, TBB::tbbmalloc_proxy
```

同一个 `TBBConfig.cmake` 被 `find_package` 了两次。`find_package(TBB)` 前加个 `if(NOT TARGET TBB::tbb)` 守卫就完了。

### 缺 `xxxConfig.cmake` 是常态

OpenEXR、OpenImageIO、Eigen3、Ceres、Boost、TBB —— iOS 包只放了 `.dylib` + `include`，一个 config 都没有。

办法是手写一批"假 config"，每个只做一件事：`add_library(<Name>::<Name> IMPORTED)` 加设置 `INTERFACE_INCLUDE_DIRECTORIES`。

:::warning
伪造 config 本身会引入新坑。我有一批 run 是因为在补丁里拼 `"${LIBDIR}/xxx"`，而 `LIBDIR` 被自己前面的改动搞空了，路径退化成 `/include`、`/lib/macos_arm64`——报错里看不出变量是空的，只看到一个离谱的绝对路径。
:::

所以补丁里凡是拼路径，前面都加一道硬检查：

```cmake
if(NOT LIBDIR OR NOT EXISTS "${LIBDIR}")
  message(FATAL_ERROR "iOS patch: LIBDIR is empty/invalid ('${LIBDIR}')")
endif()
```

**不要在补丁里动 `LIBDIR` 的推导逻辑**，改成推导之后覆盖它的值。报错时把变量原值打出来，否则你只看到一个 `/lib`，会以为是磁盘少了东西。

---

## 第三层：CMake 生成期

### `-NOTFOUND` 出现在链接命令里，永远是 CMake 的问题

```
clang++: error: no such file or directory: 'OpenImageIO::OpenImageIO-NOTFOUND'
Command Ld failed with a nonzero exit code
```

CMake 的旧行为（CMP0111 OLD）在 imported target 没有 `IMPORTED_LOCATION` 时不报错，而是把字面量 `<target>-NOTFOUND` 当文件路径写进链接命令，等到链接器才骂人。

修法是遍历缺 `IMPORTED_LOCATION` 的 target，把真实 dylib 路径塞回去。有个细节值得记：`IMPORTED_LOCATION` 在 **generate 阶段**才解析，所以追加到顶层 `CMakeLists.txt` 末尾同样生效，不用去改各个包的 config。

### 跨目录加库要开 CMP0079

```
Attempt to add link library ... to target "blender" which is not built in this directory
```

`target blender` 建在 `source/creator/`，我在顶层 `CMakeLists.txt` 末尾给它补库。`project(...)` 之后立刻 `cmake_policy(SET CMP0079 NEW)` 就行。

### 这条最值钱：用 pbxproj 静态检查把 20 分钟压成 10 秒

有一轮 configure 成功、跑到第 20 分钟才报头文件找不到：

```
openimageio_support.hh:12:10: fatal error: 'OpenImageIO/filesystem.h' file not found
```

原因是 `target_include_directories` 只有在 generate 时被消费才会写进 `project.pbxproj`。加错了目标，configure 一声不响。

改成在 build 之前用秒级步骤验证：

```bash
PBX=build_ios/Blender.xcodeproj/project.pbxproj
grep -qi "imath" "$PBX"       || { echo "::error::imath path missing"; exit 1; }
grep -qi "openimageio" "$PBX" || { echo "::error::OIIO path missing"; exit 1; }
grep -q  "lib/ios_arm64/fmt" "$PBX" || { echo "::error::fmt 指向错误"; exit 1; }
grep -q  "opt/homebrew/Cellar/fmt" "$PBX" && { echo "::error::homebrew fmt 泄漏"; exit 1; }
```

这四行是整个项目里效率提升最明显的一处改动。

---

## 第四层：链接期

### 兄弟库不会自动串上

这套 config 只声明自己，不声明兄弟库。结果 36 个未定义符号分三类：

| 符号 | 实际在 |
|---|---|
| `Filesystem::IOProxy`、`ParamValue`、`ustring` | `libOpenImageIO_Util` |
| `Iex_3_3`、`_imath_half_to_float_table` | `libIex` / `libImath` |
| `ceres::*` | `libceres.a`（不存在） |

前两类逐个补库解决，第三类只能关掉 libmv。

### 构建全绿 ≠ 能跑

#264 构建成功，解压 IPA 一检查就发现：

```
Blender 的 LC_LOAD_DYLIB: @rpath/Python.framework/Python
Blender.app/Frameworks/ 里没有 Python.framework
```

BeeWare 的 `libpython3.13.dylib` 其实是个**符号链接**，指向 `../Python.framework/Python`，真正的 `LC_ID_DYLIB` 就是 `@rpath/Python.framework/Python`。所以「把 libpython 拷进 Frameworks」拷过去的只是一个 install name 叫 framework 路径的散装 dylib，照样解析不到。

按 framework 目录结构放，加两条软链：

```
Frameworks/Python.framework/Versions/A/Python     ← 真正的二进制
Frameworks/Python.framework/Python                → Versions/A/Python
Frameworks/Python.framework/Versions/Current      → A
```

再给主程序补 `-add_rpath @executable_path/Frameworks`。

### 装上了，一启动就退

#266 修好 rpath，装上去能打开了——三秒后退回桌面，**没有任何崩溃日志**。

根因：BeeWare 的包里没有 `Modules/Setup*`。CPython 初始化静态内置模块（`_io`、`posix`、`marshal`…）时要读这张表，读不到就 `Py_Initialize` 静默 abort。

手动写一份：

```
*static*
_abc _abc
_codecs _codecs
_collections _collections
_io _io
_functools _functools
posix posix
time time
```

:::warning
YAML 里写这个有个隐藏雷：**块首不能出现 `*`**（会被当成 YAML alias）。所以不能用 heredoc，得用 `printf '%s\n' '*static*' '...' > Setup.local`。
:::

### dylib 闭包要扫全

第一版 Embed 脚本只从 `binary` 出发做 BFS，漏了 `libtbbmalloc` / `liboslquery` / `liboslnoise`——它们是 app 内 `Assets/lib/` 里的库，不是主程序的直接依赖。

修法：把 `Assets/*/lib` 下所有 dylib 也当 BFS 根节点。

还有一个恶心的地方：如果 pbxproj 里 `Frameworks` 是个 folder reference 且进了 Resources 阶段，xcodebuild 会先 `mkdir -p Frameworks` 再往里 `cp`，把手工改好 install_name 的 dylib **覆盖回原样**。得在打包前静态检查并摘除。

---

## 三个最阴的坑，单独讲

### 一、三份 fmt 打架（定位最久）

这个坑连挂 7 轮，中间改错方向 4 次。

现象换过三副面孔：

```
# 第一轮：Homebrew 的 fmt 12.2 被拉进来
/opt/homebrew/Cellar/fmt/12.2.0/include/fmt/ranges.h:335:34: error: use of undeclared identifier 'report_error'

# 第二轮：换成自己的 12.1，报 12.1 自己的错
lib/ios_arm64/fmt/include/fmt/ranges.h:295:30: error: no template named 'is_tuple_formattable'

# 第三轮：OIIO 的 fmt 包装头找不到实现
fatal error: 'OpenImageIO/detail/fmt/format.h' file not found
```

真正的根因查到第四轮才想明白：

| 位置 | fmt 版本 |
|---|---|
| `lib-macos_arm64`（OIIO 自带） | **12.1** |
| `lib-ios_arm64`（OIIO 自带） | **9.1** |
| Homebrew | 12.2 |

fmt 的所有头用同一个 include guard（`FMT_FORMAT_H_`）。macOS 版因为两份都是 12.1，**第二份被自然跳过，正好共用一份，所以从来不出问题**。

iOS 版则是 OIIO 的 9.1 先占了 guard，Blender 的 `fmt/ranges.h` 再 include `format.h` 时整段被跳过——`base.h` 根本没机会执行，于是 `FMT_EXPORT` / `FMT_PRAGMA_CLANG` / `fmt::is_tuple_like` 全部"未定义"。

所以看起来像「12.1 的头坏了」，实际是「12.1 的头压根没被编译进去」。

修法四步，缺一不可：拉 12.1 的头过来 → **物理删除** OIIO 自带的那份 → 头路径用 `BEFORE` 顶到最前压过 Homebrew → 静态检查 pbxproj 里不许出现 `opt/homebrew/Cellar/fmt`。

:::tip
断言细节：`fmt/core.h` 在 12.x 里只是 187 字节的转发头，别拿它的大小做「截断检查」——我 #252 就这么误判过一次。要查就查 `base.h` 里 `FMT_PRAGMA_CLANG` / `FMT_EXPORT` / `FMT_BEGIN_NAMESPACE` 三个宏是否真的定义了。
:::

### 二、jacobiSvd（最长的一条战线，33 轮）

```
track_region.cc:943:17: error: 'jacobiSvd' does not name a template
octree.cpp:2187:46: error: no viable conversion from 'JacobiSVD<...>' to 'Eigen::JacobiSVD<...>'
```

Blender 5.1.2 的 libmv / dualcon 用的是老 API：

```cpp
svd.jacobiSvd<Eigen::ComputeThinU | Eigen::ComputeThinV>()   // 模板参数版
```

Eigen 3.4 只留了运行时选项版：

```cpp
svd.jacobiSvd(Eigen::ComputeThinU | Eigen::ComputeThinV)      // 函数参数版
```

`octree.cpp` 更麻烦，它显式写了 `Eigen::JacobiSVD<Eigen::Matrix3f, Options> svd = ...`，而运行时版返回的是 `JacobiSVD<PlainObject, 默认前置条件>`——两个不同类型，无隐式转换，只能用 `auto` 接。

所以两件事要同时做：改调用形式，**并且**改写显式类型。正则必须一次吃掉尖括号和后面的圆括号：

```python
re.sub(r'\.jacobiSvd<([^<>]*)>\(\)', r'.jacobiSvd(\1)', src)
```

分两步改会留下 `.jacobiSvd(Opts)()`，变成 `does not provide a call operator`——#232 就是这么挂的。

**这个坑真正贵的不是技术难度，是我自己浪费的轮次：**

- #225/#226 用 `sed` 改，撞上 `illegal byte sequence` 静默失败
- #227–#230 加了断言但断言写错（检查 `jacobiSvd<` 时其实已经改过了）
- #238 只改了一半文件（`octree.cpp` 的显式类型版没动）

:::important
**断言比编译快，但断言写错比没写更浪费时间。** 那四轮每轮约 40 分钟，全挂在「断言通过了但代码没改对」上。

断言必须检查**改完之后**的真实状态，并且把改完的那几行 `print` 到日志里。只报"还不对"而不报"现在是什么样"，等于没写。
:::

### 三、缓存（不是代码的坑，是流程的坑）

- key 用 `ios-build-v1-<源码sha>-<run_id>`，`restore-keys` 用前缀，这样每轮都能写新的又能命中旧的
- 恢复缓存后**必须把源码 mtime 压平**（`touch -t 202001010000`），否则 Xcode 认为所有源文件都是新的，直接全量重编，缓存白存
- 不能用 `cache-hit` 判断是否命中：key 带 run_id，前缀命中时它仍是 `false`，要看产物目录是否真的存在
- 早期脚本里有 `rm -rf build_ios` 保证干净，加了缓存之后这行等于**每轮都全量重编**，必须删掉
- 缓存配额 10 GB，跑满后新缓存**直接被丢弃且不报错**，要有 prune 步骤

:::warning
prune 时**绝不能删 `ios-libs-<hash>`**——那是 iOS 预编译库（575 MB），命中率全靠它。我误删过一次，代价是一轮 40 分钟。

另外：**改 configure 参数后必须先删 `ios-build-v1-*` 缓存再 dispatch。** `CMakeCache.txt` 里的旧值会让 generate 阶段产生大量不一致，表现为「改了代码但行为没变」。#265 就这么白跑一轮。
:::

失败也要存缓存，但要设门槛：`build_ios` ≥ 200 MB 且存在 `build/` 目录才存。这样「编到 90% 挂了」能把成果留给下一轮，「第 3 步就挂」的不会挤掉有用的缓存。

---

## 三条能复用到别的移植项目的经验

**一、`-NOTFOUND` 出现在链接命令里，永远是 CMake 的问题，不是链接器的问题。**
查 CMP0111、查 `find_library` 的组件表、查 imported target 的 `IMPORTED_LOCATION`。

**二、「头文件找不到」90% 是搜索路径没进工程，10% 是真没这个文件。**
先在 configure 后 `grep project.pbxproj`，秒级验证，别等 20 分钟后的编译错误。

而「路径加了还是找不到」通常是因为**它自己的内部 include 是相对的**，父目录也得在路径里。`half.h` 就是这样：`imath/include` 和 `imath/include/Imath` 两个都得加。

**三、构建绿 ≠ 能跑。**
打包后一定要对 IPA 做静态体检：遍历每个 Mach-O，解析 `LC_LOAD_DYLIB` / `LC_RPATH` / `LC_BUILD_VERSION`，确认每个 `@rpath/*` 都能在 bundle 内解析、`platform` 都是 2（iOS）、`@executable_path/Frameworks` 存在。

这套检查（40 行 Python）能在 3 秒内发现「上机必崩」的问题——而等它崩在 iPad 上，你连日志都拿不到。

---

## 装到 iPad 上

1. 下载 `Blender_5.1.2_unsigned.ipa`（238 MB）
2. 用侧载工具装：[AltStore](https://altstore.io/)、[Sideloadly](https://sideloadly.io/) 或爱思助手
3. 未签名包需要自签，免费 Apple ID 签名 **7 天过期**，到期重签

:::caution
这是未签名包，只适合自己玩。要公开分发必须用 Apple Developer 账号重签。另外 iPad 上的 Blender 是半残状态——libmv 关了、部分功能受限，能建能渲，但别指望和桌面版一样。
:::

---

## 最后

回头看，这个项目里真正困难的只有两三个坑：Eigen 缺失、fmt 打架、Python framework。其余一百多次失败，大部分是**同一个根因在反复咬人**，而我每次都只往前挪一步。

162 次里，如果早一点做那几件"笨事"——静态检查 pbxproj、断言改完打日志、改 configure 就删缓存——大概能省掉一半。

所以如果只能带走一句话：**把 20 分钟后才会暴露的问题，压到 10 秒内暴露。** 这句话值 100 次构建。

---

*完整记录共 851 行，包含每个 run 的失败步骤索引和 40 步工作流顺序，留在本地。*
