const {
    isSudowork,
    requestPublicShareOneJson,
    requestShareOneJson,
    saveLocalApiKey,
    saveSudoworkApiKey,
} = require('./shareone_client');

async function createGuestKey() {
    try {
        const requestJson = isSudowork() ? requestPublicShareOneJson : requestShareOneJson;
        const result = await requestJson('/api/v1/agent-guest-key', {
            method: 'POST',
            authRequired: false,
        });
        if (result.api_key) {
            if (isSudowork()) {
                await saveSudoworkApiKey(result.api_key);
            } else {
                saveLocalApiKey(result.api_key);
            }
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
