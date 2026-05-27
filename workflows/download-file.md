# 下载 ShareOne 链接文件

当用户要求“下载这个 ShareOne 链接的文件”或“取回这个链接的源内容”时读取本文件。执行前必须已经完成 `environment-and-credentials.md`。

## 1. 获取链接或 share_id

用户可以提供完整链接、`share_id`、自定义短链 slug，或 `/s/<share_id>` 这类路径。优先把用户原始输入作为 `ref` 传给公开下载接口；不需要自行判断 slug 和 share_id。

## 2. 下载内容

优先调用公开下载接口。该接口只允许下载 owner 已开启 `allow_download` 的链接：

```bash
node scripts/shareone_api_request.js "/api/v1/public-download?ref=<URL_ENCODED_LINK_OR_ID>" --public > downloaded-file
```

返回是原文件内容，不是 JSON。根据响应头里的文件名保存到本地文件，再按用户要求查看、总结或处理。

如果接口返回结构化错误：

```json
{
  "detail": {
    "code": "DOWNLOAD_NOT_ALLOWED",
    "message": "Downloads are not enabled for this link. Ask the owner to enable allow_download first."
  }
}
```

必须明确告诉用户：这个 ShareOne 链接没有开启允许下载，需要链接 owner 在文件管理中开启“允许下载”后才能让 agent 下载。

## 3. 后续处理

- 如果用户只是要求下载或查看，展示下载结果摘要，并按返回的文件名和 `content_type` 说明内容类型。
- 如果用户要求修改下载到的内容，先保存源内容到本地文件，再根据文件类型读取 `publish-text-page.md` 或 `publish-binary-file.md` 执行更新。
- 公开下载接口不需要 API Key。owner 拉取自己的未开放下载链接时，才使用 `/api/v1/shares/<SHARE_ID>/download` 并携带 API Key。
