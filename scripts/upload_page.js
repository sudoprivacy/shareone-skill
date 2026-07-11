const fs = require('fs');
const path = require('path');
const {
    CREDENTIAL_MODE_SUDOWORK_PROXY,
    detectCredentialMode,
    printShareOneScriptError,
    requestShareOneBuffer,
    resolveDirectApiKey,
} = require('./shareone_client');

const args = process.argv.slice(2);
let filePath = null;
let apiKey = null;
let filename = null;
let password = null;
let watermark = null;
let shareId = null;
let allowComments = null;
let slug = null;
let remoteUrl = null;

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
    } else if (args[i] === '--slug') {
        slug = args[++i];
    } else if (args[i] === '--allow-comments') {
        allowComments = args[++i] === 'true';
    } else if (args[i] === '--remote-url') {
        remoteUrl = args[++i];
    } else if (!args[i].startsWith('--')) {
        filePath = args[i];
    }
}

if (!filePath && !remoteUrl) {
    console.error("Usage: node upload_page.js <file_path> [--remote-url <url>] [--api-key <key>] [--filename <name>] [--password <pwd>] [--watermark <wm>] [--share-id <id>] [--slug <slug>] [--allow-comments <true|false>]");
    process.exit(1);
}

if (!filename) {
    filename = path.basename(filePath);
}

async function uploadPage() {
    const credentialMode = await detectCredentialMode();
    if (credentialMode.mode === CREDENTIAL_MODE_SUDOWORK_PROXY && apiKey) {
        console.error("ERROR:SUDOWORK_MANAGED_KEY");
        console.error("Sudowork 模式下不要传 --api-key；请通过本 skill 的 save_api_key.js 或 create_guest_key.js 设置 ShareOne API Key。");
        process.exit(1);
    }

    if (credentialMode.mode !== CREDENTIAL_MODE_SUDOWORK_PROXY && !resolveDirectApiKey(apiKey)) {
        console.error("ERROR:KEY_NOT_FOUND");
        process.exit(1);
    }

    let payload;

    if (remoteUrl) {
        // Remote URL mode: server fetches content from the URL
        payload = { remote_url: remoteUrl };
        if (filename) payload.filename = filename;
    } else {
        // Local file mode: read and upload content
        const content = fs.readFileSync(filePath, "utf-8");
        payload = {
            filename: filename,
            html_content: content,
        };
    }

    if (password !== null) payload.password = password;
    if (watermark !== null) payload.watermark = watermark;
    if (slug !== null) payload.custom_slug = slug;

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

    if (shareId && !remoteUrl) {
        const content = fs.readFileSync(filePath, "utf-8");
        await verifyUpdatedContent(shareId, content);
    }

    console.log(res.text);
}

async function verifyUpdatedContent(updatedShareId, expectedContent) {
    const res = await requestShareOneBuffer(`/api/v1/shares/${encodeURIComponent(updatedShareId)}/download`, {
        method: 'GET',
        apiKey,
        headers: {
            Accept: '*/*',
        },
    });

    if (res.data.toString('utf8') !== expectedContent) {
        throw new Error('UPDATE_VERIFY_FAILED: server accepted the update but source content did not match the uploaded file');
    }
}

uploadPage().catch((error) => {
    printShareOneScriptError(error);
    process.exit(1);
});
