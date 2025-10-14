// Simple Judge0 Test to diagnose 500 errors

const https = require('https');

const API_URL = 'https://judge0-api-b0cf.onrender.com';

console.log('🔍 Simple Judge0 API Test');
console.log('API URL:', API_URL);
console.log('='.repeat(50));

async function testEndpoint(endpoint) {
    return new Promise((resolve, reject) => {
        console.log(`\n🔍 Testing: ${endpoint}`);
        
        const req = https.get(`${API_URL}${endpoint}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`Status: ${res.statusCode}`);
                console.log(`Headers:`, res.headers);
                
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        console.log('✅ Success:', typeof json, Array.isArray(json) ? `(${json.length} items)` : '');
                        if (Array.isArray(json) && json.length > 0) {
                            console.log('Sample item:', json[0]);
                        }
                    } catch (e) {
                        console.log('Response (text):', data.substring(0, 200));
                    }
                } else {
                    console.log('❌ Error Response:', data.substring(0, 500));
                }
                resolve(res.statusCode);
            });
        });
        
        req.on('error', (err) => {
            console.log('❌ Connection Error:', err.message);
            resolve(0);
        });
        
        req.setTimeout(10000, () => {
            console.log('⏰ Timeout');
            req.destroy();
            resolve(0);
        });
    });
}

async function main() {
    console.log('🚀 Starting Simple API Tests...\n');
    
    const endpoints = [
        '/',
        '/languages',
        '/statuses',
        '/config',
        '/ping',
        '/health'
    ];
    
    for (const endpoint of endpoints) {
        await testEndpoint(endpoint);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🔍 Test Summary:');
    console.log('- Check which endpoints return 200 vs 500');
    console.log('- 500 errors indicate server configuration issues');
    console.log('- Check Render service logs for detailed errors');
}

main().catch(console.error);
