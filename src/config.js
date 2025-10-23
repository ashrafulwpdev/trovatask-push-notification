/**
 * TrovaTask Push Notification v18.1 PRO
 * Configuration
 */

module.exports = {
  // Appwrite Pro Plan Limits
  APPWRITE_RATE_LIMIT: 700,
  RATE_LIMIT_PER_SECOND: 700,  // Alias for backward compatibility
  MAX_CONCURRENT_REQUESTS: 100,
  
  // Retry Configuration
  MAX_RETRIES: 2,
  INITIAL_RETRY_DELAY: 50,
  MAX_RETRY_DELAY: 2000,
  
  // Performance Settings
  BATCH_SIZE: 50,
  REQUEST_TIMEOUT: 8000,
  EARLY_RESPONSE_THRESHOLD: 300,
  MAX_TEXT_LENGTH: 100,
  
  // Features
  ENABLE_CACHING: true,
  CACHE_TTL: 300
};
