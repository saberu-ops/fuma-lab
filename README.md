# Fuma Lab

基于 Next.js 和 Fumadocs 的个人文档站点，默认以不可变 Docker 镜像运行。
项目同时包含个人中文文档和一组可离线使用的 Fumadocs 官方英文文档快照。

当前能力：

- 搜索框下方提供 `个人文档` 与 `Fumadocs 参考` 两个原生 Layout Tab。
- 文档、搜索索引和静态资源均随镜像构建，运行时不依赖官网。
- 容器以非 root 用户运行，根文件系统只读，端口只绑定宿主机回环地址。
- 提供本地开发、快照完整性校验和受控的官网快照更新脚本。

## Docker 快速开始

要求 Docker Engine 和 Compose v2 插件。Docker 部署不要求宿主机安装 Node.js。

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

打开 <http://127.0.0.1:3000/docs>。正常状态应显示服务为 `healthy`。

查看日志或停止服务：

```bash
docker compose logs --tail=200 -f docs
docker compose down
```

详细的发布、回滚、备份、升级和故障处理步骤见
[运行手册](docs/features/fumadocs/operations.md)。

## 配置

| 变量 | 默认值 | 用途 | 何时生效 |
| --- | --- | --- | --- |
| `DOCS_PORT` | `3000` | 宿主机回环地址上的监听端口 | 重建容器 |
| `SITE_URL` | `http://localhost:3000` | 生成页面和 OG 元数据使用的公开基址 | 重新构建镜像 |

修改端口时应同时提供与访问地址一致的 `SITE_URL`：

```bash
DOCS_PORT=3100 SITE_URL=http://127.0.0.1:3100 \
  docker compose up -d --build
```

容器始终监听内部端口 `3000`。`SITE_URL` 会在构建阶段写入应用，修改后仅
`docker compose restart` 不会生效。

## 内容与语言

内容位于 `content/docs`：

- `content/docs/(personal)`：本项目维护的中文个人文档，URL 仍从 `/docs`
  开始，括号目录不会出现在路由中。
- `content/docs/(personal)/japanese-n2`：按专题和课次维护的日语 N2
  学习笔记，包含听力转口语精读，以及 32 个核心词汇和 13 个语法句型；
  入口为 `/docs/japanese-n2`。
- `content/docs/fumadocs`：23 篇精选官方英文文档的本地快照，入口为
  `/docs/fumadocs`。

本站没有自动翻译功能。`app/layout.tsx` 声明页面语言为 `zh-CN`，个人内容
本身以中文编写；离线参考内容本身是英文。站内搜索使用中日英混合分词，
支持检索连续的中文、日文语块和英文技术词。浏览器可能另外提供网页翻译。

修改个人文档或应用代码后，使用统一部署入口：

```bash
npm run deploy
```

该命令会在镜像内执行 lint、文档快照检查、类型检查和生产构建，保存当前运行
镜像作为回滚版本，切换容器后检查健康状态、页面、搜索和音频 Range 请求。
切换后的检查失败时会自动恢复上一镜像。只构建验证、不替换容器时运行
`npm run deploy:check`。未安装 Node.js/npm 的 Docker-only 宿主机可直接运行
`bash scripts/deploy.sh`。

在 Codex 中也可以直接输入 `$deploy-fuma-lab`。仓库级 Skill 和
`AGENTS.md` 会让 Codex 在完成可见内容或代码修改后使用同一部署入口；用户
明确要求不部署、只做审查或验证失败时除外。

首次加入或修改这些 Codex 配置后应新开会话，使 `AGENTS.md` 和项目规则重新
加载；项目级 `.codex` 配置仅在该仓库被信任时生效。

新增一篇听力转口语笔记：

```bash
npm run note:new -- \
  --slug 04-requesting-a-change \
  --title "第四课：请求调整安排"
```

目录约定、新专题创建方式和内容检查清单见
[日语 N2 内容维护指南](docs/features/japanese-n2/content-authoring.md)。

## 离线参考快照

正常构建和运行只读取已经提交的本地文件，不访问 Fumadocs 官网。验证快照
文件、固定白名单和 SHA-256 清单：

```bash
npm run docs:check
```

只有主动更新快照时才需要联网：

```bash
npm run docs:sync
git diff -- content/docs/fumadocs third_party/fumadocs/snapshot.json
npm run docs:check
```

更新后必须人工检查差异。来源、上游提交、获取时间和文件哈希记录在
`third_party/fumadocs/snapshot.json`；授权和修改说明见
[第三方声明](third_party/fumadocs/NOTICE.md)。

## 本地开发

要求 Node.js `>=24.14.0 <25`，项目固定的开发与容器版本为 `24.18.0`。

```bash
npm ci
npm run dev
```

打开 <http://localhost:3000/docs>。

## 验证

提交或部署内容、依赖及配置变更前运行：

```bash
npm run lint
npm run docs:check
npm run types:check
npm run build
docker compose config --quiet
```

## 目录

| 路径 | 作用 |
| --- | --- |
| `app` | Next.js 路由、页面布局、搜索及 LLM 文本接口 |
| `components`、`lib` | MDX 组件和 Fumadocs 数据源配置 |
| `content/docs` | 个人文档与离线参考快照 |
| `scripts` | 快照同步与完整性校验工具 |
| `third_party/fumadocs` | 上游许可证、声明和快照清单 |
| `Dockerfile`、`compose.yaml` | 不可变镜像和受限容器配置 |
| `docs/features/fumadocs` | 运维运行手册 |
| `docs/reviews` | 实施计划和变更记录 |

## 安全边界

当前基线不包含身份认证、TLS 或公网反向代理。Compose 只发布
`127.0.0.1:${DOCS_PORT}:3000`；不要改为 `0.0.0.0` 或直接暴露到公网。
需要远程访问时，应先在受控反向代理或私有网络层实现 TLS 和访问控制。
