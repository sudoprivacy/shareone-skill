#!/usr/bin/env node
const {setTimeout: sleep} = require('node:timers/promises');
const {performance} = require('node:perf_hooks');
const {parseScriptArgs, requestShareOneJson, emitError, printShareOneScriptError} = require('./shareone_client');

const usage = 'node wait_content_review.js <review_id> [--timeout-seconds 600] [--poll-seconds 5] [--api-key <key>] [--base-url <url>]';
const {values, positionals} = parseScriptArgs(['--timeout-seconds', '--poll-seconds', '--api-key', '--base-url'], 1, usage);
function seconds(name, fallback, maximum) {
    const value = Number(values[name] ?? fallback);
    if (!Number.isFinite(value) || value <= 0 || value > maximum) emitError('BAD_ARGS', `${name} must be >0 and <=${maximum}.`, {hint: usage});
    return value * 1000;
}
const budget = seconds('timeout-seconds', 600, 3600);
const interval = seconds('poll-seconds', 5, 60);
if (!/^[A-Za-z0-9-]{1,100}$/.test(positionals[0])) emitError('BAD_ARGS', 'Invalid review ID.', {hint: usage});

(async () => {
    const deadline = performance.now() + budget;
    while (true) {
        const review = await requestShareOneJson(`/api/v1/content-reviews/${encodeURIComponent(positionals[0])}`,
            {apiKey: values['api-key'], timeoutMs: Math.min(30000, Math.max(1, deadline - performance.now()))});
        if (review.approved === true) {
            console.log(JSON.stringify(review));
            return;
        }
        if (review.approved === false) emitError('CONTENT_REVIEW_DENIED', review.reviewer_note || 'Review rejected.', {detail: review});
        if (review.approved !== null) emitError('INVALID_RESPONSE', 'Review response has no authoritative decision.');
        if (review.status !== 'automatic_pending') emitError('CONTENT_REVIEW_REQUIRED',
            review.automatic_review_evidence?.reason || review.moderation_reason || 'Administrator review is required.',
            {detail: review, hint: 'Keep the share unchanged. Root reviewers can inspect this record in /root-admin; do not retry publication.'});
        const remaining = deadline - performance.now();
        if (remaining <= 0) {
            console.log(JSON.stringify({...review, wait_timed_out: true}));
            process.exitCode = 3;
            return;
        }
        await sleep(Math.min(interval, remaining));
    }
})().catch(error => { process.exitCode = printShareOneScriptError(error); });
