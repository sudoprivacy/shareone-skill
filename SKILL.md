---
name: shareone
version: 1.1.4
description: 发布本地生成的 HTML 网页、PDF、Word 或 PPTX 到 ShareOne 平台，生成公网分享短链接；或者当用户提供 ShareOne 链接并要求下载文件、修改文件、拉取/处理评论时使用此技能。当用户要求“发布”、“分享”、“生成链接”、“上线”，或者“下载这个链接的文件”、“修改这个 ShareOne 链接的内容”、“拉取这个链接的评论”时，必须使用此技能。
---

# AI Agent 技能：发布到 ShareOne (shareone)

这个 Skill 允许 AI Agent（如 Openclaw 等）将当前生成的历史会话以及 HTML/PDF/PPT 等文件发布到 ShareOne 线上托管服务，并为用户生成一个持久化的公网分享链接。

## 使用说明与触发条件

当用户表达出以下意图时，应主动使用此技能：

- "帮我把 `index.html` 发布到 ShareOne"
- "把我刚才生成的网页发布，给我个链接"
- "生成一个可分享的链接给我的团队看"
- "Upload this presentation to ShareOne and protect it with password 'secret'"
- "发布这个 PDF 到 ShareOne，并加上密码 1234"
- "把这个网页发布到 ShareOne，加上水印 '内部绝密'"
- "发布这份设计稿并开启协同评论模式"
- "用 shareone 分享上一轮对话"
- "把我刚才写的代码/大段文字分享出去"
- "Share your last response as a note"
- "帮我下载这个 ShareOne 链接的文件：https://shareone.app/s/xxx"
- "拉取一下这个链接的评论：https://shareone.app/s/xxx"
- "根据这个链接的评论修改页面：https://shareone.app/s/xxx"
- "修改这个 ShareOne 链接的内容：https://shareone.app/s/xxx"

## 总规则：先路由，再读取子流程

入口文件只负责判断用户意图、判断环境、选择需要阅读的 workflow。不要一次性读取所有 `workflows/*.md` 文件；只读取当前任务需要的子文件。

所有需要 ShareOne API 的操作，都先运行：

```bash
node scripts/check_api_key.js
```

用输出判断环境与凭据状态：

- `SUDOWORK_KEY_FOUND`：当前在 Sudowork 中，且 Sudowork 已配置 ShareOne API Key。
- `SUDOWORK_KEY_NOT_FOUND`：当前在 Sudowork 中，但还没有设置 ShareOne API Key。
- `KEY_FOUND:<api_key>`：当前是普通 AI Agent 环境，且已找到 API Key。
- `KEY_NOT_FOUND`：当前是普通 AI Agent 环境，且没有找到 API Key。

术语固定：

- Sudowork：发布、评论、通用请求命令不要传 `--api-key`，凭证由 Auth Proxy secrets 注入。
- 普通 AI Agent：可以使用 `--api-key`、环境变量 `SHAREONE_API_KEY` 或本地凭证文件。

## 操作路由表

根据用户意图读取对应 workflow：

先按目标文件类型路由，再按用户动作路由。文件类型优先级最高。

| 目标文件/内容类型 | 必须读取的 workflow |
| --- | --- |
| `.ppt`、`.pptx`、`.pdf`、`.doc`、`.docx`、`.png`、`.jpg`、`.jpeg`、`.gif`、`.zip` 或其他二进制文件 | `workflows/publish-binary-file.md` |
| `.html`、`.md`、`.txt`、对话内容、大段文本、代码块，或已经包装成 HTML 的内容 | `workflows/publish-text-page.md` |

| 用户意图 | 需要读取的 workflow |
| --- | --- |
| 发布、分享、生成链接、上线、分享上一轮对话、大段文本或代码 | 先读 `workflows/environment-and-credentials.md`，再按文件类型读 `workflows/publish-text-page.md` 或 `workflows/publish-binary-file.md`，最后读 `workflows/result-and-errors.md` |
| 删除、清除、移除、重置 ShareOne API Key | 读 `workflows/delete-api-key.md` |
| 下载 ShareOne 链接的文件或源内容 | 先读 `workflows/environment-and-credentials.md`，再读 `workflows/download-file.md` |
| 查看、拉取、总结 ShareOne 链接评论，但用户没有要求修改 | 先读 `workflows/environment-and-credentials.md`，再读 `workflows/comments-view.md` |
| 处理评论、根据评论修改页面、修复 ShareOne 链接内容 | 先读 `workflows/environment-and-credentials.md`，再读 `workflows/comments-process.md`，必要时读 `workflows/publish-text-page.md`，最后读 `workflows/result-and-errors.md` |
| 发布二进制文件，或更新已上传二进制文件的密码/水印 | 先读 `workflows/environment-and-credentials.md`，再读 `workflows/publish-binary-file.md`，最后读 `workflows/result-and-errors.md` |

## ShareOne 链接与 share_id

当用户提供 ShareOne 链接时，从 `https://shareone.app/s/<share_id>` 中提取 `<share_id>`。

`/s/<share_id>` 是最终给用户访问的分享链接，不是上传 API endpoint。不要把 `/s/<share_id>` 当作发布地址，也不要直接向 `/s/<share_id>` PUT/POST 文件。

`share_id` 可用于查看评论、处理评论、下载源文件、文本页面 PUT 更新，以及已上传二进制文件的密码/水印更新。

如果目标是 `.pptx`、`.ppt`、`.pdf`、Word、图片、zip 等二进制文件，“发布这个文件”默认必须走文件上传 workflow 和 `shareone_upload.js`。不要因为会话里存在旧的 `/s/<share_id>` 就改走文本页面 PUT；二进制文件内容上传不能使用 `upload_page.js`。

如果你在当前会话中已经为同一个文本/HTML 文件生成过 ShareOne 链接，可复用之前的 `share_id` 执行文本页面 PUT 更新；否则执行首次创建。

## 不要遗漏的全局约束

- 发布前必须完成凭据检查和必要的凭据配置。
- 每次发布前都必须展示以下安全提示，并等待用户明确回复“同意”或 `agree` 后才能继续：
  > 发布前安全提示：在将页面发布到公网前，请您确认该页面内容符合相关法律法规要求。禁止发布反动、涉政、暴力、色情、侵权或恶意代码。上传的内容将免费托管保留 90 天。
  > 如果您的内容符合要求，请回复“同意”，我将为您发布。
- 发布成功后必须直接使用接口或脚本返回的 `share_url`，不要自行拼接分享链接；如果返回中包含 `backend_url`，必须同时作为“备用链接”展示给用户。
- 如果用户要求开启评论、允许讨论或协同模式，才添加 `--allow-comments true`。默认不开启评论。
- 评论处理必须形成闭环：认领、修改、重新发布、回复、关闭或 dismiss。
