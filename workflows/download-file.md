# 下载 ShareOne 链接文件

当用户要求“下载这个 ShareOne 链接的文件”或“取回这个链接的源内容”时读取本文件。执行前必须已经完成 `environment-and-credentials.md`。

## 1. 获取 share_id

从用户提供的 ShareOne 链接 `https://shareone.app/s/<share_id>` 中提取 `<share_id>`。

## 2. 下载内容

调用：

```bash
node scripts/shareone_api_request.js "/api/v1/shares/<SHARE_ID>/download"
```

返回通常包含：

```json
{ "content": "...", "filename": "...", "content_type": "..." }
```

## 3. 后续处理

- 如果用户只是要求下载或查看，展示下载结果摘要，并按返回的 `filename` 和 `content_type` 说明内容类型。
- 如果用户要求修改下载到的内容，先保存源内容到本地文件，再根据文件类型读取 `publish-text-page.md` 或 `publish-binary-file.md` 执行更新。
- Sudowork 环境不要传 `--api-key`。
- 普通 AI Agent 环境可传 `--api-key`，也可以依赖 `SHAREONE_API_KEY` 或本地凭证。
