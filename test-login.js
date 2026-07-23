const http = require('http');

async function testLoginFlow() {
  console.log("Testing Login Flow...");
  
  // 1. Hit /api/auth/login via Next.js proxy
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password123' }) // Change to whatever your local test setup is
  });
  
  const loginData = await loginRes.json();
  console.log("Login Data:", loginData);
  
  const setCookie = loginRes.headers.get('set-cookie');
  console.log("Set-Cookie Header:", setCookie);
  
  if (!setCookie) return;
  
  // Parse token
  const token = setCookie.match(/token=([^;]+)/)[1];
  console.log("Token:", token.substring(0, 15) + "...");
  
  // 2. Hit /api/auth/verify directly to mimic middleware
  const verifyRes = await fetch('http://127.0.0.1:4000/api/auth/verify', {
    headers: { 'Cookie': `token=${token}` }
  });
  
  const verifyData = await verifyRes.json();
  console.log("Verify Data:", verifyData);
}

testLoginFlow().catch(console.error);
