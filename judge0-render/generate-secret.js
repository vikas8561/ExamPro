// Generate SECRET_KEY_BASE for Judge0 services

const crypto = require('crypto');

console.log('🔐 Generating SECRET_KEY_BASE for Judge0 services\n');

// Generate a secure random secret key
const secretKey = crypto.randomBytes(64).toString('hex');

console.log('Copy this SECRET_KEY_BASE for both API and Worker services:');
console.log('='.repeat(80));
console.log(secretKey);
console.log('='.repeat(80));

console.log('\n📝 Instructions:');
console.log('1. Copy the SECRET_KEY_BASE above');
console.log('2. Set it as environment variable in both services:');
console.log('   - API Service (Web Service)');
console.log('   - Worker Service (Background Worker)');
console.log('3. Use the same value for both services');

console.log('\n⚠️  Important:');
console.log('- Keep this secret secure');
console.log('- Don\'t share it publicly');
console.log('- Use the same value for both services');
