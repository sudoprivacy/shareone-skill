const {
    isSudoclaw,
    requestShareOneJson,
    saveLocalApiKey,
} = require('./shareone_client');

if (isSudoclaw()) {
    console.log("ERROR:SUDOCLAW_MANAGED_KEY");
    console.log("Sudoclaw 中无法由 skill 创建或保存临时 ShareOne API Key。");
    console.log("请先打开 https://shareone.app 注册或获取 API Key，然后回到 Sudoclaw 的密钥管理中添加并启用 ShareOne API Key。");
    process.exit(1);
}

async function createGuestKey() {
    try {
        const result = await requestShareOneJson('/api/v1/agent-guest-key', {
            method: 'POST',
            authRequired: false,
        });
        if (result.api_key) {
            saveLocalApiKey(result.api_key);
            console.log(`GUEST_KEY_CREATED:${result.api_key}`);
            return;
        }
        console.log("ERROR:INVALID_RESPONSE");
    } catch (error) {
        if (error.statusCode === 429) {
            console.log("ERROR:RATE_LIMIT_EXCEEDED");
        } else {
            console.log(`ERROR:${error.message}`);
        }
    }
}

createGuestKey();
