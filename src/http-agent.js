/**
 * ========================================
 * TROVATASK v19.0 ULTRA (A+ OPTIMIZED)
 * HTTP Connection Pooling & Keep-Alive
 * ========================================
 * 
 * Reuses TCP connections to Appwrite/Firebase
 * Saves 100-200ms per request by avoiding TCP handshake
 */

const http = require('http');
const https = require('https');

// ✅ OPTIMIZATION: HTTP Keep-Alive Agent
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,        // Keep connections alive for 30 seconds
  maxSockets: 50,                // Maximum 50 sockets per host
  maxFreeSockets: 10,            // Keep 10 idle sockets ready
  timeout: 60000,                // 60 second timeout
});

// ✅ OPTIMIZATION: HTTPS Keep-Alive Agent
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

console.log('✅ HTTP/HTTPS agents initialized with keep-alive');

module.exports = { httpAgent, httpsAgent };
