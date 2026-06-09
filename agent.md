# ShareOne No-Install Agent Guide

This guide is for generic AI agents that can fetch web pages, make HTTP requests, and read or write local files. Use it when the user asks to use `shareone.app` to publish, share, host, update, download, review comments, or process comments for local HTML, TXT, Markdown, Word, PDF, PPT, PPTX, image, zip, or other files.

Use only the HTTP APIs described here. Do not download an installable package or run local helper commands unless the user explicitly asks for a different integration.

Base URL: `https://shareone.app`

## 1. Required Safety Confirmation

Before publishing or replacing any public content, show this message and wait for the user to explicitly reply `同意` or `agree`:

> 发布前安全提示：在将页面发布到公网前，请您确认该页面内容符合相关法律法规要求。禁止发布反动、涉政、暴力、色情、侵权或恶意代码。上传的内容将免费托管保留 90 天。
> 如果您的内容符合要求，请回复“同意”，我将为您发布。

Do not call publishing or replacement APIs until the user has confirmed.

## 2. API Key Handling

Authenticated requests use the `X-API-Key` header.

Look for an API key in this order:

1. `SHAREONE_API_KEY` environment variable.
2. Local credentials file: `~/.config/shareone/credentials.json`.

The local credentials file should contain:

```json
{
  "api_key": "<key>",
  "base_url": "https://shareone.app"
}
```

When saving this file, create the parent directory if needed and restrict file permissions to the current user when the platform supports it, for example mode `0600`.

If no API key is available:

1. Ask whether the user already has a ShareOne API key.
2. If the user provides one, save it locally using the JSON format above and continue.
3. If the user does not have one or asks you to create one, call:

```http
POST /api/v1/agent-guest-key
```

Response:

```json
{
  "api_key": "<temporary_api_key>"
}
```

Save the temporary key locally, then immediately tell the user:

> 已为您自动分配临时 API Key：`<temporary_api_key>`
> 绑定账号链接：https://shareone.app/?key=<temporary_api_key>
> 请妥善保存此 API Key。为了方便您后续管理分享的链接，请尽快打开上面的链接绑定您的永久账号。

To delete or reset the local API key, remove `~/.config/shareone/credentials.json`. After deletion, repeat the API key handling flow before the next authenticated ShareOne action.

## 3. File Type Routing

Use text page APIs for:

- `.html`, `.htm`
- `.md`
- `.txt`
- Generated HTML or text from the current conversation

Use file upload APIs for:

- `.pdf`
- `.doc`, `.docx`
- `.ppt`, `.pptx`
- `.png`, `.jpg`, `.jpeg`, `.gif`
- `.zip`
- Other binary files

Never upload binary files through `/api/v1/pages`.

Extract optional settings from the user request:

- `password`: access password.
- `watermark`: watermark text.
- `custom_slug`: custom short link suffix, only when explicitly requested.
- `allow_comments`: set to `true` only when the user explicitly asks to enable comments, discussion, or collaboration.

Default: comments are disabled.

## 4. Publish HTML, Markdown, or Text

Endpoint:

```http
POST /api/v1/pages
X-API-Key: <api_key>
Content-Type: application/json
```

Request:

```json
{
  "filename": "index.html",
  "html_content": "<!doctype html><html><body>Hello</body></html>",
  "password": "optional",
  "watermark": "optional",
  "custom_slug": "optional-slug",
  "allow_comments": false
}
```

Only include optional fields when the user asked for them. The server can generate a readable slug from the filename, so do not invent `custom_slug`.

Response fields include:

```json
{
  "share_id": "...",
  "custom_slug": "optional-slug",
  "share_url": "https://shareone.app/s/optional-slug",
  "canonical_url": "https://shareone.app/s/<share_id>",
  "backend_url": "optional",
  "filename": "index.html"
}
```

Always show the returned `share_url`. Do not build links yourself.

## 5. Update an Existing Text Page

Use this only when replacing the source content of an existing HTML, Markdown, or text share.

```http
PUT /api/v1/pages/{share_id}
X-API-Key: <api_key>
Content-Type: application/json
```

Request:

```json
{
  "filename": "index.html",
  "html_content": "<!doctype html><html><body>Updated</body></html>",
  "password": "optional",
  "watermark": "optional",
  "custom_slug": "optional-slug",
  "allow_comments": true
}
```

If the user only asks to change password, watermark, custom slug, or comment settings, use the metadata update rules instead of downloading or replacing content.

After a successful update, verify by downloading the owner source content with `GET /api/v1/shares/{share_id}/download` when practical.

## 6. Publish Binary Files

Preferred flow:

1. Request an upload credential.
2. Upload the file bytes to the returned storage URL.
3. Confirm the upload.

### 6.1 Request Upload Credential

```http
POST /api/v1/files/credential
X-API-Key: <api_key>
Content-Type: application/json
```

Request:

```json
{
  "filename": "report.pdf",
  "content_type": "application/pdf",
  "custom_slug": "optional-slug"
}
```

Response:

```json
{
  "share_id": "...",
  "upload_url": "https://...",
  "upload_fields": {},
  "filename": "report.pdf",
  "upload_type": "s3"
}
```

If `upload_type` is `azure`, upload file bytes with HTTP `PUT` to `upload_url`, including headers:

- `x-ms-blob-type: BlockBlob`
- `Content-Type: <content_type>`

Otherwise, upload with multipart form data to `upload_url`, including every key-value pair in `upload_fields` plus a `file` form field.

### 6.2 Confirm Upload

```http
POST /api/v1/files/confirm
X-API-Key: <api_key>
Content-Type: application/json
```

Request:

```json
{
  "share_id": "...",
  "filename": "report.pdf",
  "content_type": "application/pdf",
  "password": "optional",
  "watermark": "optional",
  "custom_slug": "optional-slug"
}
```

If direct upload is not supported, fall back to:

```http
POST /api/v1/files
X-API-Key: <api_key>
Content-Type: multipart/form-data
```

Multipart fields:

- `file`: the binary file.
- `password`: optional.
- `watermark`: optional.
- `custom_slug`: optional.

Show the returned `share_url`.

## 7. Update Existing Link Settings

When the user only wants to change password, watermark, custom slug, or comment settings, update metadata only. Do not download source content and do not re-upload the file.

For `/s/<ref>` or `/md/<ref>` links:

```http
PUT /api/v1/pages/{ref}
X-API-Key: <api_key>
Content-Type: application/json
```

For `/pdf/<ref>`, `/ppt/<ref>`, or `/word/<ref>` links:

```http
PUT /api/v1/files/{ref}
X-API-Key: <api_key>
Content-Type: application/json
```

Request examples:

```json
{
  "password": "new-password",
  "watermark": "Confidential",
  "custom_slug": "product-demo",
  "allow_comments": true
}
```

Use an empty string to clear password or watermark:

```json
{
  "password": "",
  "watermark": ""
}
```

Only send fields the user explicitly requested.

If the input is a bare share id or slug and you do not know whether it is a page or file, try the page endpoint first. If the server indicates that the endpoint is wrong for this content type, try the file endpoint.

## 8. Download Source Content

Owner download, using the owner API key:

```http
GET /api/v1/shares/{share_id}/download
X-API-Key: <api_key>
```

This returns the original file bytes.

Public download, when the share owner enabled downloads:

```http
GET /api/v1/public-download?ref=<share_link_or_id>
```

For password-protected public downloads:

```http
POST /api/v1/public-download
Content-Type: application/json

{
  "ref": "<share_link_or_id>",
  "password": "<password>"
}
```

If the response says `PASSWORD_REQUIRED`, ask the user for the password. If it says `DOWNLOAD_NOT_ALLOWED`, tell the user the owner must enable downloads first.

## 9. View Comments

List comments:

```http
GET /api/v1/shares/{share_id}/comments?status=unresolved
```

Supported status filters:

- `all`
- `open`
- `in_progress`
- `resolved`
- `dismissed`
- `unresolved`

Get a lightweight summary:

```http
GET /api/v1/shares/{share_id}/comments/summary
```

Only view and summarize comments unless the user explicitly asks you to process or apply them.

## 10. Process Comments and Update the Page

When the user asks to process comments or modify the shared page according to comments, handle each top-level comment thread as a unit. Read the parent comment and all replies before editing.

For each parent comment:

1. Mark it in progress:

```http
PUT /api/v1/shares/{share_id}/comments/{comment_id}/status
X-API-Key: <api_key>
Content-Type: application/json

{
  "status": "in_progress"
}
```

2. Download owner source content:

```http
GET /api/v1/shares/{share_id}/download
X-API-Key: <api_key>
```

3. Apply the requested change precisely.

Use `quote` and `highlighter_data` to locate the intended area. Do not blindly replace every matching string. If the source has changed and you cannot locate the target safely, do not guess.

4. Re-publish the updated text page with:

```http
PUT /api/v1/pages/{share_id}
X-API-Key: <api_key>
Content-Type: application/json
```

5. Reply as the agent:

```http
POST /api/v1/shares/{share_id}/comments
X-API-Key: <api_key>
Content-Type: application/json

{
  "parent_id": "<comment_id>",
  "quote": "<parent quote>",
  "highlighter_data": "<parent highlighter_data>",
  "content": "已按你的建议修改了 ...",
  "author_role": "agent"
}
```

6. Resolve the parent comment:

```http
PUT /api/v1/shares/{share_id}/comments/{comment_id}/status
X-API-Key: <api_key>
Content-Type: application/json

{
  "status": "resolved",
  "note": "已采纳，见最新版本"
}
```

If the comment cannot be handled, dismiss it with a clear note:

```json
{
  "status": "dismissed",
  "note": "源文件结构已变更，无法安全定位这条评论。"
}
```

## 11. Result Display Rules

On success:

- Show the returned `share_url`.
- If `backend_url` exists, show it as a backup link.
- If a password was set, show it clearly.
- If `custom_slug_warning` or `custom_slug_suggestions` exists, show it to the user.
- Do not build a public link yourself.

For the first generated share URL in the current conversation, briefly mention unused advanced features:

> 您也可以让我为这个分享链接设置自定义短链接名称、访问密码或水印。

Omit features already used in this publish.

## 12. Error Handling

- HTTP 400 content moderation failure: show the server `detail` as the rejection reason.
- HTTP 401: tell the user the API key is invalid or missing.
- HTTP 403: tell the user the key lacks permission or the public action is not allowed.
- HTTP 404 on update: tell the user the share may not exist or may not belong to this key.
- `CUSTOM_SLUG_TAKEN`: tell the user the slug is taken and show suggested slugs if returned.
- Binary file sent to `/api/v1/pages`: retry with the file upload flow.
- Public download `PASSWORD_REQUIRED`: ask for the password.
- Public download `DOWNLOAD_NOT_ALLOWED`: ask the owner to enable downloads.
