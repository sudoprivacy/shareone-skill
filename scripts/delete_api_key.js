#!/usr/bin/env node

const {
    CREDENTIAL_MODE_SUDOWORK_PROXY,
    deleteLocalApiKey,
    deleteSudoworkApiKey,
    detectCredentialMode,
    isSudowork,
} = require('./shareone_client');

async function deleteApiKey() {
    const credentialMode = await detectCredentialMode({ refresh: true });
    if (credentialMode.mode === CREDENTIAL_MODE_SUDOWORK_PROXY) {
        await deleteSudoworkApiKey();
        console.log("SUDOWORK_KEY_DELETED");
        return;
    }

    const deleted = deleteLocalApiKey();
    if (isSudowork()) {
        console.log(deleted ? "SUDOWORK_FALLBACK_KEY_DELETED" : "KEY_NOT_FOUND");
        return;
    }
    console.log(deleted ? "KEY_DELETED" : "KEY_NOT_FOUND");
}

deleteApiKey().catch((error) => {
    console.error(`ERROR:${error.message}`);
    process.exit(1);
});
