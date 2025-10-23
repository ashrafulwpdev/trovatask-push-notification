/**
 * ========================================
 * TROVATASK v18.1 PRO EDITION - AUTO-CLEANUP
 * Main Entry Point (Enhanced Logging)
 * ========================================
 * 
 * NEW IN v18.1:
 * ✅ Automatic invalid device cleanup from Firestore
 * ✅ Prevents retry attempts on deleted Appwrite users
 * ✅ Enhanced logging for device removal
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
  const requestId = Math.random().toString(36).substring(7);
  
  log(`========================================`);
  log(`🚀 TrovaTask Push Notification v18.1 PRO`);
  log(`⏰ Request ID: ${requestId}`);
  log(`⏰ Started: ${new Date().toISOString()}`);
  log(`========================================`);
  
  try {
    // Parse request
    const eventData = JSON.parse(req.bodyRaw || '{}');
    
    log(`📨 Event data received:`);
    log(`→ Recipient: ${eventData.recipientId}`);
    log(`→ Sender: ${eventData.senderId}`);
    log(`→ Chat ID: ${eventData.chatId}`);
    log(`→ Type: ${eventData.type || 'text'}`);
    log(`→ Message: ${eventData.text ? (eventData.text.substring(0, 50) + (eventData.text.length > 50 ? '...' : '')) : 'N/A'}`);
    
    // Quick validation
    if (!eventData.recipientId || !eventData.chatId) {
      log(`❌ Validation failed: Missing required fields`);
      return res.json({
        success: false,
        error: 'Missing required fields: recipientId or chatId'
      }, 400);
    }
    
    log(`✅ Validation passed`);
    log(`📤 Sending notifications...`);
    
    // Handle notification
    const result = await handleNotification(eventData);
    
    const duration = Date.now() - startTime;
    
    log(`========================================`);
    log(`✅ Request completed successfully`);
    log(`⏱️  Duration: ${duration}ms`);
    
    if (result.status === 'delivering') {
      log(`⚡ Early response sent (background processing)`);
      log(`📱 Devices: ${result.devices} total`);
    } else if (result.devices) {
      log(`📱 Devices: ${result.devices.total} total, ${result.devices.success} success, ${result.devices.failed} failed`);
    }
    
    log(`========================================`);
    
    return res.json({
      ...result,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      requestId
    });
    
  } catch (err) {
    const duration = Date.now() - startTime;
    
    error(`========================================`);
    error(`❌ Request failed`);
    error(`⏱️  Duration: ${duration}ms`);
    error(`🐛 Error: ${err.message}`);
    error(`📚 Stack: ${err.stack}`);
    error(`========================================`);
    
    return res.json({
      success: false,
      error: err.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      requestId
    }, 500);
  }
};
