---
name: shareone
version: 1.0.4
description: 发布本地生成的 HTML 网页、PDF 或 PPTX 到 ShareOne 平台，生成公网分享短链接（Capability URL）。当用户要求“发布”、“分享”、“生成链接”或“上线”某个生成的页面/文档时使用此技能。
---

# AI Agent 技能：发布到 ShareOne (shareone)

这个 Skill 允许 AI Agent（如Openclaw等）将当前生成的历史会话以及HTML/PDF/PPT等文件，自动发布到 ShareOne 线上托管服务，并为用户生成一个持久化的公网分享链接。

## 使用说明与触发条件

**如何触发 (Triggering):**
当用户表达出以下意图时，应主动调用此技能：

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

**前置条件 (Prerequisites):**
用户需要拥有 ShareOne 的 API 凭证 (API Key)。请确保已在环境变量中设置 `SHAREONE_API_KEY`。

---

## 核心执行指令 / Execution Instructions

当你被要求发布文件到 ShareOne 时，请**严格按照以下步骤执行**：

### 1. 识别目标与环境预检 (Identify & Pre-flight)

找出用户明确指定要发布的文件，或者提取对话内容：

- **如果用户要求分享对话/大段文本/代码**：请首先从你的对话历史中提取上一轮生成的完整文本或代码块。将其保存到当前目录下的一个临时文件中，例如 `share_note.md` 或 `share_note.html`。
  - **建议**：如果是 Markdown 格式内容，建议在保存为 `.html` 前，使用简单的 HTML 模板包裹它，或者在 ShareOne 后端支持 Markdown 渲染的情况下直接发送 Markdown。如果无法确定，优先生成美观的 `.html` 文件。
- **如果用户指定了文件**：使用用户指定的文件。如果用户没有指定，请根据上下文寻找你最近一次生成或编辑的文件（如 `.html`, `.pdf`, `.pptx`）。

- **校验文件是否存在**：如果你通过上述步骤生成或锁定了文件，但文件仍不存在，停止并告知用户。
- **获取或创建 API Key**：执行本技能目录下的 `check_api_key.js` 脚本，它会依次检查环境变量、本地配置文件。如果都没有找到，脚本会输出 `KEY_NOT_FOUND`。

```bash
node scripts/check_api_key.js
```

- **如果脚本输出 `KEY_FOUND:<api_key>`**：将该 API Key 用于后续的发布请求，直接进入第 2 步。
- **如果脚本输出 `KEY_NOT_FOUND`**：你**必须暂停发布流程**，并向用户询问是否已有 API Key：

  > 💡 **提示**：我没有找到您的 ShareOne API Key。
  > 请问您是否已经拥有 API Key？
  >
  > - 如果有，请直接回复您的 API Key（例如 `sk-xxx`），我将为您保存并继续发布。
  > - 如果没有，请回复“没有”或“创建”，我将自动为您创建一个临时 API Key。

- **根据用户的回复进行处理**：
  - **如果用户回复了 API Key (例如 `sk-xxx`)**：
    执行本技能目录下的 `save_api_key.js` 脚本将用户提供的 Key 保存到本地，然后使用该 Key 继续发布（进入第 2 步）：
    ```bash
    node scripts/save_api_key.js <用户提供的KEY>
    ```
  - **如果用户回复“没有”或“创建”**：
    执行本技能目录下的 `create_guest_key.js` 脚本调用接口创建临时 API Key 并保存到本地：

    ```bash
    node scripts/create_guest_key.js
    ```

    - **如果输出 `GUEST_KEY_CREATED:<api_key>`**：将该 API Key 用于后续的发布请求，并在回复用户时加入以下提示：
      > 💡 **提示**：已为您自动分配了临时 API Key：`<api_key>`。
      > 为了方便您后续管理分享的链接，请前往 [ShareOne 官网](https://shareone.app/?key=<api_key>) 绑定您的永久账号。
    - **如果输出 `ERROR:RATE_LIMIT_EXCEEDED`**：请暂停发布，并提示用户：
      > ❌ **获取临时凭证失败**
      > 您今天自动创建临时 API Key 的次数已达上限（每天最多5次）。请前往 [ShareOne 官网](https://shareone.app) 手动注册并获取 API Key。

### 2. 免责声明机制 (Smart Consent) - 必须执行 (MANDATORY)

每次发布前，你**必须**向用户展示安全提示，并等待用户明确回复“同意”或“agree”后才能继续：

> ⚠️ **发布前安全提示**
> 在将页面发布到公网前，请您确认该页面内容符合相关法律法规要求。禁止发布反动、涉政、暴力、色情、侵权或恶意代码。上传的内容将免费托管保留 90 天。
> 如果您的内容符合要求，请回复 **“同意”**，我将为您发布。

- **用户同意后**：直接进入第 3 步继续发布。

### 3. 判断发布类型：创建 (POST) 还是 更新 (PUT)

检查对话上下文。如果你在这个会话中，已经为**同一个文件**生成过 ShareOne 链接，你应该提取之前的 `share_id`（16位字符串）。

- 如果有 `share_id`，接下来执行**更新 (PUT)**。
- 如果没有，执行**首次创建 (POST)**。

## 4. 获取与处理页面评论 (Comments) - 新增能力

ShareOne 页面支持访客划词评论。如果用户要求你**根据分享页面的评论进行修改**（例如：“帮我处理一下这个页面的评论”），你需要执行以下工作流：

1. **拉取评论**：默认情况下，调用 `GET https://shareone.app/api/v1/shares/<YOUR_SHARE_ID>/comments?status=unresolved` 获取所有**未解决**的评论（JSON格式）。除非用户明确要求查看所有评论（传 `status=all`）或已解决的评论（传 `status=resolved`）。
   - **⚠️ 重要提示：** 如果用户仅仅是说“帮我拉取一下评论看看”或者“查看评论”，**请你在拉取并展示完评论内容后，立即停止操作，等待用户的下一步指令。绝对不要自作主张地直接开始修改源文件！**
2. **下载源文件**：只有当用户明确要求“处理这些评论”、“根据评论修改页面”时，调用 `GET https://shareone.app/api/v1/shares/<YOUR_SHARE_ID>/download`，并在 Headers 中传入 `X-API-Key: $SHAREONE_API_KEY`。此接口会返回包含 `content` 的 JSON。
3. **精准应用修改 (Critical Step)**：
   - 仔细阅读每条评论的 `content`（用户的修改意图）和 `highlighter_data`（划词的精确坐标）。
   - **绝对不要使用全局正则表达式或简单的全文 `replace()`，这会误伤其他同名文案！**
   - **必须基于 DOM 结构进行精确定位：** 利用 `highlighter_data` 中的 `startMeta.parentTagName`（父标签名）、`startMeta.parentIndex`（该类型标签的索引）以及 `startMeta.textOffset`（文本偏移量），结合 `quote`（被选中的原文），有针对性地定位需要修改的确切区域。
   - **理解结构性修改意图：** 用户的评论可能不仅是简单的文本替换。例如“把这部分移到底部”、“去掉这个功能”、“在这里加上一个图标”。你需要先通过 `highlighter_data` 找到用户划词所在的 DOM 节点（或者它的父容器/卡片），然后再执行结构性的修改操作。
   - **丢失锚点处理：** 如果你根据上述的 `highlighter_data` 或者 `quote` 无法在当前的源文件中找到对应的文本或 DOM 结构，这通常意味着该文件在用户评论后又发生了其他的修改。此时，**不要瞎猜或强行修改，请务必直接告知用户**（例如：“抱歉，您这条关于 XXX 的评论我无法处理，因为源文件结构似乎已变更，我找不到该部分内容了。”）。
4. **重新发布**：使用之前的 PUT 方法将修改后的页面更新到 ShareOne。
5. **标记解决**：对于每一个已处理的评论，调用 `PUT https://shareone.app/api/v1/shares/<YOUR_SHARE_ID>/comments/<COMMENT_ID>/resolve`，Headers 传入 `X-API-Key: $SHAREONE_API_KEY`，Body 传入 `{"resolved": true}`。

### 5. 构造请求并执行发布 (Execute Request)

根据文件类型和操作类型构造请求。提取用户可能要求的密码 (`password`) 和水印 (`watermark`)。为了最大兼容性，推荐使用 Node.js 脚本发起 HTTP 请求。

#### 场景 A：文本、代码或纯 HTML 文件 (`.html`, `.md`, `.txt`)

> **⚠️ 警告 (CRITICAL):**
> 绝对不要通过这个接口上传任何二进制文件（如 `.ppt`, `.pptx`, `.pdf`, `.zip`, `.png` 等），否则服务器会返回 `400 Bad Request` 错误（提示检测到二进制内容）。如果你看到此类错误，请立即更换为 **场景 B** 的 `/api/v1/files` 接口重新上传。

接口：`https://shareone.app/api/v1/pages`
格式：`application/json`

对于提取的对话、大段文字或独立的代码块，请将其包装为一段美观的 HTML（含基础样式）以保证展示效果：

**如果是首次创建 (POST):**

执行本技能目录下的 `upload_page.js` 脚本：

```bash
node scripts/upload_page.js <YOUR_FILE_PATH> --api-key $SHAREONE_API_KEY --filename "YOUR_FILE_NAME" [--password "OPTIONAL_PASSWORD"] [--watermark "OPTIONAL_WATERMARK"] [--allow-comments true]
```
> **注意**：只有当用户明确要求“开启评论”、“允许讨论”、“协同模式”等字眼时，才加上 `--allow-comments true` 参数。默认是不开启评论的。

**如果是更新已有链接 (PUT):**

执行本技能目录下的 `upload_page.js` 脚本，并传入 `--share-id` 参数：

```bash
node scripts/upload_page.js <YOUR_FILE_PATH> --api-key $SHAREONE_API_KEY --filename "YOUR_FILE_NAME" --share-id <YOUR_SHARE_ID>
```

#### 场景 B：二进制文件 (PDF, PPTX 等)

由于二进制文件可能较大，ShareOne 采用直传云存储（支持 S3 或 Azure）的方式。请直接调用本技能目录下的 `shareone_upload.js` 脚本进行上传（脚本会自动根据服务端返回的 `upload_type` 字段判断是走 S3 表单上传还是 Azure 的 PUT 直传）：

**如果是首次创建 (POST):**

```bash
node scripts/shareone_upload.js <FILE_PATH> --api-key $SHAREONE_API_KEY [--password "OPTIONAL_PASSWORD"] [--watermark "OPTIONAL_WATERMARK"]
```

**如果是更新已有链接的密码或水印 (PUT):**

对于已经上传的二进制文件，如果用户要求修改密码或水印，请调用 `update_file_meta.js` 脚本（假设存在，或通过 curl 直接调用 `/api/v1/files/{share_id}` 接口）：

```bash
curl -X PUT "https://shareone.app/api/v1/files/<YOUR_SHARE_ID>" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: $SHAREONE_API_KEY" \
     -d '{"password": "NEW_PASSWORD", "watermark": "NEW_WATERMARK"}'
```

_(注意：传空字符串 `""` 表示取消密码或水印)_

## 5. 协同与评论修改 (Collaboration & Comments)

ShareOne 支持页面内容的协同评论，允许用户直接在 HTML 页面选中文本并提出修改意见。AI Agent 可以根据这些意见直接修改原内容并更新页面。

**当用户要求处理评论时，请执行以下步骤**：

1. **获取评论**：调用获取评论的 API 接口拉取当前页面的所有评论。
   ```bash
   curl -X GET "https://shareone.app/api/v1/pages/<YOUR_SHARE_ID>/comments" \
        -H "X-API-Key: $SHAREONE_API_KEY"
   ```
2. **分析评论与代码**：分析返回的评论 JSON 中的 `content`（用户的修改意见）和 `selected_text`（对应的选中原文），并在你维护的源文件或最近生成的代码中定位需要修改的位置。
3. **执行修改**：根据用户的评论意见对 HTML 或其他文件进行相应的修改。
4. **更新线上内容**：将修改后的文件使用 PUT 接口更新到 ShareOne（参考场景 A：更新已有链接）。
5. **更新评论状态**：修改完成后，调用更新评论状态的接口将对应评论状态改为 `resolved`（已解决）。
   ```bash
   curl -X PUT "https://shareone.app/api/v1/pages/<YOUR_SHARE_ID>/comments/<COMMENT_ID>" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $SHAREONE_API_KEY" \
        -d '{"status": "resolved"}'
   ```
   注：如果因为大范围重构导致某些未解决的评论失去了原文锚点，页面在展示时会自动标识其为“失去锚点”(detached) 状态，你可以根据需要选择忽略它们或让用户确认。

### 6. 异常处理与结果反馈 (Feedback)

解析接口返回的 JSON。

- **发布成功 (HTTP 200/201)**:
  - **获取分享链接**:
    - 接口和脚本的返回结果中已经包含了完整的 `share_url` 字段（例如 `https://shareone.app/s/<share_id>`）。
    - 你**必须直接使用**接口或脚本返回的 `share_url` 展示给用户，**不要**自己尝试拼接链接。
  - 如果设置了密码，务必在回复中加粗显示密码：
    > 🎉 **发布成功！**
    > 🔗 链接: <返回的 share_url>
    > 🔑 提取码: **<密码>**
  - **功能提示 (Feature Discovery)**: 在**本次会话首次**向用户展示生成的短链接时，请主动（但简短且友好地）提示他们支持未使用的功能，以便用户了解更多高级特性。**后续发布不再提示。**
    - 如果用户**未使用密码和水印**，提示：
      > “💡 提示：您也可以让我为分享链接‘加上访问密码’或‘添加自定义水印’，以更好地保护您的内容。”
    - 如果用户**使用了密码但未使用水印**，提示：
      > “💡 提示：除了密码，您也可以让我为内容‘添加自定义水印’。”
    - 如果用户**使用了水印但未使用密码**，提示：
      > “💡 提示：除了水印，您也可以让我为分享链接‘加上访问密码’。”
    - 如果用户**同时使用了密码和水印**，则**不进行任何提示**。
- **内容违规拦截 (HTTP 400)**: 提取 JSON 中的 `detail` 字段展示给用户，如："❌ 发布失败，内容未通过安全审核。原因：<detail>"
- **API Key 无效 (HTTP 401)**: 提示用户 "API Key 无效或权限不足"。
- **找不到页面 (HTTP 404)**: 若 PUT 更新遇 404，说明原页面已被后台删除，请询问用户是否作为新页面重新 POST。
