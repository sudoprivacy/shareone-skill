#!/usr/bin/env node

// AI 回复评论的「强制表态」脚本：回复的同时必须声明一个 --state，杜绝“只回复不收
// 敛”。自动从父评论继承 quote/highlighter_data，POST 一条 author_role=agent 的回复
// 并带上 state；后端据此原子地设置父评论的状态与 AI 立场。AI 永不 dismiss 分歧：
//   resolved-agree   充分理解且同意 → 收敛为 resolved
//   open-disagree    已阐述反对理由，但保持 open，把是否关闭交回给提出者
//   open-need-input  需要人类进一步澄清 → 保持 open

const {
    CREDENTIAL_MODE_SUDOWORK_PROXY,
    detectCredentialMode,
    printShareOneScriptError,
    requestShareOneJson,
    resolveDirectApiKey,
} = require('./shareone_client');

const STATES = ['resolved-agree', 'open-disagree', 'open-need-input'];

function usage() {
    console.error('Usage: node comment_reply.js <share_link_or_ref> <comment_id> --content "<回复内容>" --state <resolved-agree|open-disagree|open-need-input> [--api-key <key>]');
    console.error('  --state 必填，无默认；缺省即报错：');
    console.error('    resolved-agree   同意并已处理 → 评论收敛为 resolved');
    console.error('    open-disagree    不同意（--content 里写清理由），但保持 open，把关闭权交回提出者（AI 不 dismiss）');
    console.error('    open-need-input  需要人类澄清 → 保持 open');
}

function extractShareRef(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        const parsed = raw.includes('://') ? new URL(raw) : null;
        const path = parsed ? parsed.pathname : raw.split('?')[0].split('#')[0];
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 0) return raw;
        return parts[parts.length - 1] || raw;
    } catch (_) {
        return raw;
    }
}

const args = process.argv.slice(2);
let ref = null;
let commentId = null;
let content = null;
let state = null;
let apiKey = null;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--content') {
        content = args[++i];
    } else if (arg === '--state') {
        state = args[++i];
    } else if (arg === '--api-key') {
        apiKey = args[++i];
    } else if (!arg.startsWith('--') && !ref) {
        ref = arg;
    } else if (!arg.startsWith('--') && !commentId) {
        commentId = arg;
    } else {
        console.error(`ERROR:UNKNOWN_ARGUMENT:${arg}`);
        usage();
        process.exit(1);
    }
}

if (!ref || !commentId) {
    usage();
    process.exit(1);
}

if (!content) {
    console.error('ERROR:CONTENT_REQUIRED');
    console.error('回复评论必须用 --content 给出回复内容。');
    usage();
    process.exit(1);
}

if (!state) {
    console.error('ERROR:STATE_REQUIRED');
    console.error('回复评论必须用 --state 明确表态（无默认）。这样才能避免“只回复不收敛/分歧没 signal 出来”。见 usage。');
    usage();
    process.exit(1);
}

if (!STATES.includes(state)) {
    console.error(`ERROR:INVALID_STATE:${state}`);
    console.error(`--state 只能是其一：${STATES.join(', ')}`);
    process.exit(1);
}

(async () => {
    const credentialMode = await detectCredentialMode();
    if (credentialMode.mode === CREDENTIAL_MODE_SUDOWORK_PROXY && apiKey) {
        console.error('ERROR:SUDOWORK_MANAGED_KEY');
        console.error('Sudowork 模式下不要传 --api-key；请通过本 skill 的 save_api_key.js 或 create_guest_key.js 设置 ShareOne API Key。');
        process.exit(1);
    }
    if (credentialMode.mode !== CREDENTIAL_MODE_SUDOWORK_PROXY && !resolveDirectApiKey(apiKey)) {
        console.error('ERROR:KEY_NOT_FOUND');
        process.exit(1);
    }

    const shareRef = encodeURIComponent(extractShareRef(ref));
    const comments = await requestShareOneJson(`/api/v1/shares/${shareRef}/comments?status=all`, {
        method: 'GET',
        apiKey,
    });

    const wantedId = String(commentId);
    const parent = (comments || []).find(c => String(c.id) === wantedId);
    if (!parent) {
        for (const c of comments || []) {
            const asReply = (c.replies || []).find(r => String(r.id) === wantedId);
            if (asReply) {
                console.error(`ERROR:IS_REPLY:${c.id}`);
                console.error(`评论 ${wantedId} 是一条回复；表态只能对父评论操作。请改用父评论 ID ${c.id} 重新执行。`);
                process.exit(1);
            }
        }
        console.error('ERROR:COMMENT_NOT_FOUND');
        console.error(`在该 share 下没有找到 ID 为 ${wantedId} 的评论。`);
        process.exit(1);
    }

    const posted = await requestShareOneJson(`/api/v1/shares/${shareRef}/comments`, {
        method: 'POST',
        apiKey,
    }, {
        parent_id: parent.id,
        quote: parent.quote,
        highlighter_data: parent.highlighter_data,
        content,
        author_role: 'agent',
        state,
    });
    console.log(`REPLY_POSTED:${posted && posted.id !== undefined ? posted.id : ''}`);
    console.log(`COMMENT_STATE:${state}`);
})().catch((error) => {
    printShareOneScriptError(error);
    process.exit(1);
});
