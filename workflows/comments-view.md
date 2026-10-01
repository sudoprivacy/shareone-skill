# 查看 ShareOne 评论

当用户只是要求查看、拉取、总结评论时读取本文件。不要修改源文件，不要认领评论，不要关闭评论。

查看评论走公开接口，**不需要 API Key**（`comment_list.js` 本身即公开读取；若改用 `shareone_api_request.js` 直连则加 `--public`）；只有进入处理评论流程（`comments-process.md`）时才需要凭据。

## 1. 获取 ref

用户提供的目标可以是完整链接、`/s/<ref>` 或 `/md/<ref>` 路径、裸 `share_id` 或自定义短链 slug。取路径最后一段作为 `<REF>` 即可，接口同时接受 `share_id` 和 slug。

## 2. 查看评论

优先用 `comment_list.js`——它输出干净的 UTF-8 JSON（`{ share, status, count, comments:[{ id, status, author_role, quote, content, created_at, resolution_note, reply_count, replies:[...] }] }`），省去手工拼接 endpoint 和解析原始响应，也规避控制台非 ASCII 乱码：

```bash
node scripts/comment_list.js <REF>                 # 默认 --status all
node scripts/comment_list.js <REF> --status open   # 只看未处理
node scripts/comment_list.js <REF> --json compact  # 单行 JSON，便于管道解析
```

`--status` 可选值：

- `all`（默认）
- `open`
- `in_progress`
- `resolved`
- `dismissed`
- `unresolved`，等价于 `open + in_progress`

查看评论无需凭据（公开接口）。只有进入处理评论流程（`comments-process.md`）时才需要 API Key。

## 3. 评论理解规则

- 只展示评论内容，绝对不要自作主张开始修改源文件。
- 等用户明确要求“处理这些评论”、“根据评论改一下页面”等，再进入 `comments-process.md`。
- 评论数据中可能包含 `replies`。必须将父评论及其所有回复作为一个 thread 整体阅读，综合理解最终共识。
- 不要把每条回复当成独立修改指令。
- 所有回复继承父评论的锚点，也就是 `highlighter_data` 和 `quote`。

## 4. 轻量摘要

如果只想看“现在还有没有未处理的事”，用摘要接口：

```bash
node scripts/shareone_api_request.js "/api/v1/shares/<REF>/comments/summary" --public
# -> { total, open, in_progress, resolved, dismissed, last_activity_at }
```

返回 `open == 0` 时无需拉全量评论。

## 5. 增量维护评论缓存

需要持续更新一个评论视图时，可以复用通用请求脚本：

```bash
node scripts/shareone_api_request.js "/api/v1/shares/<REF>/comments/changes" --public
node scripts/shareone_api_request.js "/api/v1/shares/<REF>/comments/changes?cursor=<URL_ENCODED_CURSOR>&limit=100" --public
```

首次省略 `cursor`，用 `reset=true` 的 `comments` 替换缓存；包括上线前已有的评论。后续按顶层 ID 替换返回的完整线程（含回复），删除 `deleted_ids`，应用成功后保存 `next_cursor`。`has_more=true` 时立即继续；`limit` 是事件数，默认 100、最大 200。线程反映当前状态，同一批可幂等重放。400 表示游标无效，应重新获取快照。游标只对原分享有效。

此接口每次检查页面密码/登录要求。`--public` 适用于没有访问门槛的分享；有 owner/协作者凭据时省略 `--public`。浏览器访问者使用页面授权 Cookie；本脚本不会代填页面密码。旧 `comment_list.js` 的单次查看方式不变。

该接口只读，不注册消费者或确认事件。需要可靠接收通知并唤醒 Agent 时，使用 `agent-notifications.md` 的持久消费者流程。
