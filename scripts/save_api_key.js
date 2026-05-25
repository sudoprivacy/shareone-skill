const { isSudowork, saveLocalApiKey, saveSudoworkApiKey } = require('./shareone_client');

const apiKey = process.argv[2];
if (!apiKey) {
    console.error("Please provide an API key.");
    process.exit(1);
}

async function saveApiKey() {
    if (isSudowork()) {
        await saveSudoworkApiKey(apiKey);
        console.log("SUDOWORK_KEY_SAVED");
        return;
    }

    saveLocalApiKey(apiKey);
    console.log("KEY_SAVED");
}

saveApiKey().catch((error) => {
    console.error(`ERROR:${error.message}`);
    process.exit(1);
});
