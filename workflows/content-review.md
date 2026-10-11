# 内容正式复核

在审核拒绝或返回 `CONTENT_REVIEW_REQUIRED` 后读取本文件。用户已授权发布或更新时，
可在该范围内为同一候选提交正式复核申请，无需另问是否申请；申请本身不会发布。
保留原错误、候选文件 URL、哈希及未完成状态。提交复核不会修改分享，也不表示批准。

## 原生 HTML

公开 GitHub 的完整 UTF-8 原生 HTML 可作为远程源，最大 16 MiB。源版本仍由 Git
管理。自行解码后调用 `document.open/write` 的 HTML 包会移除 ShareOne 注入的桥接
与事件监听；托管完整原生页面可保留这些功能。

若既有文件被拒绝，不为重试发布擅自改内容、压缩方式、MIME、门禁或上传入口。
需要不同的托管文件时，先取得用户对该方案的授权，再在 Git 创建独立且可追溯的
文件，保留原文件与拒绝证据。更大的原生文件仍受限额与完整内容审核约束。

## 所有者提交候选文件

对已有的文本页面提交固定版本远程源。`review-request.json` 包含：

```json
{
  "remote_url": "https://github.com/org/repo/blob/<FULL_COMMIT_SHA>/native.html",
  "note": "复核依据、原拒绝理由和已有证据的位置",
  "source_agent": "项目名 / Agent 会话标识",
  "automatic_review": true
}
```

可选 `filename` 指定将要使用的文本文件名；省略时沿用原页面文件名。
可选 `is_public`、`has_password`、`require_viewer_email` 指定计划采用的访问设置；
省略时沿用当前设置。申请只记录计划，不修改线上访问设置，也不保存密码本身。

```bash
node scripts/shareone_api_request.js /api/v1/pages/<REF>/content-reviews --method POST --data-file review-request.json
node scripts/shareone_api_request.js /api/v1/content-reviews/<REVIEW_ID>
node scripts/wait_content_review.js <REVIEW_ID> --timeout-seconds 600
node scripts/shareone_api_request.js /api/v1/content-reviews/<REVIEW_ID>/content --output reviewed-native.html
```

使用原分享 owner 的身份。复核记录包含 UTF-8 内容 SHA-256、字节数、源 URL、
文件名、原自动审核理由及公开访问设置。内容下载会重新核对哈希；源内容已改变时
返回 `CONFLICT`，不能把变化后的文件当成原候选文件批准。
候选源必须可公开读取；带密码或登录门禁的 ShareOne 内链不支持作为复核源，不能
用候选内容下载接口获取受门禁保护的源内容。

## 默认后台自动复核

新申请默认后台复核，无需逐次请当前对话的 AI 批准。服务器重新获取完整文件并核对
SHA-256，分段检查完整内容后进行整体检查；明确安全才自动批准。固定 GitHub 版本中
未变化的 JSON 数据可以引用同一分享、来源和执行上下文的既有完整批准，所有变化和
应用代码仍需检查。源代码或页面上下文变化时不沿用这部分证据。

以服务器最新记录为准，不依据本地交接文档判断是否仍待批。`source_agent` 是提交方
标注，方便管理员知道来自哪个项目或会话；权限依据仍是认证账号。响应包含
`owner_name`、`source_agent`、`decision_source` 和审核证据。

| `status` | Agent 下一步 |
|---|---|
| `automatic_pending` | 等待同一个 ID；不重复提交，不重试发布 |
| `approved` 且 `approved: true` | 按下节用原所有者更新原链接 |
| `manual_required` | 保持原分享不变，交给 Root Admin 内容复核队列 |
| `rejected` | 保留拒绝记录，停止发布 |

`wait_content_review.js` 仅查询审核：通过时输出记录并以 0 退出；人工或拒绝时输出
结构化错误并以 6 退出；等待超时输出 `wait_timed_out: true` 和当前记录，以 3 退出。
超时后后台申请继续处理，下次查询同一 ID。服务故障、无法确认安全或来源变化时进入
人工队列。旧申请保留原处理方式，最终决定不会被自动覆盖。

仅需人工时可在新申请设置 `automatic_review: false`。自动复核不会发布页面。

## 管理员处理人工队列

有 root 权限的审核员可在 `https://shareone.vip/root-admin` 的「内容复核」页下载
候选文件、核对内容与访问设置，并记录批准或拒绝的依据。也可在用户明确授权该
审核决定后，使用 root 凭据调用：

```http
POST /api/v1/content-reviews/<REVIEW_ID>/decision
Content-Type: application/json

{"approved":true,"content_sha256":"<EXACT_SHA256>","note":"具体复核依据和授权来源"}
```

普通所有者或协作者不能批准。最终决定只写一次；相同审核员重放相同决定可安全
返回原结果，不能覆盖该次复核的已有批准或拒绝。页面上下文变化后可提交新的
复核记录，同一文件和范围以最新最终决定为准，旧决定保留。`approved: null` 表示尚无决定，`false`
表示拒绝；两种情况下均保持原分享不变，不重试发布。

## 批准后的发布与验收

用户已授权发布且 `approved: true` 后，按原发布流程用同一个 `--share-id` 和
审核记录中的源 URL 更新。批准只适用于此页面、owner、文件哈希、源 URL、文件名
和访问设置；变化后的内容必须重新审核。不要新增 skip/force 参数或替换身份。

提交决定本身不会绑定源。更新完成后，核对 owner 下载的完整字节与 SHA-256、
`INFO:REMOTE_SOURCE`、匿名渲染及用户要求的评论设置。自动刷新也执行同样的审核
匹配；审核未完成时保留旧缓存与原评论，不能报告更新成功。
