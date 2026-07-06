# 日语 N2 内容维护指南

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

## 维护真题字幕

2024 年 7 月 N2 听力使用以下分层：

- `2024年07月N2听力音频.raw.srt`：原始 ASR 时间锚点，只作输入。
- `202407.txt`：校订文本片段，只作输入。
- `scripts/calibrate-listening-subtitles.py`：文字修正、完整句合并、长句停顿
  拆分、文本对齐和静音点校准规则。
- `2024年07月N2听力音频.srt`：生成结果，不直接手工修改。
- `lib/data/jlpt-n2-2024-07.json` 和 `public/audio/jlpt-n2/2024-07`：
  播放器数据与音频片段，不直接手工修改。
- 网站页面：
  `content/docs/(personal)/japanese-n2/past-exams/2024-07/listening.mdx`。

修改校订文本或规则后执行：

```bash
npm run subtitles:build
npm run subtitles:check
npm run audio:build
npm run deploy
```

字幕生成器会拒绝文本对齐率过低、时间重叠、非正时长及过长字幕。音频生成器
按题号和近似时间寻找题目边界，不依赖会随字幕拆合而变化的 SRT 编号。

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
npm run lint
npm run types:check
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
