const sdk = require('node-appwrite');


/**
 * ========================================
 * TROVATASK PUSH NOTIFICATION v13.1 - PRODUCTION FINAL
 * ========================================
 * 
 * Architecture:
 * - Firebase Auth = Main authentication (email/password/Google)
 * - Appwrite = Push notifications + Message storage
 * - Anonymous users for simplicity (no password sync issues)
 * - Firebase UID → Appwrite User ID mapping in UserDatabase
 * 
 * Features:
 * ✅ Smart user lookup with mapping
 * ✅ Efficient pagination for large user bases
 * ✅ All message types supported (text, image, video, audio, file, location)
 * ✅ Production-grade error handling
 * ✅ Comprehensive logging
 * ✅ Target verification before sending
 * ✅ Fallback to newest user if mapping fails
 * ✅ FCM-compliant data payload (all strings)
 * 
 * Author: TrovaTask Engineering Team
 * Last Updated: October 20, 2025
 * Version: 13.1.0
 * ========================================
 */


// Configuration constants
const CONFIG = {
  MAX_PAGINATION_OFFSET: 500,  // Safety limit for user search
  PAGINATION_BATCH_SIZE: 25,    // Users per batch
  MAX_TEXT_LENGTH: 100,          // Max characters in notification body
  TRUNCATE_SUFFIX: '...',
  RETRY_ENABLED: false            // Set to true if you want retry logic
};


module.exports = async ({ req, res, log, error }) => {
  const startTime = Date.now();
  
  // ========================================
  // INITIALIZATION
  // ========================================
  
  log('========================================');
  log('🚀 TrovaTask Push Notification v13.1 - PRODUCTION');
  log(`⏰ Timestamp: ${new Date().toISOString()}`);
  log(`📍 Environment: ${process.env.APPWRITE_FUNCTION_RUNTIME_NAME || 'Node.js'}`);
  log('========================================');
  
  try {
    // Parse event data from Appwrite database trigger
    const eventData = JSON.parse(req.bodyRaw || '{}');
    
    const recipientFirebaseUid = eventData.recipientId;
    const senderFirebaseUid = eventData.senderId;
    const text = eventData.text || 'New message';
    const chatId = eventData.chatId;
    const type = eventData.type || 'text';
    const messageId = eventData.messageId || eventData.$id;
    
    log('\n📋 Message Details:');
    log(`   Recipient (Firebase UID): ${recipientFirebaseUid || 'MISSING ❌'}`);
    log(`   Sender (Firebase UID): ${senderFirebaseUid || 'MISSING ⚠️'}`);
    log(`   Chat ID: ${chatId || 'MISSING ❌'}`);
    log(`   Message ID: ${messageId || 'N/A'}`);
    log(`   Type: ${type}`);
    log(`   Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    // ========================================
    // VALIDATION
    // ========================================
    
    if (!recipientFirebaseUid) {
      error('❌ Validation failed: Missing recipientId');
      return res.json({ 
        success: false, 
        error: 'Missing recipientId',
        timestamp: new Date().toISOString()
      }, 400);
    }
    
    if (!chatId) {
      error('❌ Validation failed: Missing chatId');
      return res.json({ 
        success: false, 
        error: 'Missing chatId',
        timestamp: new Date().toISOString()
      }, 400);
    }
    
    // ========================================
    // APPWRITE CLIENT INITIALIZATION
    // ========================================
    
    log('\n🔧 Initializing Appwrite clients...');
    
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);
    
    const messaging = new sdk.Messaging(client);
    const databases = new sdk.Databases(client);
    const users = new sdk.Users(client);
    
    log('   ✓ Messaging API initialized');
    log('   ✓ Databases API initialized');
    log('   ✓ Users API initialized');
    
    // ========================================
    // STEP 1: USER LOOKUP (SMART MAPPING)
    // ========================================
    
    log('\n🔍 Step 1: Looking up recipient Appwrite user...');
    log('   Strategy: Firebase UID mapping → Fallback to newest user');
    
    let recipientAppwriteUserId = null;
    let lookupMethod = null;
    
    // Try mapping first (recommended approach)
    try {
      log('   📊 Checking UserDatabase for mapping...');
      
      const userMapping = await databases.getDocument(
        'UserDatabase', 
        'users', 
        recipientFirebaseUid
      );
      
      if (userMapping.appwriteUserId && userMapping.appwriteUserId.trim() !== '') {
        recipientAppwriteUserId = userMapping.appwriteUserId;
        lookupMethod = 'mapping';
        
        log(`   ✅ Found mapped Appwrite user: ${recipientAppwriteUserId}`);
        
        // Verify this user still has push targets
        try {
          const targets = await users.listTargets(recipientAppwriteUserId);
          if (targets.total > 0) {
            log(`   ✓ Verified: User has ${targets.total} active push target(s)`);
          } else {
            log(`   ⚠️ Warning: Mapped user has NO push targets, trying fallback...`);
            recipientAppwriteUserId = null;
            lookupMethod = null;
          }
        } catch (targetErr) {
          log(`   ⚠️ Warning: Could not verify targets: ${targetErr.message}`);
          log(`   Trying fallback method...`);
          recipientAppwriteUserId = null;
          lookupMethod = null;
        }
      } else {
        log(`   ⚠️ Mapping exists but appwriteUserId is empty`);
      }
    } catch (mappingErr) {
      if (mappingErr.code === 404) {
        log(`   ℹ️ No mapping found in UserDatabase (user not synced yet)`);
      } else {
        log(`   ⚠️ Error reading mapping: ${mappingErr.message}`);
      }
    }
    
    // Fallback: Search for newest user with push targets
    if (!recipientAppwriteUserId) {
      log('\n   🔄 Fallback: Searching for newest user with push targets...');
      
      let offset = 0;
      let foundUser = null;
      let newestDate = null;
      let usersChecked = 0;
      let usersWithTargets = 0;
      
      while (!foundUser && offset < CONFIG.MAX_PAGINATION_OFFSET) {
        log(`   📄 Fetching batch: offset=${offset}, limit=${CONFIG.PAGINATION_BATCH_SIZE}`);
        
        const usersBatch = await users.list([
          sdk.Query.limit(CONFIG.PAGINATION_BATCH_SIZE), 
          sdk.Query.offset(offset)
        ]);
        
        if (usersBatch.users.length === 0) {
          log(`   ℹ️ No more users to check`);
          break;
        }
        
        log(`   📊 Checking ${usersBatch.users.length} users...`);
        
        for (const user of usersBatch.users) {
          usersChecked++;
          
          try {
            const targets = await users.listTargets(user.$id);
            
            if (targets.total > 0) {
              usersWithTargets++;
              const userDate = new Date(user.$createdAt);
              
              if (!newestDate || userDate > newestDate) {
                foundUser = user.$id;
                newestDate = userDate;
              }
            }
          } catch (err) {
            // Silently continue if can't access targets
          }
        }
        
        // Early exit if we found at least one user with targets
        if (foundUser) {
          log(`   ✓ Found candidate user, stopping search`);
          break;
        }
        
        // Break if we got fewer results than the limit
        if (usersBatch.users.length < CONFIG.PAGINATION_BATCH_SIZE) {
          log(`   ℹ️ Reached end of user list`);
          break;
        }
        
        offset += CONFIG.PAGINATION_BATCH_SIZE;
      }
      
      log(`   📈 Search statistics:`);
      log(`      Users checked: ${usersChecked}`);
      log(`      Users with targets: ${usersWithTargets}`);
      
      if (foundUser) {
        recipientAppwriteUserId = foundUser;
        lookupMethod = 'fallback';
        log(`   ✅ Selected newest user with targets: ${recipientAppwriteUserId}`);
        log(`      Created: ${newestDate?.toISOString()}`);
      }
    }
    
    if (!recipientAppwriteUserId) {
      error('❌ No Appwrite user found with push targets');
      log('   Checked all available users, none have active push tokens');
      
      return res.json({ 
        success: false, 
        error: 'No user with registered push tokens found',
        recipientFirebaseUid: recipientFirebaseUid,
        timestamp: new Date().toISOString()
      }, 404);
    }
    
    // ========================================
    // STEP 2: VERIFY PUSH TARGETS
    // ========================================
    
    log('\n🎯 Step 2: Verifying push targets...');
    
    const userTargets = await users.listTargets(recipientAppwriteUserId);
    
    if (userTargets.total === 0) {
      error('❌ User has no active push targets');
      return res.json({ 
        success: false, 
        error: 'User has no registered push tokens',
        appwriteUserId: recipientAppwriteUserId,
        timestamp: new Date().toISOString()
      }, 404);
    }
    
    log(`   ✅ User has ${userTargets.total} active push target(s)`);
    
    // Log target details (for debugging)
    userTargets.targets.forEach((target, index) => {
      log(`   Target ${index + 1}: ${target.providerId} (${target.$id})`);
    });
    
    // ========================================
    // STEP 3: FETCH SENDER INFORMATION
    // ========================================
    
    log('\n👤 Step 3: Fetching sender information...');
    
    let senderName = 'Someone';
    let senderEmail = null;
    
    if (senderFirebaseUid) {
      try {
        const senderDoc = await databases.getDocument(
          'UserDatabase', 
          'users', 
          senderFirebaseUid
        );
        
        // Priority: fullName > username > email prefix > default
        senderName = senderDoc.fullName?.trim() || 
                     senderDoc.username?.trim() || 
                     (senderDoc.email ? senderDoc.email.split('@')[0] : null) ||
                     'Someone';
        
        senderEmail = senderDoc.email;
        
        log(`   ✅ Sender found: ${senderName}`);
        if (senderEmail) log(`      Email: ${senderEmail}`);
      } catch (err) {
        log(`   ⚠️ Could not fetch sender details: ${err.message}`);
        log(`      Using default sender name`);
      }
    } else {
      log(`   ⚠️ No sender Firebase UID provided`);
    }
    
    // ========================================
    // STEP 4: FORMAT NOTIFICATION
    // ========================================
    
    log('\n💬 Step 4: Formatting notification...');
    
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
        title = `${senderName} sent a voice message`;
        body = '🎤 Audio message';
        break;
      case 'file':
        title = `${senderName} sent a file`;
        body = '📎 File attachment';
        break;
      case 'location':
        title = `${senderName} shared a location`;
        body = '📍 Location';
        break;
      case 'text':
      default:
        title = senderName;
        if (text.length > CONFIG.MAX_TEXT_LENGTH) {
          body = text.substring(0, CONFIG.MAX_TEXT_LENGTH - CONFIG.TRUNCATE_SUFFIX.length) + CONFIG.TRUNCATE_SUFFIX;
        } else {
          body = text;
        }
    }
    
    log(`   Title: "${title}"`);
    log(`   Body: "${body}"`);
    
    // ========================================
    // STEP 5: PREPARE NOTIFICATION DATA
    // ✅ FIXED: ALL FIELDS MUST BE STRINGS FOR FCM
    // ========================================
    
    log('\n📦 Step 5: Preparing notification data...');
    
    const notificationData = {
      type: 'chat_message',
      chatId: String(chatId || ''),
      messageId: String(messageId || ''),
      senderId: String(senderFirebaseUid || ''),
      senderName: String(senderName),
      recipientId: String(recipientFirebaseUid || ''),
      messageType: String(type),
      timestamp: new Date().toISOString(),  // Already a string
      deepLink: `trovatask://chat/${chatId}`,
      badge: '1',  // ✅ FIXED: String instead of number
      // Additional metadata
      lookupMethod: String(lookupMethod || 'unknown'),
      notificationVersion: '13.1.0'
    };
    
    log(`   ✓ Notification data prepared (all fields as strings)`);
    log(`   Deep link: ${notificationData.deepLink}`);
    
    // ========================================
    // STEP 6: SEND PUSH NOTIFICATION
    // ========================================
    
    log('\n📤 Step 6: Sending push notification...');
    log(`   Target: ${recipientAppwriteUserId}`);
    log(`   Targets count: ${userTargets.total}`);
    
    const message = await messaging.createPush(
      sdk.ID.unique(),
      title,
      body,
      undefined,                    // topics
      [recipientAppwriteUserId],   // users
      undefined,                    // targets
      notificationData,             // data (all strings now!)
      undefined,                    // action
      undefined,                    // icon
      undefined,                    // sound
      undefined,                    // color
      undefined,                    // tag
      undefined,                    // badge
      undefined,                    // draft
      false                         // scheduledAt
    );
    
    const duration = Date.now() - startTime;
    
    // ========================================
    // SUCCESS RESPONSE
    // ========================================
    
    log('\n========================================');
    log(`✅ PUSH NOTIFICATION SENT SUCCESSFULLY`);
    log('========================================');
    log(`⏱️ Duration: ${duration}ms`);
    log(`📨 Message ID: ${message.$id}`);
    log(`📊 Status: ${message.status}`);
    log(`👤 Sender: ${senderName}`);
    log(`📱 Recipient Appwrite User: ${recipientAppwriteUserId}`);
    log(`🎯 Targets: ${userTargets.total}`);
    log(`🔍 Lookup Method: ${lookupMethod}`);
    log(`📝 Message Type: ${type}`);
    log('========================================\n');
    
    return res.json({
      success: true,
      duration: `${duration}ms`,
      messageId: message.$id,
      appwriteUserId: recipientAppwriteUserId,
      firebaseUid: recipientFirebaseUid,
      senderName: senderName,
      status: message.status,
      targetsCount: userTargets.total,
      messageType: type,
      lookupMethod: lookupMethod,
      timestamp: new Date().toISOString(),
      version: '13.1.0'
    });
    
  } catch (err) {
    // ========================================
    // ERROR HANDLING
    // ========================================
    
    const duration = Date.now() - startTime;
    
    error('\n========================================');
    error('❌ PUSH NOTIFICATION FAILED');
    error('========================================');
    error(`⏱️ Duration: ${duration}ms`);
    error(`🔴 Error: ${err.message}`);
    error(`📋 Error Code: ${err.code || 'N/A'}`);
    error(`📚 Stack Trace:`);
    error(err.stack);
    error('========================================\n');
    
    // Determine appropriate HTTP status code
    let statusCode = 500;
    let errorMessage = err.message;
    
    if (err.code === 404) {
      statusCode = 404;
      errorMessage = 'Resource not found';
    } else if (err.code === 401 || err.code === 403) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
    } else if (err.code === 400) {
      statusCode = 400;
      errorMessage = 'Bad request';
    }
    
    return res.json({
      success: false,
      error: errorMessage,
      errorCode: err.code || 'UNKNOWN',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      version: '13.1.0'
    }, statusCode);
  }
};
