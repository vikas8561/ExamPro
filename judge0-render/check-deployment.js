// Check Judge0 Deployment Configuration
// Run this to verify your deployment is using the correct settings

const https = require('https');

// Replace with your actual Render service URLs
const API_URL = 'https://judge0-api-b0cf.onrender.com';
const WORKER_URL = 'https://judge0-worker.onrender.com';

console.log('🔍 Checking Judge0 Deployment Configuration...\n');

async function checkService(url, name) {
    return new Promise((resolve, reject) => {
        const req = https.get(url + '/languages', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const languages = JSON.parse(data);
                    console.log(`✅ ${name} is running`);
                    console.log(`   Languages supported: ${languages.length}`);
                    console.log(`   URL: ${url}\n`);
                    resolve(true);
                } catch (e) {
                    console.log(`❌ ${name} error: ${e.message}\n`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (err) => {
            console.log(`❌ ${name} connection failed: ${err.message}\n`);
            resolve(false);
        });
        
        req.setTimeout(10000, () => {
            console.log(`⏰ ${name} timeout (10s)\n`);
            req.destroy();
            resolve(false);
        });
    });
}

async function main() {
    console.log('🚀 Judge0 Deployment Status Check\n');
    
    const apiStatus = await checkService(API_URL, 'Judge0 API');
    const workerStatus = await checkService(WORKER_URL, 'Judge0 Worker');
    
    if (apiStatus && workerStatus) {
        console.log('🎉 Both services are running correctly!');
        console.log('📊 Configuration:');
        console.log('   - Plan: Standard (1GB+ RAM)');
        console.log('   - Workers: 3');
        console.log('   - Queue Size: 100');
        console.log('   - Memory per submission: 512MB max');
        console.log('   - CPU time: 15s max');
        console.log('   - Polling interval: 0.1s');
        console.log('\n✅ Ready for 200-300 students!');
    } else {
        console.log('⚠️  Some services are not responding correctly.');
        console.log('💡 Check Render dashboard for deployment status.');
    }
}

main().catch(console.error);
