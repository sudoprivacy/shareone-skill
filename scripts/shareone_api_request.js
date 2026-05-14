#!/usr/bin/env node

const {
    isSudoclaw,
    requestShareOneBuffer,
    resolveDirectApiKey,
} = require('./shareone_client');

const args = process.argv.slice(2);
let method = 'GET';
let apiPath = null;
let data = null;
let apiKey = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--method') {
        method = String(args[++i] || 'GET').toUpperCase();
    } else if (args[i] === '--data') {
        data = args[++i];
    } else if (args[i] === '--api-key') {
        apiKey = args[++i];
    } else if (!args[i].startsWith('--') && !apiPath) {
        apiPath = args[i];
    }
}

if (!apiPath) {
    console.error("Usage: node shareone_api_request.js <api_path> [--method GET|POST|PUT|DELETE] [--data '<json>'] [--api-key <key>]");
    process.exit(1);
}

if (isSudoclaw() && apiKey) {
    console.error("ERROR:SUDOCLAW_MANAGED_KEY");
    console.error("Sudoclaw 模式下不要传 --api-key；请在 Sudoclaw 密钥管理中配置 ShareOne API Key。");
    process.exit(1);
}

if (!isSudoclaw() && !resolveDirectApiKey(apiKey)) {
    console.error("ERROR:KEY_NOT_FOUND");
    process.exit(1);
}

const headers = {};
let body = null;
if (data !== null) {
    body = data;
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
}

requestShareOneBuffer(apiPath, {
    method,
    apiKey,
    headers,
}, body).then((res) => {
    if (res.text) console.log(res.text);
}).catch((error) => {
    if (isSudoclaw() && (error.statusCode === 401 || error.statusCode === 502)) {
        console.error("ERROR:SUDOCLAW_KEY_NOT_FOUND");
        console.error("请先打开 https://shareone.app 注册或获取 API Key，然后回到 Sudoclaw 的密钥管理中添加并启用 ShareOne API Key。");
    } else {
        console.error(`ERROR:${error.message}`);
    }
    process.exit(1);
});
