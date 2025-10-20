const sdk = require('node-appwrite');

/**
 * TrovaTask Push Notification v6.1 - FIXED action parameter
 */
module.exports = async ({ req, res, log, error }) => {
  const startTime = Date.now();
  
  log('========================================');
  log(`🚀 TrovaTask Push v6.1`);
  log(`⏰ ${new Date().toISOString()}`);
  log('========================================');
  
  try {
    // Parse event
    const eventData = JSON.parse(req.bodyRaw || '{}');
    const recipientId = eventData.recipientId || eventData.data?.recipientId;
    const senderId = eventData.senderId || eventData.data?.senderId;
    const text = eventData.text || eventData.data?.text || 'New message';
    const chatId = eventData.chatId || eventData.data?.chatId;
    const type = eventData.type || eventData.data?.type || 'text';
    
    if (!recipientId) {
      error('❌ Missing recipientId');
      return res.json({ success: false, error: 'Missing recipientId' }, 400);
    }
    
    log(`📢 Recipient: ${recipientId}`);
    log(`📢 Sender: ${senderId || 'Unknown'}`);
    log(`📢 Text: "${text.substring(0, 50)}..."`);
    
    // Initialize Appwrite
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);
    
    const messaging = new sdk.Messaging(client);
    const databases = new sdk.Databases(client);
    
    // Get sender name
    let senderName = 'Someone';
    if (senderId) {
      try {
        const senderDoc = await databases.getDocument('ChatDatabase', 'users', senderId);
        senderName = senderDoc.fullName || senderDoc.username || 'Someone';
        log(`✅ Sender: ${senderName}`);
      } catch (err) {
        log(`⚠️ Could not fetch sender: ${err.message}`);
      }
    }
    
    // Format notification
    const title = `${senderName} sent you a message`;
    const body = type !== 'text' 
      ? `[${type.toUpperCase()}]`
      : text.length > 100 ? `${text.substring(0, 100)}...` : text;
    
    log(`📤 Sending: "${title}" - "${body}"`);
    
    // ✅ FIXED: Use undefined instead of empty strings for optional params
    const message = await messaging.createPush(
      sdk.ID.unique(),           // messageId
      title,                     // title
      body,                      // body
      undefined,                 // topics
      [recipientId],             // users
      undefined,                 // targets
      {                          // data
        type: 'chat_message',
        chatId: chatId || '',
        senderId: senderId || '',
        recipientId: recipientId,
        timestamp: new Date().toISOString(),
        deepLink: `trovatask://chat/${chatId || ''}`
      },
      undefined,                 // action (use undefined, not '')
      undefined,                 // image
      undefined,                 // icon
      undefined,                 // sound
      undefined,                 // color
      undefined,                 // tag
      undefined,                 // badge
      false                      // draft
    );
    
    const duration = Date.now() - startTime;
    log(`✅ Sent in ${duration}ms`);
    log(`   ID: ${message.$id}`);
    log(`   Status: ${message.status}`);
    log('========================================');
    
    return res.json({
      success: true,
      duration: `${duration}ms`,
      messageId: message.$id,
      recipient: recipientId,
      sender: senderName,
      status: message.status
    });
    
  } catch (err) {
    const duration = Date.now() - startTime;
    error(`❌ Failed after ${duration}ms`);
    error(`   ${err.message}`);
    error(`   ${err.stack}`);
    log('========================================');
    
    return res.json({
      success: false,
      error: err.message,
      duration: `${duration}ms`
    }, 500);
  }
};
