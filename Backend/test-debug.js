// Simple test script to verify backend connectivity and debug endpoints
const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api';
const TEST_TOKEN = 'your-test-token-here'; // Replace with actual token

async function testDebugEndpoints() {
  try {
    console.log('Testing debug endpoints...');
    
    // Test server status
    const statusResponse = await axios.get(`${BASE_URL}/`);
    console.log('Server status:', statusResponse.data);
    
    // Test assignment status endpoint (you'll need to replace with actual assignment ID)
    // const assignmentStatus = await axios.get(`${BASE_URL}/debug/assignment/68a7e9d4378e7c7327ec28dc/status`, {
    //   headers: { Authorization: `Bearer ${TEST_TOKEN}` }
    // });
    // console.log('Assignment status:', assignmentStatus.data);
    
    console.log('Debug endpoints are available at:');
    console.log('- GET /api/debug/check-role');
    console.log('- GET /api/debug/assignment/:id/status');
    console.log('- GET /api/debug/my-assignments');
    console.log('\nMake sure to replace the token and assignment ID with actual values.');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testDebugEndpoints();
