const { isSudoclaw, saveLocalApiKey } = require('./shareone_client');

if (isSudoclaw()) {
    console.log("ERROR:SUDOCLAW_MANAGED_KEY");
    console.log("请在 Sudoclaw 的密钥管理中设置 ShareOne API Key。");
    process.exit(1);
}

const apiKey = process.argv[2];
if (!apiKey) {
    console.error("Please provide an API key.");
    process.exit(1);
}

saveLocalApiKey(apiKey);
console.log("KEY_SAVED");
