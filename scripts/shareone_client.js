const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_URL = 'https://shareone.app';
const CREDENTIALS_PATH = path.join(os.homedir(), '.shareone_credentials');

function isSudoclaw() {
    return Boolean(process.env.SUDOWORK_AUTH_PROXY_URL && process.env.SUDOWORK_AUTH_PROXY_TOKEN);
}

function getBaseUrl() {
    return process.env.SHAREONE_BASE_URL || DEFAULT_BASE_URL;
}

function getCredentialsPath() {
    return CREDENTIALS_PATH;
}

function readLocalApiKey() {
    if (!fs.existsSync(CREDENTIALS_PATH)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        return data && data.api_key ? data.api_key : null;
    } catch (_) {
        return null;
    }
}

function resolveDirectApiKey(explicitApiKey) {
    return explicitApiKey || process.env.SHAREONE_API_KEY || readLocalApiKey();
}

function saveLocalApiKey(apiKey) {
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ api_key: apiKey }));
}

function appendPath(baseUrl, apiPath) {
    const trimmedBase = String(baseUrl).replace(/\/+$/, '');
    const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    return `${trimmedBase}${normalizedPath}`;
}

function requestBuffer(url, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const client = target.protocol === 'https:' ? https : http;
        const req = client.request(target, {
            method: options.method || 'GET',
            headers: options.headers || {},
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
                const data = Buffer.concat(chunks);
                const text = data.toString('utf8');
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ statusCode: res.statusCode, headers: res.headers, data, text });
                    return;
                }
                const error = new Error(`HTTP ${res.statusCode}: ${text}`);
                error.statusCode = res.statusCode;
                error.responseText = text;
                reject(error);
            });
        });

        req.on('error', reject);
        if (options.timeoutMs) {
            req.setTimeout(options.timeoutMs, () => {
                req.destroy(new Error('Request timed out'));
            });
        }
        if (body) req.write(body);
        req.end();
    });
}

function buildShareOneRequest(apiPath, options = {}) {
    const targetUrl = appendPath(getBaseUrl(), apiPath);
    const headers = { ...(options.headers || {}) };

    if (isSudoclaw()) {
        delete headers['X-API-Key'];
        delete headers['x-api-key'];
        return {
            url: process.env.SUDOWORK_AUTH_PROXY_URL,
            options: {
                ...options,
                headers: {
                    ...headers,
                    Authorization: `Bearer ${process.env.SUDOWORK_AUTH_PROXY_TOKEN}`,
                    'X-Secret-Namespace': 'service:shareone',
                    'X-Remote-URL': targetUrl,
                    'X-Auth-Scheme': 'header',
                    'X-Auth-Header': 'X-API-Key',
                    'X-Secret-Key': 'X-API-Key'

                },
            },
        };
    }

    if (options.authRequired !== false) {
        const apiKey = resolveDirectApiKey(options.apiKey);
        if (apiKey) headers['X-API-Key'] = apiKey;
    }

    return {
        url: targetUrl,
        options: {
            ...options,
            headers,
        },
    };
}

async function requestShareOneBuffer(apiPath, options = {}, body = null) {
    const built = buildShareOneRequest(apiPath, options);
    return requestBuffer(built.url, built.options, body);
}

async function requestShareOneJson(apiPath, options = {}, payload = null) {
    const body = payload === null ? null : JSON.stringify(payload);
    const headers = {
        ...(options.headers || {}),
        'Content-Type': 'application/json',
    };
    if (body !== null) headers['Content-Length'] = Buffer.byteLength(body);

    const res = await requestShareOneBuffer(apiPath, {
        ...options,
        headers,
    }, body);
    return JSON.parse(res.text);
}

module.exports = {
    DEFAULT_BASE_URL,
    appendPath,
    getBaseUrl,
    getCredentialsPath,
    isSudoclaw,
    readLocalApiKey,
    requestBuffer,
    requestShareOneBuffer,
    requestShareOneJson,
    resolveDirectApiKey,
    saveLocalApiKey,
};
