# Fumadocs Personal

基于 Next.js 和 Fumadocs 的个人文档站点。应用以不可变 Docker 镜像运行，
文档源文件保存在 `content/docs`。

## 本地开发

需要 Node.js 24.14 或更高的 24.x 版本。

```bash
npm ci
npm run dev
```

打开 <http://localhost:3000/docs>。

## 内容分区与语言

搜索框下方的下拉框来自 Fumadocs Layout Tabs，目前包含：

- `个人文档`：本项目直接维护的中文内容。
- `Fumadocs 参考`：精选官方文档的英文离线快照。

本站没有自动翻译功能。`app/layout.tsx` 中的 `lang="zh-CN"` 声明默认页面语言，
Fumadocs 内置界面和搜索分词仍采用英语。

## 离线参考快照

正常构建和运行只读取已经提交的本地文件，不会访问 Fumadocs 官网。

验证快照文件与清单哈希：

```bash
npm run docs:check
```

主动联网更新 23 篇精选页面：

```bash
npm run docs:sync
```

更新操作使用固定页面白名单。完成后必须检查内容差异并重新运行所有验证。
来源、提交版本和文件哈希记录在 `third_party/fumadocs/snapshot.json`，上游
MIT 许可证保存在 `third_party/fumadocs/LICENSE`。

## Docker 部署

```bash
docker compose up -d --build
docker compose ps
```

站点仅监听宿主机回环地址：

```text
http://127.0.0.1:3000/docs
```

可通过 `DOCS_PORT` 修改宿主机端口：

```bash
DOCS_PORT=3100 docker compose up -d
```

如果通过域名访问，请在构建时设置公开地址，以生成正确的 OG 元数据：

```bash
SITE_URL=https://docs.example.com docker compose up -d --build
```

查看日志或停止服务：

```bash
docker compose logs -f docs
docker compose down
```

容器没有内容卷。修改 `content/docs` 后，需要重新构建镜像：

```bash
docker compose up -d --build
```

## 验证

```bash
npm run lint
npm run docs:check
npm run types:check
npm run build
docker compose config --quiet
```

认证、TLS 和公网反向代理不属于当前基线。不要在未增加访问控制的情况下
直接把端口暴露到公网。
