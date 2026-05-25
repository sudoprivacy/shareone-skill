# 发布或更新文本/HTML 页面

当用户要发布对话、大段文本、代码、HTML、Markdown 或纯文本时读取本文件。发布前必须已经完成 `environment-and-credentials.md`。

适用文件类型：`.html`、`.md`、`.txt`。

不适用文件类型：`.ppt`、`.pptx`、`.pdf`、`.doc`、`.docx`、图片、zip 或其他二进制文件。遇到这些文件时，立即停止本 workflow，改读 `publish-binary-file.md`。不要使用 `upload_page.js` 发布二进制文件。

## 1. 识别目标内容

- 如果用户要求分享对话、大段文本或代码：从对话历史中提取上一轮生成的完整文本或代码块，保存到当前目录下的临时文件，例如 `share_note.md` 或 `share_note.html`。
- 如果是 Markdown 内容：建议在保存为 `.html` 前使用简单 HTML 模板包裹；如果无法确定后端是否渲染 Markdown，优先生成美观的 `.html` 文件。
- 对于提取的对话、大段文字或独立代码块，建议包装为带基础样式的美观 HTML，以保证展示效果。
- 如果用户指定了文件：使用用户指定的文件。
- 如果用户没有指定文件：根据上下文寻找最近一次生成或编辑的文本/HTML 文件，例如 `.html`、`.md`、`.txt`，或将对话/代码包装成 `.html`。
- 如果锁定的文件不存在，停止并告知用户。
- 如果锁定的文件是 `.ppt`、`.pptx`、`.pdf`、`.doc`、`.docx`、图片、zip 或其他二进制文件，停止本 workflow，改读 `publish-binary-file.md`。
- 提取用户可能要求的密码 (`password`) 和水印 (`watermark`)。

## 2. 发布前安全确认

发布前安全提示由入口 `SKILL.md` 统一描述。未展示入口安全提示并获得用户明确回复“同意”或 `agree` 前，不得执行本文件中的发布命令。

## 3. 判断创建还是更新

检查对话上下文。如果当前会话中已经为同一个文件生成过 ShareOne 链接，提取之前的 `share_id`（16 位字符串）并执行 PUT 更新。

- 有 `share_id`：执行更新。
- 没有 `share_id`：执行首次创建。

## 4. 文本页面发布规则

为了最大兼容性，推荐使用本 skill 的 Node.js 脚本发起 HTTP 请求。

`upload_page.js` 只用于 `.html`、`.md`、`.txt` 或已经包装成 HTML 的文本内容。

不要通过 pages JSON 接口上传任何二进制文件，例如 `.ppt`、`.pptx`、`.doc`、`.docx`、`.pdf`、`.zip`、`.png`。如果看到 `400 Bad Request` 且提示检测到二进制内容，立即改用 `publish-binary-file.md` 中的 `/api/v1/files` 流程重新上传。

接口：`https://shareone.app/api/v1/pages`

格式：`application/json`

## 5. 首次创建 (POST)

执行：

```bash
node scripts/upload_page.js "<YOUR_FILE_PATH>" --filename "YOUR_FILE_NAME" [--password "OPTIONAL_PASSWORD"] [--watermark "OPTIONAL_WATERMARK"] [--allow-comments true]
```

规则：

- Sudowork 环境不要传 `--api-key`。
- 普通 AI Agent 环境可传 `--api-key`，也可以依赖 `SHAREONE_API_KEY` 或本地凭证。
- 只有当用户明确要求“开启评论”、“允许讨论”、“协同模式”等时，才加 `--allow-comments true`。
- 默认不开启评论。

## 6. 更新已有链接 (PUT)

执行：

```bash
node scripts/upload_page.js "<YOUR_FILE_PATH>" --filename "YOUR_FILE_NAME" --share-id <YOUR_SHARE_ID> [--password "OPTIONAL_PASSWORD"] [--watermark "OPTIONAL_WATERMARK"] [--allow-comments true/false]
```

规则：

- Sudowork 环境不要传 `--api-key`。
- 如果用户要求关闭评论协同或开启评论协同，可以在 PUT 更新时传入 `--allow-comments false` 或 `--allow-comments true`。
- 如果用户要求修改或清除密码/水印，可以传入 `--password` 或 `--watermark`。
- 空字符串 `""` 表示清除对应设置。

## 7. 下一步

执行完成后读取 `result-and-errors.md`，按返回 JSON 展示结果或错误。
