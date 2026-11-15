# 发布二进制文件

当用户要发布 PDF、PPTX、PPT 或 Word 文档时读取本文件。发布前必须已经完成 `environment-and-credentials.md`。

适用文件类型：`.pdf`、`.ppt`、`.pptx`、`.doc`、`.docx`。

如果用户说“发布这个 pptx / PPT / 演示文稿 / presentation”，必须使用本 workflow，不要读取 `publish-text-page.md`。发布命令统一是 `publish.js`，脚本会自动识别二进制文件并走直传通道。

`/s/<share_id>` 是最终给用户访问的分享链接，不是上传地址。不要向 `/s/<share_id>` 上传 PPTX/PPT/PDF/Word 文件。

## 1. 文件检查

- 使用用户指定的文件。
- 如果用户没有指定文件，根据上下文寻找最近一次生成或编辑的文件。
- 如果文件不存在，停止并告知用户。
- 提取用户可能要求的密码 (`password`)、水印 (`watermark`) 和自定义短链接后缀 (`slug`)。服务端会根据文件名自动生成可读的 slug，客户端无需主动设置。只有用户明确说”链接叫 xxx / 自定义短链接 xxx / URL 后缀 xxx”时才用 `--slug` 覆盖。

## 2. 发布前安全自检

发布前安全自检由入口 `SKILL.md` 统一描述：**创建新分享链接**前由 Agent 自行检查内容是否明显违规；自检通过后直接继续发布，不要展示安全提示，也不要等待用户回复“同意”或 `agree`。

二进制文件自检只看用户请求、文件名、扩展名和显式参数。不要为了自检提取 PDF/PPT/Word 正文、OCR、转换格式、生成预览或解析文件内部内容；直接走上传脚本，服务端审核负责深度内容检查。已有链接的后续设置更新按对应规则直接执行。

## 3. 首次发布二进制文件

为了最大兼容性，推荐使用本 skill 的 Node.js 脚本发起 HTTP 请求。

由于二进制文件可能较大，ShareOne 采用直传云存储方式，支持 S3 或 Azure。脚本会自动根据服务端返回的 `upload_type` 判断走 S3 表单上传还是 Azure PUT 直传。

首次发布 `.pptx`、`.ppt`、`.pdf` 或 Word 文档时，执行：

```bash
node scripts/publish.js "<FILE_PATH>" [--password "OPTIONAL_PASSWORD"] [--watermark "OPTIONAL_WATERMARK"] [--slug "OPTIONAL_SLUG"]
```

脚本会自动识别二进制文件并走直传通道（stderr 输出 `INFO:CHANNEL:binary`），创建新的 ShareOne 文件分享链接，并在结果中返回 `share_url`。

规则：

- Sudowork 环境不要传 `--api-key`。
- 普通 AI Agent 环境无需传 `--api-key`，脚本会自动读取 `SHAREONE_API_KEY` 或本地凭证。
- 二进制文件不支持 `--share-id` 和 `--allow-comments`（脚本会拒绝并提示）；上传后需要开评论时用 `update_share_settings.js` 设置。
- 如果服务端返回 `custom_slug_warning`，说明文件链接已生成但自定义短链接未生效。必须把提示展示给用户，并请用户提供新的 slug 或之后到管理页修改。

## 4. 更新已上传二进制链接的设置

对于已经上传的二进制文件，如果用户只要求修改密码、水印、自定义短链接或评论开关，本文件不适用：改读 `update-share-settings.md`，使用 `update_share_settings.js` 只更新元数据，不要手动拼 PUT 请求。

PDF/PPT content replacement still uses `publish.js` and creates a new link. Word
content replacement and base/recipient binding use the workflow below.

## Word base and recipient shares

Use `word_share.js` for `.doc` / `.docx` documents up to 16 MiB. Do not convert
Word to HTML to establish a reference. The API field is `remote_url`; a reference
to another ShareOne share is a **pointer share**.

1. Publish the generic Word base with `publish.js` without recipient-specific
   watermarks. Use the actual returned Word URL.
2. If a recipient share already exists, retain that URL. Otherwise publish the
   same Word file once with the requested recipient watermark.
3. Bind that recipient to the base:

```bash
node scripts/word_share.js "<RECIPIENT_WORD_URL>" --remote-url "<BASE_WORD_URL>"
```

Binding changes the content source, not the recipient's URL, watermark,
password, comments or download settings. The source must be a direct upload
owned by the same account, with link access and no password/email/review gate.
External binary sources, chains, self-references and implicit detaching are
rejected. The server stores the base's stable ID so changing its slug is safe.
Deleting the base withdraws its recipients too; tightening its access blocks
their public content delivery, including cached downloads. An active recipient
keeps an otherwise idle Word base from automatic expiry.

To update the base while preserving both URLs:

```bash
node scripts/word_share.js "<BASE_WORD_URL>" --file "<UPDATED_DOCX_PATH>"
node scripts/refresh_share.js "<RECIPIENT_WORD_URL>"
```

Replacement keeps the original filename and Word format. Update the base, not
the recipient's cached bytes. Repeat refresh for each recipient requiring an
immediate update; ordinary viewer visits refresh lazily with the existing
60-second throttle. Raw downloads serve the last accepted snapshot. Verify the
returned digest, original URL and recipient settings. Comments stay attached to
the original share but are not automatically reanchored. There is no separate
Word version-history or rollback API. A lost response requires reading back the
share before deciding whether to repeat a write.

`--dry-run` previews either operation without credentials or network access.
Online watermarks remain viewer overlays; they are not embedded in downloaded
Word files.

## 5. 下一步

执行完成后读取 `result-and-errors.md`，按返回 JSON 展示结果或错误。
