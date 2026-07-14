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
- "让别人一起编辑这个页面"
- "分享编辑权限给同事"
- "对方怎么拿 API Key？"

如果用户要求添加或移除协作者但没有提供协作者的 API Key，按第 6 节引导对方获取 key。

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

## 6. 协作者如何获取 API Key

当 owner 要添加协作者但对方还没有 API Key 时，按以下场景引导：

### 对方有 AI Agent 且安装了 ShareOne skill

让对方的 agent 执行 `ensure_credentials.js`（或 `ensure_credentials.js --create-guest`）获取 API Key，然后把 key 告诉 owner。owner 用该 key 作为 `--api-keys` 参数添加协作者。

### 对方没有 AI Agent

Owner 的 agent 可以代替对方创建 guest key。**必须使用 `--no-save`**，否则会覆盖 owner 自己的 API Key：

```bash
node scripts/create_guest_key.js --no-save
```

将返回的 `GUEST_KEY_CREATED:<api_key>` 中的 key 用于添加协作者，并把 key 发送给对方保存。`--no-save` 表示只创建不保存到本地凭据，避免覆盖 owner 的 key。

### 协作者拿到权限后能做什么

- **下载**：用自己的 API Key 调用 `GET /api/v1/shares/{share_id}/download` 下载源内容
- **编辑更新**：修改内容后用 `PUT /api/v1/pages/{share_id}` 上传更新（只能改内容，不能改密码、水印等设置）
- **处理评论**：可以解决或关闭评论

### 建议对方绑定邮箱

添加协作者成功后，如果对方使用的是 guest key，建议提醒对方绑定邮箱（按 `workflows/bind-account.md` 流程），以便后续在网站上管理文件。
