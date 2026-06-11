const {
    CREDENTIAL_MODE_DIRECT_FALLBACK,
    CREDENTIAL_MODE_SUDOWORK_PROXY,
    detectCredentialMode,
    readLocalApiKey,
} = require('./shareone_client');

async function checkApiKey() {
    const credentialMode = await detectCredentialMode({ refresh: true });

    if (credentialMode.mode === CREDENTIAL_MODE_SUDOWORK_PROXY) {
        console.log(credentialMode.hasSudoworkKey ? 'SUDOWORK_ENV_OK_KEY_FOUND' : 'SUDOWORK_ENV_OK_KEY_NOT_FOUND');
        return;
    }

    const apiKey = process.env.SHAREONE_API_KEY || readLocalApiKey();

    if (credentialMode.mode === CREDENTIAL_MODE_DIRECT_FALLBACK) {
        console.log(apiKey ? `SUDOWORK_ENV_UNAVAILABLE_KEY_FOUND:${apiKey}` : 'SUDOWORK_ENV_UNAVAILABLE_KEY_NOT_FOUND');
        return;
    }

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
