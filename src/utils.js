/**
 * TrovaTask Push Notification v18.0 PRO
 * Utility Classes & Functions
 */

const config = require('./config');

// ========================================
// RATE LIMITER
// ========================================

class ProRateLimiter {
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
      // Don't retry on permanent errors
      if (error.code === 404 || error.code === 400) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = config.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

// ========================================
// MESSAGE FORMATTER
// ========================================

function formatNotification(type, text, senderName) {
  let title, body;
  
  switch (type) {
    case 'image':
      title = `${senderName} sent a photo`;
      body = '📷 Image';
      break;
    
    case 'video':
      title = `${senderName} sent a video`;
      body = '🎥 Video';
      break;
    
    case 'audio':
      title = `${senderName} sent voice message`;
      body = '🎤 Audio';
      break;
    
    case 'file':
      title = `${senderName} sent a file`;
      body = '📎 File';
      break;
    
    case 'location':
      title = `${senderName} shared location`;
      body = '📍 Location';
      break;
    
    default:
      title = senderName;
      body = text.length > config.MAX_TEXT_LENGTH 
        ? text.substring(0, config.MAX_TEXT_LENGTH - 3) + '...'
        : text;
  }
  
  return { title, body };
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  ProRateLimiter,
  ConcurrencyLimiter,
  fastRetry,
  formatNotification
};
