const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {fixture, json} = require('./http_fixture');

test('Word binding changes only the source on the existing share', async t => {
    const f = await fixture(t, (_, res) => json(res, {share_id:'recipient',share_url:'https://s.shareone.vip/word/recipient'}));
    const reply = await f.run('word_share', ['https://s.shareone.vip/word/recipient','--remote-url','https://s.shareone.vip/word/base']);
    assert.equal(reply.status,0,reply.stderr);
    assert.equal(f.requests[0].method,'PUT');
    assert.equal(f.requests[0].path,'/api/v1/files/recipient');
    assert.deepEqual(JSON.parse(f.requests[0].body),{remote_url:'https://s.shareone.vip/word/base'});
    const preview = await f.run('word_share', ['recipient','--remote-url','https://s.shareone.vip/word/base','--dry-run']);
    assert.equal(preview.status,0,preview.stderr);
    assert.equal(f.requests.length,1);
});

test('Word replacement sends bytes to the original content endpoint', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'shareone-word-test-'));
    t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
    const file = path.join(dir,'example.docx');
    fs.writeFileSync(file,Buffer.from([80,75,0,255,42]));
    const f = await fixture(t, (_, res) => json(res,{share_id:'base',share_url:'https://s.shareone.vip/word/base'}));
    const reply = await f.run('word_share',['base','--file',file]);
    assert.equal(reply.status,0,reply.stderr);
    assert.equal(f.requests[0].path,'/api/v1/files/base/content');
    assert.match(f.requests[0].headers['content-type'],/multipart\/form-data/);
    assert.match(f.requests[0].body,/filename="replacement.docx"/);
});

test('Word invalid input and help have no request side effects', async t => {
    const f = await fixture(t, (_, res) => json(res,{}));
    for (const args of [[], [''], ['recipient'], ['recipient','--remote-url','https://evil.test/word/base'],
        ['https://shareone.vip/s/html','--remote-url','https://s.shareone.vip/word/base'],
        ['recipient','--remote-url','https://s.shareone.vip/word/base','--file','x.docx']]) {
        const reply = await f.run('word_share',args);
        assert.notEqual(reply.status,0);
    }
    const help = await f.run('word_share',['--help']);
    assert.equal(help.status,0);
    assert.equal(f.requests.length,0);
});
