#!/usr/bin/env node

// Word content operations preserve the original share URL and its settings.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {commandLine} = require('./cli_args');
const {emitError, parseShareReference, getBaseUrl, detectCredentialMode,
    CREDENTIAL_MODE_SUDOWORK_PROXY, resolveDirectApiKey, requestShareOneBuffer,
    printShareOneScriptError} = require('./shareone_client');

const {values, positional: ref} = commandLine({
    summary: 'bind an existing Word share to a same-owner ShareOne Word base, or replace a direct Word base in place. Both preserve the original URL and settings.',
    result: 'committed share JSON, or an offline request preview with --dry-run. After replacing a base, use refresh_share.js on recipient shares to update their cached downloads immediately.',
    positional: 'word_share_link_or_id', options: {
        '--remote-url': {value: 'url', description: 'Direct, same-owner ShareOne Word source. Mutually exclusive with --file. No external URLs or pointer chains.'},
        '--file': {value: 'path', description: 'Local .doc/.docx replacement for a direct Word base; at most 16 MiB. Keeps the existing filename and Word format.'},
        '--api-key': true, '--base-url': true,
        '--dry-run': {description: 'Validate input and print request metadata without credentials or network access.'},
    },
});

(async () => {
    const parsed = parseShareReference(ref);
    if (!parsed.shareRef || (parsed.prefix && parsed.prefix !== 'word')) emitError('BAD_ARGS', 'Provide a Word share URL or ID.');
    if ((values['remote-url'] !== undefined) === (values.file !== undefined)) {
        emitError('BAD_ARGS', 'Provide exactly one of --remote-url or --file.');
    }
    let endpoint = `/api/v1/files/${encodeURIComponent(parsed.shareRef)}`;
    let body, headers, preview;
    if (values['remote-url'] !== undefined) {
        let source;
        try { source = new URL(values['remote-url']); } catch { emitError('BAD_ARGS', 'Provide a ShareOne Word source URL.'); }
        if (source.protocol !== 'https:' || !['s.shareone.vip','shareone.vip','shareone.app'].includes(source.hostname)
            || source.username || source.password || !/^\/word\/[^/]+$/.test(source.pathname) || source.search || source.hash) {
            emitError('BAD_ARGS', 'Provide an HTTPS ShareOne Word source URL without credentials or query parameters.');
        }
        const payload = {remote_url: source.href};
        body = Buffer.from(JSON.stringify(payload));
        headers = {'Content-Type': 'application/json', 'Content-Length': body.length};
        preview = {payload};
    } else {
        const ext = path.extname(values.file).toLowerCase();
        if (!['.doc','.docx'].includes(ext)) emitError('BAD_ARGS', 'Replacement must be a .doc or .docx file.');
        const stat = fs.statSync(values.file);
        if (!stat.isFile() || !stat.size || stat.size > 16 * 1024 * 1024) emitError('BAD_ARGS', 'Replacement must be a nonempty Word file of at most 16 MiB.');
        const data = fs.readFileSync(values.file);
        const digest = crypto.createHash('sha256').update(data).digest('hex');
        const boundary = 'shareone-word-' + crypto.randomBytes(16).toString('hex');
        const mime = ext === '.doc' ? 'application/msword' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        // The server retains the existing filename; use a safe multipart filename.
        body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="replacement${ext}"\r\nContent-Type: ${mime}\r\n\r\n`),
            data, Buffer.from(`\r\n--${boundary}--\r\n`)]);
        headers = {'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length};
        endpoint += '/content';
        preview = {bytes: data.length, content_sha256: digest};
    }
    if (values['dry-run']) {
        console.log(JSON.stringify({method: 'PUT', api_path: endpoint, base_url: getBaseUrl(), ...preview}, null, 2));
        return;
    }
    const credential = await detectCredentialMode();
    if (credential.mode === CREDENTIAL_MODE_SUDOWORK_PROXY && values['api-key']) emitError('SUDOWORK_MANAGED_KEY');
    if (credential.mode !== CREDENTIAL_MODE_SUDOWORK_PROXY && !resolveDirectApiKey(values['api-key'])) emitError('KEY_NOT_FOUND');
    const response = await requestShareOneBuffer(endpoint, {method: 'PUT', apiKey: values['api-key'], headers}, body);
    const result = JSON.parse(response.data.toString('utf8'));
    if (!result.share_id || !result.share_url) emitError('INVALID_RESPONSE', 'Word update did not return a confirmed share.');
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
})().catch(error => process.exit(printShareOneScriptError(error)));
