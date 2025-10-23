/**
 * ========================================
 * TROVATASK v18.0 PRO EDITION - ULTRA-FAST
 * Main Entry Point
 * ========================================
 * 
 * OPTIMIZED FOR APPWRITE PRO PLAN:
 * ⚡ 750 req/sec rate limit (Pro)
 * ⚡ Aggressive parallel processing
 * ⚡ Minimal early response threshold (<300ms)
 * ⚡ Maximum throughput
 * 
 * HANDLES: 1000+ concurrent users easily!
 * ========================================
 */

const { handleNotification } = require('./notification');

module.exports = async ({ req, res, log, error }) => {
  const startTime = Date.now();
  
  try {
    // Parse request
    const eventData = JSON.parse(req.bodyRaw || '{}');
    
    // Quick validation
    if (!eventData.recipientId || !eventData.chatId) {
      return res.json({
        success: false,
        error: 'Missing required fields: recipientId or chatId'
      }, 400);
    }
    
    // Handle notification
    const result = await handleNotification(eventData);
    
    const duration = Date.now() - startTime;
    
    log(`✅ Completed in ${duration}ms`);
    
    return res.json({
      ...result,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    const duration = Date.now() - startTime;
    
    error(`❌ Error: ${err.message}`);
    
    return res.json({
      success: false,
      error: err.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }, 500);
  }
};
