/**
 * ========================================
 * TROVATASK v19.0 ULTRA (A+ OPTIMIZED)
 * Utility Functions & Classes
 * Optimized for 10,000+ concurrent users
 * ========================================
 */

const config = require('./config');

// ========================================
// RATE LIMITER (Token Bucket Algorithm)
// ========================================

class RateLimiter {
  constructor(maxRequests, interval = 1000) {
    this.maxRequests = maxRequests;
    this.interval = interval;
    this.requests = [];
  }
  
  async acquire() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.interval);
    
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return;
    }
    
    // ✅ Log when throttling occurs
    if (this.requests.length >= this.maxRequests * 0.9) {
      console.log('[RateLimiter] Approaching limit - throttling requests...');
    }
    
    const oldestRequest = this.requests[0];
    const waitTime = this.interval - (now - oldestRequest);
    await new Promise(resolve => setTimeout(resolve, Math.max(waitTime, 0)));
    
    return this.acquire();
  }
}

// ========================================
// CONCURRENCY LIMITER
// ========================================

class ConcurrencyLimiter {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }
  
  async run(fn) {
    while (this.running >= this.maxConcurrent) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    
    this.running++;
    
    try {
      return await fn();
    } finally {
      this.running--;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }
}

// ========================================
// RETRY WITH EXPONENTIAL BACKOFF
// ========================================

async function fastRetry(fn, maxRetries = config.MAX_RETRIES) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // ✅ IMPROVEMENT: Check error codes more robustly
      // Don't retry on permanent errors (404, 400, 401, 403)
      if (error.code === 404 || error.code === 400 || error.code === 401 || error.code === 403) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = config.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

// ========================================
// MESSAGE FORMATTER (WITH TEXT TRUNCATION)
// ========================================

function formatNotification(type, text, senderName) {
  // ✅ IMPROVEMENT: Helper function for text truncation
  const truncate = (str, maxLength) => {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
  };
  
  let title, body;
  
  switch (type) {
    case 'image':
      title = truncate(`${senderName} sent a photo`, 50);
      body = '📷 Image';
      break;
    
    case 'video':
      title = truncate(`${senderName} sent a video`, 50);
      body = '🎥 Video';
      break;
    
    case 'audio':
      title = truncate(`${senderName} sent voice message`, 50);
      body = '🎤 Audio';
      break;
    
    case 'file':
      title = truncate(`${senderName} sent a file`, 50);
      body = '📎 File';
      break;
    
    case 'location':
      title = truncate(`${senderName} shared location`, 50);
      body = '📍 Location';
      break;
    
    default:
      title = truncate(senderName, 50);
      body = truncate(text, config.MAX_TEXT_LENGTH || 100);
  }
  
  return { title, body };
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  RateLimiter,          // ✅ Fixed: Export as RateLimiter (not ProRateLimiter)
  ConcurrencyLimiter,
  fastRetry,
  formatNotification
};
