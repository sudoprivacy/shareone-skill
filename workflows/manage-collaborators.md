# 管理 ShareOne 链接的协作者

当用户要求添加或移除协作者、查看协作者列表或检查谁有权限访问某个 ShareOne 链接时读取本文件。执行前必须已经完成 `environment-and-credentials.md`。

本 workflow 只管理协作者权限，不修改内容、水印、密码等元数据。

## 1. 判断是否适用

适用示例：

- "给这个 ShareOne 链接添加协作者：https://shareone.app/s/xxx"
- "Add a collaborator to this share"
- "列出这个分享链接的协作者"
- "移除这个链接的某个协作者"
- "谁有权限访问这个分享链接？"

如果用户要求添加或移除协作者但没有提供协作者的 API Key，先询问协作者的 API Key。

## 2. 不要做的事

- 不要下载源文件。
- 不要修改页面内容或元数据（水印、密码等）。
- 不要使用 `upload_page.js` 或 `update_share_settings.js`。

## 3. 管理命令

### 列出协作者

```bash
node scripts/manage_collaborators.js "<SHARE_LINK_OR_ID>" --action list
```

### 添加协作者

```bash
node scripts/manage_collaborators.js "<SHARE_LINK_OR_ID>" --action add --api-keys "key1,key2"
```

### 移除协作者

```bash
node scripts/manage_collaborators.js "<SHARE_LINK_OR_ID>" --action remove --api-keys "key1,key2"
```

规则：

- Sudowork 环境不要传 `--api-key`。
- 普通 AI Agent 环境可传 `--api-key`，也可以依赖 `SHAREONE_API_KEY` 或本地凭证。
- `--api-keys` 参数为要添加或移除的协作者的 API Key，多个用逗号分隔。
- 脚本会自动从完整 URL、`/s/<ref>` 路径、裸 `share_id` 或 slug 中解析目标。

## 4. 结果解读

- `--action list`：返回当前协作者列表的 JSON。
- `--action add`：返回添加后的结果 JSON，确认哪些协作者已成功添加。
- `--action remove`：返回移除后的结果 JSON，确认哪些协作者已成功移除。

## 5. 下一步

执行完成后读取 `result-and-errors.md`，按返回 JSON 展示结果或错误。
