# 环境判断与 API Key 凭据流程

只在需要 ShareOne API 的操作前读取本文件。先用脚本判断当前环境和凭据状态，不要只凭 `SUDOWORK_AUTH_PROXY_URL` 推断后续命令模式。

## 1. 检查环境和 API Key

执行：

```bash
node scripts/check_api_key.js
```

根据输出处理：

- `SUDOWORK_ENV_OK_KEY_FOUND`：当前在 Sudowork 中，Auth Proxy/secrets 环境可用，且 Sudowork 已配置 ShareOne API Key。后续发布命令不要传 `--api-key`。
- `SUDOWORK_ENV_OK_KEY_NOT_FOUND`：当前在 Sudowork 中，Auth Proxy/secrets 环境可用，但还没有设置 ShareOne API Key。
- `SUDOWORK_ENV_UNAVAILABLE_KEY_FOUND:<api_key>`：当前在 Sudowork 中，但 Auth Proxy/secrets 环境不可用；skill 已回退到普通 AI Agent 凭据流程并找到了 API Key。后续命令按普通 AI Agent 方式继续。
- `SUDOWORK_ENV_UNAVAILABLE_KEY_NOT_FOUND`：当前在 Sudowork 中，但 Auth Proxy/secrets 环境不可用；skill 已回退到普通 AI Agent 凭据流程但没有找到 API Key。
- `KEY_FOUND:<api_key>`：当前是普通 AI Agent 环境。将该 API Key 用于后续 direct 模式发布请求。
- `KEY_NOT_FOUND`：当前是普通 AI Agent 环境，且没有找到 API Key。

## 2. Sudowork 环境可用但无 Key

如果输出 `SUDOWORK_ENV_OK_KEY_NOT_FOUND`，暂停当前操作，询问用户是否已有 ShareOne API Key：

> 我检测到当前运行在 Sudowork 中，且 Sudowork 凭证环境可用，但还没有设置 ShareOne API Key。
> 请问您是否已经拥有 API Key？
>
> - 如果有，请直接回复您的 API Key（例如 `sk-xxx`），我会通过 Sudowork 安全保存并继续。
> - 如果没有，请回复“没有”或“创建”，我会自动为您创建一个临时 API Key，并保存到 Sudowork。

### 用户已有 Key

执行：

```bash
node scripts/save_api_key.js <用户提供的KEY>
```

如果输出 `SUDOWORK_KEY_SAVED`，重新执行：

```bash
node scripts/check_api_key.js
```

确认输出 `SUDOWORK_ENV_OK_KEY_FOUND` 后继续原操作。

如果输出 `SUDOWORK_FALLBACK_KEY_SAVED`，说明保存到 Sudowork secrets 时失败，脚本已暂时保存到 ShareOne 本地 fallback 凭证。重新执行 `check_api_key.js`，按返回的 `SUDOWORK_ENV_UNAVAILABLE_KEY_FOUND:<api_key>` 或 `KEY_FOUND:<api_key>` 继续。

### 用户没有 Key 或要求创建

执行：

```bash
node scripts/create_guest_key.js
```

如果输出 `GUEST_KEY_CREATED:<api_key>`，这是阻塞性用户通知。必须先回复用户以下内容，然后才能继续原操作：

> 已为您自动分配临时 API Key：`<api_key>`
> 绑定账号链接：https://shareone.app/?key=<api_key>
> 请妥善保存此 API Key。为了方便您后续管理分享的链接，请尽快打开上面的链接绑定您的永久账号。

如果同时输出 `SUDOWORK_FALLBACK_KEY_SAVED`，补充说明：

> 我检测到 Sudowork Auth Proxy/secrets 当前不可用或保存失败，已暂时保存到 ShareOne 本地 fallback 凭证。该凭证不是 Sudowork Secret Store；保存位置是 ShareOne skill 安装目录下的 `.shareone_credentials`。

如果输出 `ERROR:RATE_LIMIT_EXCEEDED`，暂停操作并提示：

> 获取临时凭证失败：您今天自动创建临时 API Key 的次数已达上限（每天最多 5 次）。请前往 https://shareone.app 手动注册并获取 API Key。

## 3. Sudowork 环境不可用时的 fallback

如果输出 `SUDOWORK_ENV_UNAVAILABLE_KEY_FOUND:<api_key>`，后续命令按普通 AI Agent 方式继续。不要要求用户去 Sudowork 密钥管理。

如果输出 `SUDOWORK_ENV_UNAVAILABLE_KEY_NOT_FOUND`，暂停当前操作，询问用户是否已有 ShareOne API Key：

> 我检测到当前运行在 Sudowork 中，但 Sudowork Auth Proxy/secrets 当前不可用，因此会暂时回退到 ShareOne 普通凭据流程。
> 请问您是否已经拥有 API Key？
>
> - 如果有，请直接回复您的 API Key（例如 `sk-xxx`），我将保存到 ShareOne fallback 本地凭证并继续。
> - 如果没有，请回复“没有”或“创建”，我可以为您创建一个临时 API Key。

保存已有 Key 时执行：

```bash
node scripts/save_api_key.js <用户提供的KEY>
```

如果输出 `SUDOWORK_FALLBACK_KEY_SAVED`，重新执行 `check_api_key.js`，确认输出 `SUDOWORK_ENV_UNAVAILABLE_KEY_FOUND:<api_key>` 后继续。

创建临时 Key 时执行：

```bash
node scripts/create_guest_key.js
```

如果输出 `GUEST_KEY_CREATED:<api_key>`，必须先按第 2 节的临时 API Key 通知回复用户，再继续原操作。

### 本地凭据路径

普通 AI Agent 和 Sudowork fallback 都会读取 `SHAREONE_API_KEY` 或本地凭证文件。

所有非 Sudowork secrets 的本地凭据都只读写 ShareOne skill 安装目录下的 `.shareone_credentials`，不读写用户 home。保存、读取和删除使用同一路径，确保不同 Agent/龙虾产品中路径一致。Sudowork fallback 的本地凭据不是 Sudowork Secret Store。

## 4. 普通 AI Agent 无 Key

如果输出 `KEY_NOT_FOUND`，暂停当前操作，询问用户是否已有 ShareOne API Key：

> 我没有找到您的 ShareOne API Key。
> 请问您是否已经拥有 API Key？
>
> - 如果有，请直接回复您的 API Key（例如 `sk-xxx`），我将为您保存并继续。
> - 如果没有，请回复“没有”或“创建”，我可以为您创建一个临时 API Key。

### 用户已有 Key

执行：

```bash
node scripts/save_api_key.js <用户提供的KEY>
```

如果输出 `KEY_SAVED`，重新执行：

```bash
node scripts/check_api_key.js
```

确认输出 `KEY_FOUND:<api_key>` 后继续原操作。

### 用户没有 Key 或要求创建

执行：

```bash
node scripts/create_guest_key.js
```

如果输出 `GUEST_KEY_CREATED:<api_key>`，这是阻塞性用户通知。必须先回复用户以下内容，然后才能继续原操作：

> 已为您自动分配临时 API Key：`<api_key>`
> 绑定账号链接：https://shareone.app/?key=<api_key>
> 请妥善保存此 API Key。为了方便您后续管理分享的链接，请尽快打开上面的链接绑定您的永久账号。

普通 AI Agent 环境会把临时 API Key 保存到本地凭证文件。即使保存成功，也不能省略上面的用户通知。后续也可以使用环境变量 `SHAREONE_API_KEY` 或命令参数 `--api-key`。

如果输出 `ERROR:RATE_LIMIT_EXCEEDED`，暂停操作并提示：

> 获取临时凭证失败：您今天自动创建临时 API Key 的次数已达上限（每天最多 5 次）。请前往 https://shareone.app 手动注册并获取 API Key。

## 5. 后续命令规则

- Sudowork：不要传 `--api-key`。
- `SUDOWORK_ENV_OK_KEY_FOUND`：不要传 `--api-key`。
- `SUDOWORK_ENV_UNAVAILABLE_KEY_FOUND:<api_key>`、`KEY_FOUND:<api_key>`：可以传 `--api-key`，也可以依赖 `SHAREONE_API_KEY` 或本地凭证。
- 如果凭据无效或服务返回 401，在结果处理 workflow 中提示 “API Key 无效或权限不足”。
