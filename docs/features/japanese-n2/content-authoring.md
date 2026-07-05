# 日语 N2 内容维护指南

## 内容边界

- 根目录的以下文件是迁移时保留的原始归档：
  - `N2_Listening_To_Speaking_Notes.md`
  - `JLPT_N2_Comprehensive_Study_Notes.md`
- 网站使用的主版本位于 `content/docs/(personal)/japanese-n2`。
- 后续修改以网站主版本为准，不要求反向同步原始归档。

## 目录约定

```text
content/docs/(personal)/japanese-n2/
├── index.mdx
├── meta.json
└── <topic>/
    ├── index.mdx
    ├── meta.json
    └── <number>-<stable-slug>.mdx
```

- 一个专题使用一个目录，例如 `listening-to-speaking`、
  `core-vocabulary-grammar`。
- 一个独立学习单元使用一个页面，避免长期维护单个超大文件。
- 文件名只使用小写字母、数字和连字符。
- 课次以两位数字开头，例如 `04-requesting-a-change.mdx`，保证自动导航顺序稳定。
- 页面标题可以使用中文或日文；文件名一旦发布不要随标题改变。

各级 `meta.json` 使用 `"..."` 自动收录剩余页面。增加课次时不需要手工更新导航。

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

修改校订文本或规则后执行：

```bash
npm run subtitles:build
npm run subtitles:check
npm run audio:build
npm run deploy
```

字幕生成器会拒绝文本对齐率过低、时间重叠、非正时长及过长字幕。音频生成器
按题号和近似时间寻找题目边界，不依赖会随字幕拆合而变化的 SRT 编号。

## 页面要求

每页至少包含：

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
- 页面目录是否过深。
- 日语语块、中文关键词和英文技术词能否搜索，例如 `終わり次第`、`分工`
  和 `Ansible`。
- 移动端表格和长句是否容易阅读。
