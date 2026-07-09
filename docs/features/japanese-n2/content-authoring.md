# 日语 N2 内容维护指南

本文面向维护日语 N2 内容、真题归档、听力播放器和相关生成资源的人。读完本文
应能理解：内容放在哪里、哪些文件是源材料、哪些文件是生成物、音频和字幕如何
进入项目、页面如何消费这些资源，以及修改后如何验证。

部署和环境运行细节不在本文展开，见
[`../fumadocs/operations.md`](../fumadocs/operations.md)。发布分支、staging
和 production 晋级策略见
[`../../architecture/release-governance.md`](../../architecture/release-governance.md)。

## 项目整体模型

日语 N2 模块不是单纯的 Markdown 集合。它由内容源码、生成脚本、静态媒体、
结构化数据和交互组件共同组成：

```text
原始材料/校订材料
        ↓
脚本校准、拆分、生成
        ↓
content/docs 页面 + public 静态资源 + lib/data 结构化数据
        ↓
Fumadocs / Next.js 页面和 React 交互组件
        ↓
Docker 镜像部署到 staging / production
```

关键目录职责：

| 路径 | 职责 |
| --- | --- |
| `content/docs/(personal)/japanese-n2` | 网站实际展示的日语 N2 内容主版本 |
| `components` | MDX 可用的交互组件，例如听力播放器 |
| `lib/data` | 前端直接 import 的结构化学习数据和播放器 manifest |
| `public` | 浏览器可直接请求的静态资源，例如拆分后的 MP3 |
| `scripts` | 内容生成、校验、部署和辅助创建脚本 |
| `docs/features/japanese-n2` | 已实现内容能力的维护手册 |
| `docs/features/fumadocs` | 当前可执行的运行、部署和自动化手册 |
| `docs/architecture` | 跨功能的架构方案、治理模型和未来状态 |
| `docs/reviews` | 代码或应用配置变更轮次的 changelog 和审查记录 |

维护时先判断变更属于哪一层：

- 修改用户能看到的内容：改 `content/docs`，必要时更新 `meta.json`。
- 修改听力资源：先改源材料或生成规则，再运行生成命令，不直接手改生成产物。
- 修改播放器行为：改 `components`，并确认 JSON manifest 和页面仍兼容。
- 修改发布方式：优先更新 `docs/features/fumadocs/operations.md`；未来目标或治理
  决策放入 `docs/architecture`。

## 内容边界

- 根目录的以下文件是迁移时保留的原始归档：
  - `N2_Listening_To_Speaking_Notes.md`
  - `JLPT_N2_Comprehensive_Study_Notes.md`
- 网站使用的主版本位于 `content/docs/(personal)/japanese-n2`。
- 后续修改以网站主版本为准，不要求反向同步原始归档。

## 内容分组

内容分为两个互相引用、但不复制主内容的区域：

- `past-exams`：按考试年月归档原题、答案、音频、字幕和解析。
- 专项学习目录：按能力专题沉淀跨试卷复用的知识与训练，例如
  `listening-to-speaking`、`core-vocabulary-grammar`。

真题使用“考试年月 → 科目”，专项学习使用“专题 → 课次”。不要把整套真题
放入专项学习目录，也不要在真题目录复制专项总结。

## 目录约定

```text
content/docs/(personal)/japanese-n2/
├── index.mdx
├── meta.json
├── roadmap.mdx
├── past-exams/
│   ├── index.mdx
│   ├── meta.json
│   └── <yyyy-mm>/
│       ├── index.mdx
│       ├── meta.json
│       ├── vocabulary.mdx
│       ├── grammar.mdx
│       ├── reading.mdx
│       └── listening.mdx
└── <learning-topic>/
    ├── index.mdx
    ├── meta.json
    └── <number>-<stable-slug>.mdx
```

- 一次考试使用 `YYYY-MM` 目录，例如 `2024-07`。未收录科目只在考试
  `index.mdx` 的状态表中标记，不创建空页面。
- 真题科目文件固定使用 `vocabulary`、`grammar`、`reading`、`listening`，
  方便跨年份定位。
- 一个专项学习专题使用一个目录，例如 `listening-to-speaking`、
  `core-vocabulary-grammar`。
- 一个独立学习单元使用一个页面，避免长期维护单个超大文件。
- 文件名只使用小写字母、数字和连字符。
- 课次以两位数字开头，例如 `04-requesting-a-change.mdx`，保证自动导航顺序稳定。
- 页面标题可以使用中文或日文；文件名一旦发布不要随标题改变。

各级 `meta.json` 使用 `"..."` 自动收录剩余页面。增加课次时不需要手工更新导航。

新增一套真题时还要更新 `past-exams/index.mdx` 的考试目录和收录状态表。
完整度标准与实施优先级见站内
[`/docs/japanese-n2/roadmap`](/docs/japanese-n2/roadmap)。

## 创建同专题的新课

```bash
npm run note:new -- \
  --slug 04-requesting-a-change \
  --title "第四课：请求调整安排" \
  --description "学习说明原因、提出请求和确认调整结果"
```

命令默认在 `listening-to-speaking` 下创建页面，并拒绝覆盖已有文件。创建后填写模板中的各个章节。

为其他已有专题创建内容时指定目录：

```bash
npm run note:new -- \
  --section grammar \
  --slug 01-tori \
  --title "〜通り"
```

## 创建新专题

先创建专题目录及 `meta.json`：

```json
{
  "title": "语法",
  "description": "按功能和使用场景整理 N2 语法",
  "icon": "Blocks",
  "defaultOpen": false,
  "pages": ["index", "..."]
}
```

同时增加 `index.mdx` 作为专题说明和内容索引。上级目录会自动发现新专题。

## 听力资源入库和维护

### 当前实现范围

当前项目已经实现了“指定材料的字幕校准、音频拆分、manifest 生成和页面消费”
流程，可以通过项目命令重建 2024 年 7 月 JLPT N2 听力资源。

但它还不是通用导入器。现在不能直接执行类似
`npm run import-listening some.mp3 some.srt` 的命令来导入任意材料。现有脚本
针对 `2024-07` 写有明确的输入文件、输出目录、考试结构、题目 marker 和近似
时间。新增另一套考试材料时，需要先补对应的资源配置或把脚本产品化为通用
导入工具。

### 资源分层

2024 年 7 月 N2 听力使用以下分层：

| 文件或目录 | 类型 | 职责 | 维护方式 |
| --- | --- | --- | --- |
| `202407.mp3` | 源材料 | 完整听力音频 | 保留原件，不在生成过程中改写 |
| `2024年07月N2听力音频.raw.srt` | 源材料 | 原始 ASR 时间锚点 | 只作字幕校准输入 |
| `202407.txt` | 源材料 | 人工校订文本和标点 | 文本错误优先在这里或校正规则中修正 |
| `scripts/calibrate-listening-subtitles.py` | 生成规则 | 文本修正、完整句合并、停顿拆分、文本对齐和静音点校准 | 修改后必须重建并检查字幕 |
| `2024年07月N2听力音频.srt` | 生成物 | 校准后的 SRT | 由脚本生成，不直接手工修改 |
| `scripts/build-listening-exam.mjs` | 生成规则 | 定义题型、题目 marker、近似开始时间、输出路径，并拆分音频 | 新考试材料目前需要在这里补配置 |
| `public/audio/jlpt-n2/2024-07` | 生成物 | 浏览器播放的题目 MP3 切片 | 由脚本生成，不直接手工修改 |
| `lib/data/jlpt-n2-2024-07.json` | 生成物 | 播放器 manifest，包含 section、clip、音频路径和字幕 cue | 由脚本生成，不直接手工修改 |
| `content/docs/(personal)/japanese-n2/past-exams/2024-07/listening.mdx` | 页面入口 | 挂载听力播放器 | 页面内容很薄，主要由组件和 manifest 驱动 |
| `components/listening-practice.tsx` | 运行时组件 | 播放音频、渲染字幕、处理跳转、高亮和练习状态 | 改交互体验时维护 |

### 生成流程

完整链路如下：

```text
202407.mp3 + raw.srt + 202407.txt
        ↓ npm run subtitles:build
2024年07月N2听力音频.srt
        ↓ npm run subtitles:check
确认生成字幕与仓库内结果一致
        ↓ npm run audio:build
public/audio/jlpt-n2/2024-07/*.mp3
lib/data/jlpt-n2-2024-07.json
        ↓
ListeningPractice 页面运行时播放和显示字幕
```

命令职责：

```bash
npm run subtitles:build
npm run subtitles:check
npm run audio:build
```

- `subtitles:build` 读取原始 SRT、校订文本和完整音频，生成校准后的 SRT。
- `subtitles:check` 重新生成字幕内容并与仓库内 SRT 对比，防止生成物过期。
- `audio:build` 会先执行字幕 check，再读取校准后的 SRT 和完整音频，生成
  MP3 切片和 JSON manifest。

字幕生成器会拒绝文本对齐率过低、时间重叠、非正时长及过长字幕。音频生成器
按题号 marker 和近似时间寻找题目边界，不依赖会随字幕拆合而变化的 SRT 编号。

### 拆分逻辑

`scripts/build-listening-exam.mjs` 当前在代码中定义五个 section：

1. 课题理解
2. 要点理解
3. 概要理解
4. 即时应答
5. 综合理解

每个 section 包含：

- `startMarkers`：题号 marker 文本和近似开始秒数。
- `endMarker`：下一个 section 或结束位置。
- 输出 clip id：形如 `2024-01_1-1`。

生成脚本会在近似时间附近查找对应 marker cue，确定每题的开始和结束；随后用
`ffmpeg` 从完整音频切出 MP3，并把该题时间范围内的字幕 cue 转成相对时间写入
manifest。

### 前端消费方式

前端不直接加载 SRT，也没有单独的 `.vtt` 字幕文件。运行时使用两类资源：

- `<audio>` 的 `src` 指向 `public/audio` 生成的 MP3 路径，例如
  `/audio/jlpt-n2/2024-07/2024-01_1-1.mp3`。
- 字幕来自 `lib/data/jlpt-n2-2024-07.json` 中每个 clip 的 `cues` 数组。

`content/docs/(personal)/japanese-n2/past-exams/2024-07/listening.mdx` 只负责
挂载 `<ListeningPractice />`。组件 import JSON manifest 后，根据当前 clip 的
音频路径播放 MP3，根据 `cues` 渲染逐句字幕，并用播放器时间更新高亮状态。

### 新增另一套音频和字幕时

目前新增新材料不是只替换文件即可。最低需要完成：

1. 明确考试年月和 URL 目录，例如 `2025-12`。
2. 放入完整音频、原始字幕、校订文本或等价校订来源。
3. 为新材料定义输出目录和 manifest 文件，例如
   `public/audio/jlpt-n2/2025-12` 和 `lib/data/jlpt-n2-2025-12.json`。
4. 补充 section、题目 marker、近似开始时间和结束 marker。
5. 生成新的听力页面和考试索引，并更新 `meta.json`。
6. 运行字幕、音频、站点验证。
7. 在 staging 上人工验收播放器、字幕和题目边界。

如果以后要频繁导入新材料，应优先把当前脚本重构为配置驱动：

- 每套考试一个 manifest/config 输入文件。
- 脚本接收考试 id、音频路径、字幕路径和输出路径。
- section 和 marker 从配置读取，而不是写死在代码里。
- 生成命令输出标准验收摘要，便于 CI 和 changelog 记录。

这属于后续架构/产品化改造，不应在当前 runbook 中伪装成已经具备的能力。

### 修改和验收

修改校订文本或规则后执行：

```bash
npm run subtitles:build
npm run subtitles:check
npm run audio:build
npm run verify
```

如果改动会进入可见站点，再按运行手册走 staging 或 production 部署流程。

验收清单：

- 字幕命令没有报告对齐率、重叠、非正时长或过长字幕错误。
- `audio:build` 输出 clip 数量、section 数量和 subtitle cue 校验结果。
- `public/audio/jlpt-n2/2024-07` 中生成的 MP3 可以播放。
- `lib/data/jlpt-n2-2024-07.json` 中每个 clip 都有正确的 `audio` 和 `cues`。
- 听力页面能打开，题号切换、播放、暂停、变速、字幕显示和逐句跳转正常。
- 字幕高亮和实际音频没有明显错位。
- 部署后音频 Range 请求返回正常，避免浏览器拖动播放失败。

## 交互式真题页面

播放器等以操作为主、正文为辅的页面使用以下 frontmatter：

```yaml
---
title: 2024 年 7 月 JLPT N2 真题听力
description: 29 道听解练习
full: true
interactive: true
---
```

- `description` 仍用于搜索、页面元数据和分享卡片，但不在交互页标题下重复展示。
- `interactive: true` 会隐藏 Markdown 复制、查看选项和面包屑，并让正文区域
  使用桌面视口的剩余高度。
- 交互页保留上一篇和下一篇导航；播放器必须通过弹性高度为导航让出空间，
  不得使用固定的视口偏移量估算页面高度。
- 桌面端页面本身不应产生纵向滚动；题号条和字幕列表可以在组件内部滚动。
- 组件的主要列需要设置可收缩的宽高约束，例如 `min-width: 0` 和
  `min-height: 0`，确保侧边栏展开时不会撑破页面。
- 侧边栏折叠后，交互页不使用普通文档的最大宽度限制，播放器应随主区域等比
  变宽。
- 小于桌面断点时恢复自然页面高度和上下分栏，避免在窄屏中强行压缩操作区。

普通说明、解析和课程页面不要设置 `interactive: true`，继续使用标准文档
描述、复制工具、正文排版和页面滚动。

## 页面要求

以文字学习为主的页面至少包含：

1. YAML frontmatter 中的 `title` 和 `description`。
2. 明确的学习目标。
3. 原始材料或例句。
4. 逐句解析或规则说明。
5. 可以整体复用的核心语块。
6. 至少一个实际场景示例。
7. 要求学习者主动输出的练习。

日语正文使用日文字形，例如 `準備`、`書く`、`間`、`長い`，避免混入形似的简体中文字形。

## 验证

```bash
npm run verify
npm run build
```

重点人工检查：

- 页面是否出现在左侧导航。
- 上一页和下一页顺序是否正确。
- 交互页在侧边栏展开和折叠时是否都无页面级滚动，底部导航是否始终可见。
- 交互页的题号条和字幕是否只在各自区域内部滚动。
- 页面目录是否过深。
- 日语语块、中文关键词和英文技术词能否搜索，例如 `終わり次第`、`分工`
  和 `Ansible`。
- 移动端表格和长句是否容易阅读。
