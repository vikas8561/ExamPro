// Test Database Connection for Judge0
// This will help identify if the issue is database connection or migration

const https = require('https');

const API_URL = 'https://judge0-api-b0cf.onrender.com';

console.log('🔍 Database Connection Test for Judge0');
console.log('='.repeat(50));

async function testDatabaseEndpoints() {
    const endpoints = [
        { path: '/', name: 'Root (Static)' },
        { path: '/statuses', name: 'Statuses (Static)' },
        { path: '/languages', name: 'Languages (Database)' },
        { path: '/submissions', name: 'Submissions (Database)' }
    ];
    
    for (const endpoint of endpoints) {
        console.log(`\n🔍 Testing: ${endpoint.name}`);
        console.log(`Path: ${endpoint.path}`);
        
        try {
            const response = await makeRequest(`${API_URL}${endpoint.path}`);
            console.log(`Status: ${response.status}`);
            
            if (response.status === 200) {
                console.log('✅ SUCCESS');
            } else if (response.status === 500) {
                console.log('❌ DATABASE ERROR - Check logs');
            } else if (response.status === 404) {
                console.log('⚠️  NOT FOUND');
            } else {
                console.log(`⚠️  UNEXPECTED STATUS: ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ CONNECTION ERROR: ${error.message}`);
        }
    }
}

async function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, data });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

async function main() {
    console.log('🚀 Testing Judge0 Database Connection...\n');
    
    await testDatabaseEndpoints();
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Analysis:');
    console.log('- Static endpoints (/, /statuses) should return 200');
    console.log('- Database endpoints (/languages, /submissions) should return 200 if DB is connected');
    console.log('- 500 errors on DB endpoints = Database connection or migration issue');
    console.log('- 404 errors = Endpoint not found (normal for some endpoints)');
    
    console.log('\n💡 Next Steps:');
    console.log('1. If /languages returns 500: Check database connection');
    console.log('2. If /languages returns 404: Check Judge0 configuration');
    console.log('3. Check Render service logs for detailed error messages');
    console.log('4. Ensure services were redeployed after setting environment variables');
}

main().catch(console.error);
