/**
 * ========================================
 * TROVATASK v19.0 ULTRA (A+ OPTIMIZED)
 * Configuration for 10,000+ concurrent users
 * ========================================
 */

// ✅ CRITICAL BUG FIX: Environment variable validation
const requiredVars = [
  'FIREBASE_SERVICE_ACCOUNT',
  'APPWRITE_FUNCTION_API_ENDPOINT',
  'APPWRITE_FUNCTION_PROJECT_ID',
  'APPWRITE_API_KEY'
];

// Validate all required environment variables exist
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`❌ FATAL: Missing required environment variable: ${varName}`);
  }
}

console.log('✅ Environment variables validated');

// ========================================
// PERFORMANCE SETTINGS (A+ OPTIMIZED)
// ========================================

module.exports = {
  // Appwrite Pro Plan Limits (A+ Optimized)
  APPWRITE_RATE_LIMIT: 750,                // ✅ Increased from 700 to 750
  RATE_LIMIT_PER_SECOND: 750,              // ✅ Increased for 10k+ users
  MAX_CONCURRENT_REQUESTS: 50,             // ✅ Optimized from 100 to 50
  
  // Retry Configuration (with exponential backoff)
  MAX_RETRIES: 2,
  INITIAL_RETRY_DELAY: 50,
  MAX_RETRY_DELAY: 2000,
  
  // Performance Settings (A+ Optimized)
  BATCH_SIZE: 50,
  REQUEST_TIMEOUT: 8000,
  EARLY_RESPONSE_THRESHOLD: 150,           // ✅ Reduced from 300ms to 150ms
  MAX_TEXT_LENGTH: 100,
  MAX_TITLE_LENGTH: 50,                    // ✅ Added title length limit
  
  // Features
  ENABLE_CACHING: true,
  CACHE_TTL: 300,
  
  // Deep Link Configuration
  DEEP_LINK_SCHEME: process.env.DEEP_LINK_SCHEME || 'trovatask'
};
