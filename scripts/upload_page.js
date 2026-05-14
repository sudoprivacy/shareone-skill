const fs = require('fs');
const {
    isSudoclaw,
    requestShareOneBuffer,
    resolveDirectApiKey,
} = require('./shareone_client');

const args = process.argv.slice(2);
let filePath = null;
let apiKey = null;
let filename = "shared_content.html";
let password = null;
let watermark = null;
let shareId = null;
let allowComments = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-key') {
        apiKey = args[++i];
    } else if (args[i] === '--filename') {
        filename = args[++i];
    } else if (args[i] === '--password') {
        password = args[++i];
    } else if (args[i] === '--watermark') {
        watermark = args[++i];
    } else if (args[i] === '--share-id') {
        shareId = args[++i];
    } else if (args[i] === '--allow-comments') {
        allowComments = args[++i] === 'true';
    } else if (!args[i].startsWith('--')) {
        filePath = args[i];
    }
}

if (!filePath) {
    console.error("Usage: node upload_page.js <file_path> [--api-key <key>] [--filename <name>] [--password <pwd>] [--watermark <wm>] [--share-id <id>] [--allow-comments <true|false>]");
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

async function uploadPage() {
    const content = fs.readFileSync(filePath, "utf-8");

    const payload = {
        filename: filename,
        html_content: content
    };

    if (password !== null) payload.password = password;
    if (watermark !== null) payload.watermark = watermark;

    if (allowComments !== null) {
        payload.allow_comments = allowComments;
    }

    const data = JSON.stringify(payload);
    const urlPath = shareId
        ? `/api/v1/pages/${shareId}`
        : '/api/v1/pages';

    const method = shareId ? 'PUT' : 'POST';

    const res = await requestShareOneBuffer(urlPath, {
        method: method,
        apiKey,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    }, data);
    console.log(res.text);
}

uploadPage().catch((error) => {
    if (isSudoclaw() && (error.statusCode === 401 || error.statusCode === 502)) {
        console.error("ERROR:SUDOCLAW_KEY_NOT_FOUND");
        console.error("请先打开 https://shareone.app 注册或获取 API Key，然后回到 Sudoclaw 的密钥管理中添加并启用 ShareOne API Key。");
    } else {
        console.error(`ERROR:${error.message}`);
    }
    process.exit(1);
});
