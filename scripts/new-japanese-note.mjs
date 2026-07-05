import { access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const notesRoot = path.join(
  repoRoot,
  'content',
  'docs',
  '(personal)',
  'japanese-n2',
);

function printUsage() {
  console.log(`创建日语 N2 笔记页面

用法：
  npm run note:new -- --slug <slug> --title <标题> [选项]

选项：
  --section <目录>       专题目录，默认 listening-to-speaking
  --description <描述>  页面描述
  --help                显示帮助

示例：
  npm run note:new -- \\
    --slug 04-requesting-a-change \\
    --title "第四课：请求调整安排"`);
}

function requireValue(value, option) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`缺少必填参数 ${option}`);
  }
  return normalized;
}

async function main() {
  const { values } = parseArgs({
    options: {
      section: {
        type: 'string',
        default: 'listening-to-speaking',
      },
      slug: {
        type: 'string',
      },
      title: {
        type: 'string',
      },
      description: {
        type: 'string',
      },
      help: {
        type: 'boolean',
        default: false,
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const section = requireValue(values.section, '--section');
  const slug = requireValue(values.slug, '--slug');
  const title = requireValue(values.title, '--title');
  const description =
    values.description?.trim() || `日语 N2 学习笔记：${title}`;

  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugPattern.test(section)) {
    throw new Error('--section 只能包含小写字母、数字和单个连字符');
  }
  if (!slugPattern.test(slug)) {
    throw new Error('--slug 只能包含小写字母、数字和单个连字符');
  }

  const sectionRoot = path.join(notesRoot, section);
  try {
    await access(path.join(sectionRoot, 'meta.json'), constants.R_OK);
  } catch {
    throw new Error(
      `专题目录 ${section} 不存在或缺少 meta.json；请先按内容维护指南创建专题`,
    );
  }

  const target = path.join(sectionRoot, `${slug}.mdx`);
  const content = `---
title: ${JSON.stringify(title)}
description: ${JSON.stringify(description)}
---

## 学习目标

-

## 原文呈现

>

## 逐句解析与翻译

1. **「」**

   - **翻译**：
   - **作用**：

## 核心语块拆解

**核心语块：** \`\`（）

-

## TPO 替换与进阶

| 场景 | 表达 |
| --- | --- |
| Casual（熟人、平辈） |  |
| Business（上级、正式职场） |  |

## 实际场景平移

>

## 输出练习

-
`;

  await writeFile(target, content, {
    encoding: 'utf8',
    flag: 'wx',
  });

  console.log(`已创建 ${path.relative(repoRoot, target)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
