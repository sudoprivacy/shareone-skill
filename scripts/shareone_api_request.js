#!/usr/bin/env node

const {
    CREDENTIAL_MODE_SUDOWORK_PROXY,
    detectCredentialMode,
    printShareOneScriptError,
    requestShareOneBuffer,
    resolveDirectApiKey,
} = require('./shareone_client');

const args = process.argv.slice(2);
let method = 'GET';
let apiPath = null;
let data = null;
let apiKey = null;
let publicRequest = false;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--method') {
        method = String(args[++i] || 'GET').toUpperCase();
    } else if (args[i] === '--data') {
        data = args[++i];
    } else if (args[i] === '--api-key') {
        apiKey = args[++i];
    } else if (args[i] === '--public') {
        publicRequest = true;
    } else if (!args[i].startsWith('--') && !apiPath) {
        apiPath = args[i];
    }
}

if (!apiPath) {
    console.error("Usage: node shareone_api_request.js <api_path> [--method GET|POST|PUT|DELETE] [--data '<json>'] [--api-key <key>] [--public]");
    process.exit(1);
}

const headers = {};
let body = null;
if (data !== null) {
    body = data;
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
}

(async () => {
    const credentialMode = await detectCredentialMode();
    if (credentialMode.mode === CREDENTIAL_MODE_SUDOWORK_PROXY && apiKey && !publicRequest) {
        console.error("ERROR:SUDOWORK_MANAGED_KEY");
        console.error("Sudowork 模式下不要传 --api-key；请通过本 skill 的 save_api_key.js 或 create_guest_key.js 设置 ShareOne API Key。");
        process.exit(1);
    }

    if (!publicRequest && credentialMode.mode !== CREDENTIAL_MODE_SUDOWORK_PROXY && !resolveDirectApiKey(apiKey)) {
        console.error("ERROR:KEY_NOT_FOUND");
        process.exit(1);
    }

    return requestShareOneBuffer(apiPath, {
        method,
        apiKey,
        authRequired: !publicRequest,
        headers,
    }, body);
})().then((res) => {
    process.stdout.write(res.data);
}).catch((error) => {
    printShareOneScriptError(error);
    process.exit(1);
});
