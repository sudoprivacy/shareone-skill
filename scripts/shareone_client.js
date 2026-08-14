const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_URL = 'https://shareone.app';
const CREDENTIALS_FILENAME = '.shareone_credentials';
const SUDOWORK_SECRET_NAMESPACE = 'service:shareone';
const SUDOWORK_SECRET_KEY = 'X-API-Key';
const CREDENTIAL_MODE_DIRECT = 'direct';
const CREDENTIAL_MODE_SUDOWORK_PROXY = 'sudowork_proxy';
const CREDENTIAL_MODE_DIRECT_FALLBACK = 'direct_fallback';

let credentialModePromise = null;

function isSudowork() {
    return Boolean(process.env.SUDOWORK_AUTH_PROXY_URL && process.env.SUDOWORK_AUTH_PROXY_TOKEN);
}

function getSudoworkBaseUrl() {
    return process.env.SUDOWORK_AUTH_PROXY_BASE_URL || String(process.env.SUDOWORK_AUTH_PROXY_URL || '').replace(/\/proxy\/?$/, '');
}

function getBaseUrl() {
    return process.env.SHAREONE_BASE_URL || DEFAULT_BASE_URL;
}

function getSkillCredentialsPath() {
    return path.join(path.resolve(__dirname, '..'), CREDENTIALS_FILENAME);
}

function getCredentialPathCandidates() {
    return [getSkillCredentialsPath()];
}

function canWriteCredentialsPath(credentialsPath) {
    try {
        if (fs.existsSync(credentialsPath)) {
            fs.accessSync(credentialsPath, fs.constants.W_OK);
            return true;
        }

        const raw = String(credentialsPath);
        const lastSlash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
        const parent = lastSlash > 0 ? raw.slice(0, lastSlash) : path.dirname(raw);
        fs.accessSync(parent, fs.constants.W_OK);
        return true;
    } catch (_) {
        return false;
    }
}

function getCredentialsPath() {
    return getSkillCredentialsPath();
}

function readLocalApiKey() {
    for (const credentialsPath of getCredentialPathCandidates()) {
        if (!fs.existsSync(credentialsPath)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            if (data && data.api_key) return data.api_key;
        } catch (_) {
            // Try the next candidate.
        }
    }
    return null;
}

function resolveDirectApiKey(explicitApiKey) {
    return explicitApiKey || process.env.SHAREONE_API_KEY || readLocalApiKey();
}

function saveLocalApiKey(apiKey) {
    const candidates = getCredentialPathCandidates();
    const credentialsPath = candidates.find(canWriteCredentialsPath) || candidates[candidates.length - 1] || getCredentialsPath();
    fs.writeFileSync(credentialsPath, JSON.stringify({ api_key: apiKey }), { mode: 0o600 });
    try {
        fs.chmodSync(credentialsPath, 0o600);
    } catch (_) {
        // Best-effort on filesystems that do not support POSIX permissions.
    }
    return credentialsPath;
}

function deleteLocalApiKey() {
    let deleted = false;
    for (const credentialsPath of getCredentialPathCandidates()) {
        try {
            if (!fs.existsSync(credentialsPath)) continue;
            fs.unlinkSync(credentialsPath);
            deleted = true;
        } catch (_) {
            // Try deleting the next candidate.
        }
    }
    return deleted;
}

function appendPath(baseUrl, apiPath) {
    const trimmedBase = String(baseUrl).replace(/\/+$/, '');
    const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    return `${trimmedBase}${normalizedPath}`;
}

const MAX_REDIRECTS = 5;

// Header names that carry credentials; stripped when a redirect crosses hosts
// so we never hand the API key to a different origin.
const AUTH_HEADER_NAMES = ['x-api-key', 'authorization'];

function stripAuthHeaders(headers) {
    const next = {};
    for (const key of Object.keys(headers || {})) {
        if (!AUTH_HEADER_NAMES.includes(key.toLowerCase())) next[key] = headers[key];
    }
    return next;
}

// --- Proxy support -------------------------------------------------------
// Node's built-in http/https clients ignore HTTPS_PROXY/HTTP_PROXY/NO_PROXY
// (unlike curl/git/python-requests). In proxy-only-egress environments
// (corporate VPN + Clash/Verge system proxy) direct DNS is blocked, so every
// command fails with ENOTFOUND even though the proxy is reachable. Honor the
// standard env vars: tunnel HTTPS via CONNECT, proxy plain HTTP via absolute
// URI. localhost and NO_PROXY hosts stay DIRECT — so the local Sudowork auth
// proxy (127.0.0.1) is never itself re-proxied.

function shouldBypassProxy(host) {
    const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
    const noProxy = (process.env.NO_PROXY || process.env.no_proxy || '')
        .split(',').map(s => s.trim().toLowerCase().replace(/^\[|\]$/g, '')).filter(Boolean);
    return noProxy.some(entry => entry === '*' || h === entry ||
        h.endsWith('.' + entry.replace(/^\./, '')) || (entry.startsWith('.') && h.endsWith(entry)));
}

function resolveProxyUrl(target) {
    const raw = target.protocol === 'https:'
        ? (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy)
        : (process.env.HTTP_PROXY || process.env.http_proxy);
    if (!raw || shouldBypassProxy(target.hostname)) return null;
    try { return new URL(raw); } catch (_) { return null; }
}

function proxyAuthHeader(proxyUrl) {
    if (!proxyUrl.username) return null;
    const creds = decodeURIComponent(proxyUrl.username) + ':' + decodeURIComponent(proxyUrl.password || '');
    return 'Basic ' + Buffer.from(creds).toString('base64');
}

// https.Agent that reaches the origin through an HTTP CONNECT tunnel.
function connectTunnelAgent(proxyUrl) {
    const auth = proxyAuthHeader(proxyUrl);
    return new (class extends https.Agent {
        createConnection(opts, cb) {
            const host = opts.host || opts.hostname;
            const port = Number(opts.port) || 443;
            const sock = net.connect(Number(proxyUrl.port) || 80, proxyUrl.hostname);
            let settled = false;
            const fail = (err) => { if (!settled) { settled = true; sock.destroy(); cb(err); } };
            sock.once('error', fail);
            sock.once('connect', () => {
                let line = `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n`;
                if (auth) line += `Proxy-Authorization: ${auth}\r\n`;
                sock.write(line + '\r\n');
            });
            let buf = Buffer.alloc(0);
            const onData = (chunk) => {
                buf = Buffer.concat([buf, chunk]);
                if (buf.indexOf('\r\n\r\n') === -1) return;
                sock.removeListener('data', onData);
                const statusLine = buf.slice(0, buf.indexOf('\r\n')).toString();
                if (!/^HTTP\/\d(?:\.\d)? 200/.test(statusLine)) {
                    return fail(new Error(`Proxy CONNECT failed: ${statusLine}`));
                }
                // Verify the origin cert by default (secure), but don't hardcode
                // rejectUnauthorized — leaving it to the TLS default lets standard
                // env vars work: NODE_EXTRA_CA_CERTS for a corporate MITM-proxy CA
                // (common in these environments), and forward an explicit ca/flag
                // if the caller set one.
                const tlsOpts = { socket: sock, servername: host };
                if (opts.ca) tlsOpts.ca = opts.ca;
                if (opts.rejectUnauthorized !== undefined) tlsOpts.rejectUnauthorized = opts.rejectUnauthorized;
                const tlsSock = tls.connect(tlsOpts, () => { settled = true; cb(null, tlsSock); });
                tlsSock.once('error', fail);
            };
            sock.on('data', onData);
        }
    })();
}

function requestBuffer(url, options = {}, body = null, redirectsLeft = MAX_REDIRECTS) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const isHttps = target.protocol === 'https:';
        const client = isHttps ? https : http;
        const proxyUrl = resolveProxyUrl(target);

        const handleResponse = (res) => {
            // Follow redirects — Node's http client does not auto-follow, so a
            // bare `curl` would succeed where this used to surface the 3xx as an
            // error (e.g. an infra http->https / trailing-slash 301 on a DELETE).
            // Preserve the method and body (API redirects are transport-level,
            // not a POST->GET downgrade); drop the API key on a cross-host hop.
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
                res.resume(); // drain so the socket can be reused
                let nextUrl;
                try {
                    nextUrl = new URL(res.headers.location, target);
                } catch (_) {
                    nextUrl = null;
                }
                if (nextUrl) {
                    const sameHost = nextUrl.host === target.host;
                    const headers = sameHost ? (options.headers || {}) : stripAuthHeaders(options.headers || {});
                    resolve(requestBuffer(nextUrl.toString(), { ...options, headers }, body, redirectsLeft - 1));
                    return;
                }
            }
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
        };

        const reqOptions = {
            method: options.method || 'GET',
            headers: { ...(options.headers || {}) },
        };
        let req;
        if (proxyUrl && !isHttps) {
            // Plain-HTTP target: ask the proxy for the absolute URL.
            const auth = proxyAuthHeader(proxyUrl);
            req = client.request({
                hostname: proxyUrl.hostname,
                port: Number(proxyUrl.port) || 80,
                path: target.href,
                method: reqOptions.method,
                headers: { ...reqOptions.headers, host: target.host, ...(auth ? { 'proxy-authorization': auth } : {}) },
            }, handleResponse);
        } else {
            // HTTPS (tunnelled via CONNECT when proxied) or direct.
            if (proxyUrl) reqOptions.agent = connectTunnelAgent(proxyUrl);
            req = client.request(target, reqOptions, handleResponse);
        }

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

function buildJsonRequestBody(payload) {
    const body = payload === null ? null : JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };
    if (body !== null) headers['Content-Length'] = Buffer.byteLength(body);
    return { body, headers };
}

async function requestJsonUrl(url, options = {}, payload = null) {
    const { body, headers } = buildJsonRequestBody(payload);
    const res = await requestBuffer(url, {
        ...options,
        headers: {
            ...headers,
            ...(options.headers || {}),
        },
    }, body);
    return JSON.parse(res.text);
}

async function requestPublicShareOneJson(apiPath, options = {}, payload = null) {
    return requestJsonUrl(appendPath(getBaseUrl(), apiPath), options, payload);
}

function buildSudoworkSecretsUrl(pathSuffix = '') {
    const baseUrl = getSudoworkBaseUrl();
    if (!baseUrl) {
        throw new Error('SUDOWORK_AUTH_PROXY_BASE_URL is not available');
    }
    return appendPath(baseUrl, `/secrets${pathSuffix}`);
}

async function requestSudoworkSecrets(pathSuffix = '', options = {}, payload = null) {
    if (!isSudowork()) {
        throw new Error('Sudowork environment is not available');
    }
    const { body, headers } = buildJsonRequestBody(payload);
    const res = await requestBuffer(buildSudoworkSecretsUrl(pathSuffix), {
        ...options,
        headers: {
            ...headers,
            ...(options.headers || {}),
            Authorization: `Bearer ${process.env.SUDOWORK_AUTH_PROXY_TOKEN}`,
        },
    }, body);
    return JSON.parse(res.text);
}

async function listSudoworkSecrets(namespace = SUDOWORK_SECRET_NAMESPACE) {
    const query = `?namespace=${encodeURIComponent(namespace)}`;
    const result = await requestSudoworkSecrets(query, { method: 'GET' }, null);
    return Array.isArray(result.data) ? result.data : [];
}

function hasShareOneSecret(secrets) {
    return secrets.some(secret => secret && secret.namespace === SUDOWORK_SECRET_NAMESPACE && secret.key === SUDOWORK_SECRET_KEY);
}

async function hasSudoworkApiKey() {
    const mode = await detectCredentialMode();
    return mode.mode === CREDENTIAL_MODE_SUDOWORK_PROXY && mode.hasSudoworkKey;
}

async function detectCredentialMode({ refresh = false } = {}) {
    if (!refresh && credentialModePromise) return credentialModePromise;

    credentialModePromise = (async () => {
        if (!isSudowork()) {
            return {
                mode: CREDENTIAL_MODE_DIRECT,
                isSudowork: false,
                sudoworkAvailable: false,
                hasSudoworkKey: false,
                secrets: [],
                error: null,
            };
        }

        try {
            const secrets = await listSudoworkSecrets(SUDOWORK_SECRET_NAMESPACE);
            return {
                mode: CREDENTIAL_MODE_SUDOWORK_PROXY,
                isSudowork: true,
                sudoworkAvailable: true,
                hasSudoworkKey: hasShareOneSecret(secrets),
                secrets,
                error: null,
            };
        } catch (error) {
            return {
                mode: CREDENTIAL_MODE_DIRECT_FALLBACK,
                isSudowork: true,
                sudoworkAvailable: false,
                hasSudoworkKey: false,
                secrets: [],
                error,
            };
        }
    })();

    return credentialModePromise;
}

function resetCredentialModeCache() {
    credentialModePromise = null;
}

async function saveSudoworkApiKey(apiKey) {
    const pathSuffix = `/${encodeURIComponent(SUDOWORK_SECRET_NAMESPACE)}/${encodeURIComponent(SUDOWORK_SECRET_KEY)}`;
    return requestSudoworkSecrets(pathSuffix, { method: 'PUT' }, {
        value: apiKey,
        description: 'ShareOne API Key',
    });
}

async function deleteSudoworkApiKey() {
    const pathSuffix = `/${encodeURIComponent(SUDOWORK_SECRET_NAMESPACE)}/${encodeURIComponent(SUDOWORK_SECRET_KEY)}`;
    return requestSudoworkSecrets(pathSuffix, { method: 'DELETE' }, null);
}

async function buildShareOneRequest(apiPath, options = {}) {
    const targetUrl = appendPath(getBaseUrl(), apiPath);
    const headers = { ...(options.headers || {}) };
    const credentialMode = await detectCredentialMode();

    if (credentialMode.mode === CREDENTIAL_MODE_SUDOWORK_PROXY && options.authRequired !== false) {
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
    const built = await buildShareOneRequest(apiPath, options);
    return requestBuffer(built.url, built.options, body);
}

async function requestShareOneJson(apiPath, options = {}, payload = null) {
    const { body, headers } = buildJsonRequestBody(payload);

    const res = await requestShareOneBuffer(apiPath, {
        ...options,
        headers: {
            ...headers,
            ...(options.headers || {}),
        },
    }, body);
    return JSON.parse(res.text);
}

function getErrorDetail(error) {
    const text = String(error && error.responseText ? error.responseText : '');
    if (!text) return '';
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') {
            return text;
        }
        const detail = parsed.detail;
        if (detail && typeof detail === 'object') {
            return String(detail.message || detail.code || parsed.message || text);
        }
        return String(detail || parsed.message || text);
    } catch (_) {
        return text;
    }
}

function isSudoworkMissingKeyError(error) {
    if (!error) return false;
    const detail = getErrorDetail(error);

    if (error.statusCode === 502) {
        return /secret|key|credential|not found|missing|未配置|不存在|缺少/i.test(detail || error.message || '');
    }

    if (error.statusCode !== 401) return false;
    return /Missing API Key/i.test(detail);
}

function isAuthFailedError(error) {
    if (!error) return false;
    if (error.statusCode === 401 || error.statusCode === 403) return true;
    const detail = getErrorDetail(error);
    return /Invalid API Key|Inactive user|unauthorized|forbidden|权限不足|无效/i.test(detail || error.message || '');
}

function printShareOneScriptError(error) {
    if (isSudowork() && isSudoworkMissingKeyError(error)) {
        console.error("ERROR:SUDOWORK_ENV_OK_KEY_NOT_FOUND");
        console.error("请先运行 check_api_key.js，并按提示通过 save_api_key.js 或 create_guest_key.js 设置 ShareOne API Key。");
        return;
    }

    if (isAuthFailedError(error)) {
        console.error("ERROR:AUTH_FAILED");
        console.error("API Key 无效或权限不足。");
        return;
    }

    console.error(`ERROR:${error.message}`);
}

// Agent comment-reply lifecycle states — the single skill-side source of truth.
// The SERVER (`AGENT_REPLY_STATES` in backend/routers/comments.py) is the
// authoritative validator (422 on an invalid/missing state); this mirror exists
// so comment_reply.js / comment_resolve.js never hardcode the state strings in
// more than one place. Keys are the wire values; values are the human hint.
const AGENT_REPLY_STATES = {
    'resolved-agree': '同意并已处理 → 评论收敛为 resolved',
    'open-disagree': '不同意（在 --content 里写清理由），但保持 open，把关闭权交回提出者（AI 不 dismiss）',
    'open-need-input': '需要人类进一步澄清 → 保持 open',
};

// Extract the trailing share ref (slug or 16-char share_id) from a full URL, a
// `/s/<ref>` path, a raw-file `/file/<ref>` path, an API `/api/.../shares/<ref>`
// path, or a bare ref. Shared by every script that accepts a
// `<share_link_or_ref>` positional arg.
function extractShareRef(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        const parsed = raw.includes('://') ? new URL(raw) : null;
        const path = parsed ? parsed.pathname : raw.split('?')[0].split('#')[0];
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 0) return raw;
        if (parts[0] === 'file' && parts.length >= 2) return parts[1];
        if (parts[0] === 'api' && parts.includes('shares')) {
            const index = parts.indexOf('shares');
            return parts[index + 1] || raw;
        }
        return parts[parts.length - 1] || raw;
    } catch (_) {
        return raw;
    }
}

module.exports = {
    AGENT_REPLY_STATES,
    CREDENTIAL_MODE_DIRECT,
    CREDENTIAL_MODE_DIRECT_FALLBACK,
    CREDENTIAL_MODE_SUDOWORK_PROXY,
    DEFAULT_BASE_URL,
    SUDOWORK_SECRET_KEY,
    SUDOWORK_SECRET_NAMESPACE,
    appendPath,
    deleteLocalApiKey,
    deleteSudoworkApiKey,
    detectCredentialMode,
    extractShareRef,
    getBaseUrl,
    getCredentialPathCandidates,
    getCredentialsPath,
    getSkillCredentialsPath,
    hasSudoworkApiKey,
    isSudowork,
    isAuthFailedError,
    isSudoworkMissingKeyError,
    listSudoworkSecrets,
    printShareOneScriptError,
    readLocalApiKey,
    requestBuffer,
    requestPublicShareOneJson,
    requestShareOneBuffer,
    requestShareOneJson,
    resetCredentialModeCache,
    resolveDirectApiKey,
    saveLocalApiKey,
    saveSudoworkApiKey,
};
