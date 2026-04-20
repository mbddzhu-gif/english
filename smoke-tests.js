function createRes() {
    const headers = {};
    const out = { statusCode: 200, jsonBody: undefined, ended: false };
    return {
        _out: out,
        setHeader(k, v) { headers[k.toLowerCase()] = v; },
        status(code) { out.statusCode = code; return this; },
        json(body) { out.jsonBody = body; out.ended = true; return this; },
        end() { out.ended = true; return this; }
    };
}

async function run() {
    const results = [];

    {
        process.env.XUNFEI_API_KEY = 'test_key';
        process.env.XUNFEI_API_SECRET = 'test_secret';
        delete require.cache[require.resolve('./api/_lib')];
        const fn = require('./api/xunfei/auth-iat/index.js');
        const res = createRes();
        await fn({ method: 'GET' }, res);
        results.push(['xunfei auth-iat GET', res._out.statusCode === 200 && typeof res._out.jsonBody?.url === 'string' && res._out.jsonBody.url.startsWith('wss://iat-api.xfyun.cn')]);
    }

    {
        process.env.XUNFEI_API_KEY = '';
        process.env.XUNFEI_API_SECRET = '';
        delete require.cache[require.resolve('./api/_lib')];
        delete require.cache[require.resolve('./api/xunfei/auth-ise/index.js')];
        const fn = require('./api/xunfei/auth-ise/index.js');
        const res = createRes();
        await fn({ method: 'GET' }, res);
        results.push(['xunfei auth-ise missing env', res._out.statusCode === 500]);
    }

    {
        delete process.env.MINIMAX_API_KEY;
        const { minimaxRequest } = require('./api/_lib');
        let ok = false;
        try {
            await minimaxRequest('/v1/text/chatcompletion_v2', { test: true });
        } catch (e) {
            ok = String(e && e.message).includes('Missing MINIMAX_API_KEY');
        }
        results.push(['minimaxRequest missing env', ok]);
    }

    const failed = results.filter(([, ok]) => !ok);
    for (const [name, ok] of results) {
        process.stdout.write(`${ok ? 'PASS' : 'FAIL'} - ${name}\n`);
    }
    if (failed.length) process.exit(1);
}

run().catch((e) => {
    process.stderr.write((e && e.stack) ? e.stack : String(e));
    process.exit(1);
});

