const sdk = require('node-appwrite');

/**
 * TrovaTask Push Notification Function v5.0 - PRODUCTION READY
 * 
 * Based on official Appwrite Messaging API documentation
 * Reference: https://appwrite.io/docs/references/cloud/server-nodejs/messaging#createPush
 * 
 * @version 5.0 - Production-ready with official SDK implementation
 * @since 2025-10-20
 * @author TrovaTask Engineering Team
 */

module.exports = async ({ req, res, log, error }) => {
  const startTime = Date.now();
  
  log('========================================');
  log(`🚀 TrovaTask Push Notification v5.0`);
  log(`⏰ Invoked: ${new Date().toISOString()}`);
  log('========================================');
  
  try {
    // ===================================
    // 1. Parse Event Data
    // ===================================
    const eventData = JSON.parse(req.bodyRaw || '{}');
    log(`📨 Raw event: ${JSON.stringify(eventData, null, 2)}`);
    
    const recipientId = eventData.recipientId || eventData.data?.recipientId;
    const senderId = eventData.senderId || eventData.data?.senderId;
    const text = eventData.text || eventData.data?.text || 'New message';
    const chatId = eventData.chatId || eventData.data?.chatId;
    const type = eventData.type || eventData.data?.type || 'text';
    
    // Validate recipientId
    if (!recipientId) {
      error('❌ Missing recipientId');
      return res.json({ success: false, error: 'Missing recipientId' }, 400);
    }
    
    log(`📢 Processing notification:`);
    log(`   → Recipient: ${recipientId}`);
    log(`   → Sender: ${senderId || 'Unknown'}`);
    log(`   → Chat: ${chatId || 'N/A'}`);
    log(`   → Type: ${type}`);
    log(`   → Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    // ===================================
    // 2. Initialize Appwrite Client
    // ===================================
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);
    
    const messaging = new sdk.Messaging(client);
    const databases = new sdk.Databases(client);
    
    // ===================================
    // 3. Fetch Sender Name
    // ===================================
    let senderName = 'Someone';
    if (senderId) {
      try {
        log(`🔍 Fetching sender: ${senderId}`);
        const senderDoc = await databases.getDocument('ChatDatabase', 'users', senderId);
        senderName = senderDoc.fullName || senderDoc.username || 'Someone';
        log(`✅ Sender: ${senderName}`);
      } catch (err) {
        log(`⚠️ Could not fetch sender: ${err.message}`);
      }
    }
    
    // ===================================
    // 4. Format Notification
    // ===================================
    const title = `${senderName} sent you a message`;
    const body = type !== 'text' 
      ? `[${type.toUpperCase()} message]`
      : text.length > 100 ? `${text.substring(0, 100)}...` : text;
    
    const data = {
      type: 'chat_message',
      chatId: chatId || '',
      senderId: senderId || '',
      recipientId: recipientId,
      messageType: type,
      timestamp: new Date().toISOString(),
      deepLink: `trovatask://chat/${chatId || ''}`
    };
    
    log(`📤 Sending push notification...`);
    log(`   Title: "${title}"`);
    log(`   Body: "${body}"`);
    
    // ===================================
    // 5. Send Push Notification
    // Official Appwrite Messaging API
    // ===================================
    const message = await messaging.createPush({
      messageId: sdk.ID.unique(),
      title: title,
      body: body,
      topics: [],              // Not using topics
      users: [recipientId],    // Send to specific user
      targets: [],             // Not using specific targets
      data: data,              // Custom data payload
      action: '',              // No specific action
      image: '',               // No image
      icon: '',                // No custom icon
      sound: 'default',        // Default notification sound
      color: '',               // No custom color
      tag: 'chat',             // Tag for grouping
      badge: null,             // No badge count
      draft: false,            // Send immediately
      scheduledAt: '',         // Not scheduled
      contentAvailable: false, // Not background notification
      critical: false,         // Not critical
      priority: sdk.MessagePriority.High // High priority for instant delivery
    });
    
    // ===================================
    // 6. Success Response
    // ===================================
    const duration = Date.now() - startTime;
    log(`✅ Notification sent in ${duration}ms`);
    log(`   Message ID: ${message.$id}`);
    log(`   Status: ${message.status}`);
    log(`   Delivery: ${message.deliveryErrors || 0} errors`);
    log('========================================');
    
    return res.json({
      success: true,
      duration: `${duration}ms`,
      messageId: message.$id,
      recipient: recipientId,
      sender: senderName,
      status: message.status,
      deliveredTotal: message.deliveredTotal || 0
    });
    
  } catch (err) {
    // ===================================
    // Error Handling
    // ===================================
    const duration = Date.now() - startTime;
    error(`❌ Failed after ${duration}ms`);
    error(`   Error: ${err.message}`);
    error(`   Stack: ${err.stack}`);
    log('========================================');
    
    return res.json({
      success: false,
      error: err.message,
      duration: `${duration}ms`,
      code: err.code || 'UNKNOWN_ERROR'
    }, 500);
  }
};
