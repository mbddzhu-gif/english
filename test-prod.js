const https = require('https');

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data.substring(0, 500) }));
        }).on('error', reject);
    });
}

async function test() {
    const base = 'https://english.maibaoai.com';
    
    console.log('Testing production deployment...\n');
    
    // Test 1: Root page
    try {
        const r = await fetch(base + '/');
        console.log('1. Root / :', r.status, r.body.substring(0, 100));
    } catch (e) {
        console.log('1. Root / : ERROR -', e.message);
    }
    
    // Test 2: Health API
    try {
        const r = await fetch(base + '/api/health');
        console.log('2. /api/health :', r.status, r.body.substring(0, 100));
    } catch (e) {
        console.log('2. /api/health : ERROR -', e.message);
    }
    
    // Test 3: Auth API
    try {
        const r = await fetch(base + '/api/auth?action=login');
        console.log('3. /api/auth?action=login :', r.status, r.body.substring(0, 100));
    } catch (e) {
        console.log('3. /api/auth?action=login : ERROR -', e.message);
    }
    
    // Test 4: Admin page
    try {
        const r = await fetch(base + '/admin.html');
        console.log('4. /admin.html :', r.status, r.body.substring(0, 100));
    } catch (e) {
        console.log('4. /admin.html : ERROR -', e.message);
    }
    
    // Test 5: CSS file
    try {
        const r = await fetch(base + '/css/style.css');
        console.log('5. /css/style.css :', r.status, r.body.substring(0, 80));
    } catch (e) {
        console.log('5. /css/style.css : ERROR -', e.message);
    }
    
    console.log('\nDone!');
}

test();
