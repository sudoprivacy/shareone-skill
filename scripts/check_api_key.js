const {
    isSudoclaw,
    readLocalApiKey,
    requestShareOneJson,
} = require('./shareone_client');

async function checkApiKey() {
    if (isSudoclaw()) {
        try {
            await requestShareOneJson('/api/v1/me', { method: 'GET' });
            console.log('SUDOCLAW_KEY_FOUND');
        } catch (_) {
            console.log('SUDOCLAW_KEY_NOT_FOUND');
        }
        return;
    }

    let apiKey = process.env.SHAREONE_API_KEY || readLocalApiKey();
    if (apiKey) {
        console.log(`KEY_FOUND:${apiKey}`);
        return;
    }

    console.log("KEY_NOT_FOUND");
}

checkApiKey().catch((error) => {
    console.error(`ERROR:${error.message}`);
    process.exit(1);
});
