# 内容正式复核

在审核拒绝或返回 `CONTENT_REVIEW_REQUIRED` 后，用户授权正式复核时读取本文件。
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
  "note": "复核依据、原拒绝理由和已有证据的位置"
}
```

可选 `filename` 指定将要使用的文本文件名；省略时沿用原页面文件名。
可选 `is_public`、`has_password`、`require_viewer_email` 指定计划采用的访问设置；
省略时沿用当前设置。申请只记录计划，不修改线上访问设置，也不保存密码本身。

```bash
node scripts/shareone_api_request.js /api/v1/pages/<REF>/content-reviews --method POST --data-file review-request.json
node scripts/shareone_api_request.js /api/v1/content-reviews/<REVIEW_ID>
node scripts/shareone_api_request.js /api/v1/content-reviews/<REVIEW_ID>/content --output reviewed-native.html
```

使用原分享 owner 的身份。复核记录包含 UTF-8 内容 SHA-256、字节数、源 URL、
文件名、原自动审核理由及公开访问设置。内容下载会重新核对哈希；源内容已改变时
返回 `CONFLICT`，不能把变化后的文件当成原候选文件批准。
候选源必须可公开读取；带密码或登录门禁的 ShareOne 内链不支持作为复核源，不能
用候选内容下载接口获取受门禁保护的源内容。

## 管理员作出决定

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
