const sdk = require('node-appwrite');

module.exports = async ({ req, res, log, error }) => {
  const startTime = Date.now();
  
  log('========================================');
  log(`🚀 TrovaTaskSendPushNotification invoked at ${new Date().toISOString()}`);
  log('========================================');
  
  try {
    const { chatId, senderId, recipientId, text, type } = req.payload || {};
    
    // Validate payload
    if (!chatId || !senderId || !recipientId || !text || !type) {
      const msg = 'Missing required fields: chatId, senderId, recipientId, text, type';
      error(`❌ Validation failed: ${msg}`);
      error(`Received: ${JSON.stringify(req.payload)}`);
      return res.json({ success: false, error: msg }, 400);
    }
    
    log(`📢 Processing notification:`);
    log(`   → Recipient: ${recipientId}`);
    log(`   → Sender: ${senderId}`);
    log(`   → Chat ID: ${chatId}`);
    log(`   → Type: ${type}`);
    log(`   → Snippet: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    // Initialize Appwrite
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);
    
    const messaging = new sdk.Messaging(client);
    
    // Format notification
    const title = `New message from user ${senderId}`;
    const body = type !== 'text' 
      ? `[${type.toUpperCase()} message]`
      : text.length > 100 ? `${text.slice(0, 100)}...` : text;
    
    // Send notification using createPush
    log(`📤 Sending push notification...`);
    const message = await messaging.createPush(
      sdk.ID.unique(),           // messageId
      title,                     // title
      body,                      // body
      [],                        // topics (empty for direct user messaging)
      [recipientId],             // users (array with recipient ID)
      [],                        // targets (empty - Appwrite auto-finds user's devices)
      {                          // data (custom payload for deep linking)
        deepLink: `trovatask://chat/${chatId}`,
        chatId,
        senderId,
        type
      }
    );
    
    const duration = Date.now() - startTime;
    log(`✅ Notification sent successfully in ${duration}ms`);
    log(`   Message ID: ${message.$id}`);
    log('========================================');
    
    return res.json({ 
      success: true, 
      duration: `${duration}ms`,
      messageId: message.$id
    });
    
  } catch (err) {
    const duration = Date.now() - startTime;
    error(`❌ Notification failed after ${duration}ms: ${err.message}`);
    error(`Stack: ${err.stack}`);
    log('========================================');
    
    return res.json({ success: false, error: err.message }, 500);
  }
};