const sdk = require('node-appwrite');

/**
 * TrovaTask Push Notification Function v4.0
 * 
 * Automatically sends push notifications when new messages are created
 * Uses Appwrite Messaging API with FCM provider
 * 
 * Trigger: databases.*.collections.messages.documents.*.create
 * 
 * @version 4.0 - Production-ready with enhanced error handling
 * @since 2025-10-20
 */
module.exports = async ({ req, res, log, error }) => {
  const startTime = Date.now();
  
  log('========================================');
  log(`🚀 TrovaTask Push Notification v4.0`);
  log(`⏰ Invoked: ${new Date().toISOString()}`);
  log('========================================');
  
  try {
    // ===================================
    // 1. Parse and Validate Event Data
    // ===================================
    const eventData = parseEventData(req.bodyRaw, log, error);
    if (!eventData) {
      return res.json({ success: false, error: 'Invalid event data' }, 400);
    }

    const { recipientId, senderId, text, chatId, type } = eventData;

    // Validate required fields
    if (!recipientId) {
      error('❌ Missing recipientId in event data');
      return res.json({ success: false, error: 'Missing recipientId' }, 400);
    }

    logNotificationDetails(recipientId, senderId, chatId, type, text, log);

    // ===================================
    // 2. Initialize Appwrite Client
    // ===================================
    const client = initializeAppwriteClient();
    const messaging = new sdk.Messaging(client);
    const databases = new sdk.Databases(client);

    // ===================================
    // 3. Fetch Sender Information
    // ===================================
    const senderName = await fetchSenderName(databases, senderId, log);

    // ===================================
    // 4. Format Notification Content
    // ===================================
    const { title, body, data } = formatNotification(
      senderName,
      text,
      type,
      chatId,
      senderId,
      recipientId
    );

    log(`📤 Sending notification...`);
    log(`   Title: "${title}"`);
    log(`   Body: "${body}"`);

    // ===================================
    // 5. Send Push Notification
    // ===================================
    const message = await sendPushNotification(
      messaging,
      title,
      body,
      recipientId,
      data,
      log,
      error
    );

    // ===================================
    // 6. Return Success Response
    // ===================================
    const duration = Date.now() - startTime;
    log(`✅ Notification sent successfully in ${duration}ms`);
    log(`   Message ID: ${message.$id}`);
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
    // ===================================
    // Error Handling
    // ===================================
    const duration = Date.now() - startTime;
    error(`❌ Notification failed after ${duration}ms`);
    error(`   Error: ${err.message}`);
    error(`   Stack: ${err.stack}`);
    log('========================================');

    return res.json({
      success: false,
      error: err.message,
      duration: `${duration}ms`
    }, 500);
  }
};

// ===================================
// Helper Functions
// ===================================

/**
 * Parse and validate event data from Appwrite
 */
function parseEventData(bodyRaw, log, error) {
  try {
    const eventData = JSON.parse(bodyRaw || '{}');
    log(`📨 Event data received: ${JSON.stringify(eventData, null, 2)}`);

    return {
      recipientId: eventData.recipientId || eventData.data?.recipientId,
      senderId: eventData.senderId || eventData.data?.senderId,
      text: eventData.text || eventData.data?.text || 'New message',
      chatId: eventData.chatId || eventData.data?.chatId,
      type: eventData.type || eventData.data?.type || 'text'
    };
  } catch (err) {
    error(`❌ Failed to parse event data: ${err.message}`);
    return null;
  }
}

/**
 * Log notification details for debugging
 */
function logNotificationDetails(recipientId, senderId, chatId, type, text, log) {
  log(`📢 Notification details:`);
  log(`   → Recipient: ${recipientId}`);
  log(`   → Sender: ${senderId || 'Unknown'}`);
  log(`   → Chat ID: ${chatId || 'N/A'}`);
  log(`   → Type: ${type}`);
  log(`   → Message: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
}

/**
 * Initialize Appwrite client with environment variables
 */
function initializeAppwriteClient() {
  return new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
}

/**
 * Fetch sender's name from users collection
 */
async function fetchSenderName(databases, senderId, log) {
  if (!senderId) {
    log(`⚠️ No sender ID provided, using default name`);
    return 'Someone';
  }

  try {
    log(`🔍 Fetching sender info for: ${senderId}`);
    const senderDoc = await databases.getDocument(
      'ChatDatabase',
      'users',
      senderId
    );
    const name = senderDoc.fullName || senderDoc.username || 'Someone';
    log(`✅ Sender name: ${name}`);
    return name;
  } catch (err) {
    log(`⚠️ Could not fetch sender name: ${err.message}`);
    return 'Someone';
  }
}

/**
 * Format notification title, body, and data payload
 */
function formatNotification(senderName, text, type, chatId, senderId, recipientId) {
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

  return { title, body, data };
}

/**
 * Send push notification using Appwrite Messaging API
 */
async function sendPushNotification(messaging, title, body, recipientId, data, log, error) {
  try {
    const message = await messaging.createPush(
      sdk.ID.unique(),     // messageId - unique ID for this notification
      title,               // title
      body,                // body
      undefined,           // topics (not used)
      [recipientId],       // users - array of user IDs to send to
      undefined,           // targets (not used, handled by user ID)
      data,                // data - custom data payload
      undefined,           // action
      undefined,           // icon
      undefined,           // sound
      undefined,           // color
      undefined,           // tag
      undefined,           // badge
      false                // draft - set to false to send immediately
    );

    return message;
  } catch (err) {
    error(`❌ Failed to send push notification: ${err.message}`);
    throw err;
  }
}
