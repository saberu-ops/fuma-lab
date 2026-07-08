# Fuma Lab 设计方案资料 · Design Artifact

- 类型：探索 / 设计归纳（explore）
- 归纳来源：`README.md`、`CLAUDE.md`、`docs/reviews/*`、`lib/source.ts`、
  `lib/search-tokenizer.ts`、`scripts/*`、`package.json`
- 日期：2026-07-05
- 配套可视化：同目录 `design-artifact.html`（可作为 Artifact 发布）

一句话论点：**以不可变 Docker 镜像运行的个人文档站——内容即代码，离线优先，
中日英同源检索；一处编写，构建即封存，部署可回滚。**

关键事实：运行时形态为不可变镜像；2 个原生文档 Tab；23 篇离线参考快照带
SHA-256 清单；运行时对上游文档网络依赖为 0。

---

## 01 · 四本设计支柱

四个关注点相互正交，任意一个都可独立演进而不牵动其余。

| 支柱 | 内容 |
| --- | --- |
| **内容 · 双根内容体系** | 搜索框下方两个 Fumadocs 原生 Layout Tab。`(personal)` 中文个人文档，路由组括号不进 URL，入口仍从 `/docs` 起；日语 N2 学习区（核心词汇语法 + 听力转口语精读）；`fumadocs` 官方英文参考快照，入口 `/docs/fumadocs`。 |
| **参考 · 可校验离线快照** | 23 篇精选官方文档随镜像构建，正常构建与运行不访问官网。固定白名单 + SHA-256 清单锁定于 `third_party/fumadocs/snapshot.json`。`docs:sync` 是唯一联网动作（更新后需人工审阅差异），`docs:check` 校验文件、白名单与哈希一致。 |
| **检索 · 中日英混合分词** | 本地 `mixed-cjk` 分词器补足 Orama 内置分词器不切分 CJK 的缺口：CJK 文本索引为重叠二元组（单字则一元组），拉丁词整体保留，先做 NFKC 归一化并小写。 |
| **部署 · 封存式容器发布** | 非 root 标准镜像，只读根文件系统，端口仅绑定宿主回环地址。单一入口 `npm run deploy` 完成校验、发布、验证、回滚；切换后自检失败自动恢复上一镜像；Codex 通过 `$deploy-fuma-lab` Skill 复用同一入口。 |

## 02 · 构建时与运行时的分界

所有对上游与工具链的依赖都被推到构建时；运行时只读取已封存进镜像的静态产物。

**构建时（Build-time）**

1. MDX 内容 + 参考快照（`content/docs` · `third_party/fumadocs`）
2. fumadocs-mdx 编译 + 搜索索引（`lib/source.ts` · `mixed-cjk` tokenizer）
3. 听力数据与音频切片（`calibrate-listening-subtitles.py` → `build-listening-exam.mjs`）
4. `next build` 标准产物（`verify` = lint · docs:check · types:check）

**运行时（Runtime）**

1. 只读根文件系统容器（non-root · cap-drop · no-new-privileges）
2. 静态页面与本地搜索（`/docs` · `/docs/fumadocs` · 站内索引）
3. 音频按 Range 分发（`public/audio/jlpt-n2` · HTTP 206）
4. 回环端口发布（`127.0.0.1:${DOCS_PORT}:3000`）

> 运行时对上游文档的网络依赖为 **ZERO**；唯一联网动作是显式的 `npm run docs:sync`。

## 03 · 内容分类体系

个人根以「专题 → 课次」组织、可扩展；参考根是固定的官方文档子集。路由组
`(personal)` 只做组织、不出现在地址中。

```
content/docs/
├─ meta.json                        # 顶层排序
├─ (personal)/                      # 中文 · 不进 URL
│  └─ japanese-n2/
│     ├─ core-vocabulary-grammar/
│     │  ├─ 01–03  词汇 · 32 个核心词
│     │  └─ 04–06  语法 · 13 个句型
│     └─ listening-to-speaking/
│        ├─ 01–03      听力转口语精读
│        └─ 2024-july  听力真题 + 播放器
└─ fumadocs/                        # 英文参考快照
   ├─ ui/ · mdx/ · search/
   ├─ guides/ · integrations/
   └─ deploying/ · i18n/            # 共 23 篇
```

- **个人根 japanese-n2**：围绕 JLPT N2 备考。核心词汇语法区把 32 个核心词与
  13 个语法句型拆到六课；听力转口语区把真题音频作精读，配一个课内听力练习组件。
- **参考根 fumadocs**：官方文档的 23 篇精选英文快照，覆盖 UI、MDX、搜索、
  集成、部署与国际化。
- **扩展方式**：新增听力转口语笔记走 `npm run note:new` 脚手架，保证目录约定与
  页面结构一致；新专题遵循同一「专题 / `meta.json` / 课次」骨架。

## 04 · 混合分词的一次实测

拉丁词整体保留，CJK 连续块切成重叠二元组——既能命中中日文语块，又不像整段
匹配那样把结果放得过宽。

- 输入：`日本語 N2 文法`
- CJK 段：`日本` · `本語` · `文法`（重叠 bigram）
- 拉丁/数字：`n2`（整体保留、小写）
- 规则链：NFKC 归一化 → toLowerCase → 连续 CJK 切重叠 bigram（单字 → unigram）
  → 拉丁词整体保留

依据：`lib/search-tokenizer.ts`。Orama 内置语言分词器不切分中文或日文，故用
本地 `mixed-cjk` 分词器兼顾中文、日文语块与英文技术词。

## 05 · 听力真题数据管线

把两份不可直接使用的字幕源对齐成可用整句字幕，再切成练习片段：保留真实时间轴
的粗 ASR（342 段），与措辞更好但时间轴另属一版、且自源 cue 470 起有一分钟
时间戳错误的转写。

- **校准 · `calibrate-listening-subtitles.py`**：套用审阅措辞；把短语拼成整句
  与应答；保留题号与选项为语义单元；仅在日文逗号停顿处按 44 字上限切分长句；
  以 0.967 相似度对齐两条文本流；用 439 个可靠文本/时间锚点与 1,121 个检测
  停顿把边界映射回真实录音；拒绝重叠、非正时长、超 18 秒等异常 cue。
- **成片 · `build-listening-exam.mjs`**：直接解析并校验标准 SRT；从 342 条源
  cue 生成数据与音频，配置边界外的 cue 被排除。

产物：

- `lib/data/jlpt-n2-2024-07.json`：29 个练习片段 · 264 条 cue
- `public/audio/jlpt-n2/2024-07/*.mp3`：时长 2,293.8 s · 体积 ≈ 22.9 MB
- 运行时：`components/listening-practice.tsx`，音频按 HTTP Range 请求

## 06 · 确定性部署管线

`npm run deploy`（即 `scripts/deploy.sh`）的八段顺序——每一步是下一步的前提，
任一后置检查失败即自动回滚。编号即真实执行次序。

1. 取得独占部署锁（跨进程锁，避免并发发布互相踩踏）
2. 校验 Compose 配置，以及已暂存/未暂存跟踪改动的空白规范
3. 把正在运行的镜像打上带时间戳的回滚标签
4. 构建新镜像（Docker 构建内部运行 `npm run verify` 与 `npm run build`）
5. 只替换 `docs` 服务并等待其健康检查通过
6. 确认运行时隔离：镜像 ID、非 root/只读、已丢弃能力、`no-new-privileges`、
   PID 上限
7. 冒烟测试：文档根、日语 N2 页、搜索与音频字节范围
8. 任一切换后步骤失败，自动恢复并验证上一镜像

Codex 集成：`.agents/skills/deploy-fuma-lab/`（`$deploy-fuma-lab` Skill）、
`AGENTS.md`（可见改动后的默认完成步骤）、`.codex/rules/deploy.rules`（只放行
受审的 `npm run deploy` 前缀离开沙箱）。

## 07 · 安全边界（当前基线）

基线刻意最小：只在受信宿主本机可达，把认证与传输安全留给受控代理层。这是一条
明确的设计约束，不是遗漏。

**基线已保证**

- 容器非 root 运行，根文件系统只读
- 丢弃 Linux 能力，`no-new-privileges`，限制 PID
- 仅发布 `127.0.0.1:${DOCS_PORT}:3000`
- 凭据永不入库，构建与运行离线

**基线不含 · 需上层补齐**

- 身份认证与访问控制
- TLS 与公网反向代理
- 不得改绑 `0.0.0.0` 或直接暴露公网
- 远程访问须先在受控代理/私网实现 TLS 与鉴权

## 08 · 未决的设计取舍

已知边界外、仍待与需求对齐的方向性选择（同步自 `CLAUDE.md` 开放决策）。

- 公开访问 vs 私有鉴权部署——是否引入认证层与其形态
- 反向代理与 TLS 提供方——承接远程访问的传输安全与入口
- Git/MDX 唯一 vs 引入 CMS——未来内容创作是否仍完全走仓库
- 混合中英内容是否转全量 i18n 路由——当前无自动翻译，页面语言声明为 `zh-CN`

---

## 技术栈

Next.js · fumadocs-core · fumadocs-mdx · fumadocs-ui · React · Node 24.18.0 ·
Orama search · oxlint · lucide-react · Docker（Compose v2）· Python（字幕校准）
