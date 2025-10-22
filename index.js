const sdk = require('node-appwrite');
const admin = require('firebase-admin');

/**
 * ========================================
 * TROVATASK PUSH NOTIFICATION v14.1 FINAL
 * ========================================
 * 
 * FEATURES:
 * ✅ Multi-device support (sends to ALL user devices OR specific device)
 * ✅ Reads devices map from Firebase Firestore via Firebase Admin SDK
 * ✅ Per-device error handling (one device failure doesn't stop others)
 * ✅ Human-readable device names in logs
 * ✅ Fixed userId parameter bug (was causing "Missing required parameter" error)
 * ✅ Optional deviceId parameter for targeted notifications
 * ✅ Comprehensive logging and error handling
 * ✅ All message types supported (text, image, video, audio, file, location)
 * 
 * Architecture:
 * - Firebase Firestore: Device mapping (devices.{deviceId}.appwriteUserId)
 * - Firebase Admin SDK: Read Firestore (bypasses security rules)
 * - Appwrite Messaging: Push notification delivery via FCM
 * - Multi-device: Each device gets its own notification
 * 
 * JSON Format:
 * {
 *   "recipientId": "firebase_uid",        // Required
 *   "senderId": "firebase_uid",           // Optional
 *   "chatId": "chat_id",                  // Required
 *   "text": "message text",               // Required
 *   "type": "text",                       // Optional (text, image, video, etc)
 *   "messageId": "msg_id",                // Optional
 *   "deviceId": "device_id"               // Optional (for specific device)
 * }
 * 
 * Author: TrovaTask Engineering Team
 * Version: 14.1.0 FINAL
 * Date: October 22, 2025
 * Aligned with: AppwriteManager v11.1
 * ========================================
 */

// Configuration constants
const CONFIG = {
  MAX_TEXT_LENGTH: 100,
  TRUNCATE_SUFFIX: '...',
  MIN_DEVICES_FOR_WARNING: 5,
  TIMEOUT_PER_DEVICE: 5000
};

module.exports = async ({ req, res, log, error }) => {
  const startTime = Date.now();
  
  // ========================================
  // INITIALIZATION
  // ========================================
  
  log('========================================');
  log('🚀 TrovaTask Push Notification v14.1 FINAL');
  log(`⏰ Timestamp: ${new Date().toISOString()}`);
  log(`📍 Environment: ${process.env.APPWRITE_FUNCTION_RUNTIME_NAME || 'Node.js'}`);
  log('========================================');
  
  try {
    // Parse event data
    const eventData = JSON.parse(req.bodyRaw || '{}');
    
    const recipientFirebaseUid = eventData.recipientId;
    const senderFirebaseUid = eventData.senderId;
    const text = eventData.text || 'New message';
    const chatId = eventData.chatId;
    const type = eventData.type || 'text';
    const messageId = eventData.messageId || eventData.$id;
    const targetDeviceId = eventData.deviceId;  // NEW: Optional device targeting
    
    log('\n📋 Message Details:');
    log(`   Recipient (Firebase UID): ${recipientFirebaseUid || 'MISSING ❌'}`);
    log(`   Sender (Firebase UID): ${senderFirebaseUid || 'MISSING ⚠️'}`);
    log(`   Chat ID: ${chatId || 'MISSING ❌'}`);
    log(`   Message ID: ${messageId || 'N/A'}`);
    log(`   Type: ${type}`);
    log(`   Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    log(`   Target Device: ${targetDeviceId || 'ALL DEVICES (Broadcast)'}`);
    
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
    const users = new sdk.Users(client);
    
    log('   ✓ Messaging API initialized');
    log('   ✓ Users API initialized');
    
    // ========================================
    // FIREBASE ADMIN INITIALIZATION
    // ========================================
    
    log('\n🔥 Initializing Firebase Admin...');
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
      });
      log('   ✓ Firebase Admin initialized (new instance)');
    } else {
      log('   ✓ Firebase Admin already initialized (reusing instance)');
    }
    
    const db = admin.firestore();
    log('   ✓ Firebase Firestore client ready');
    
    // ========================================
    // STEP 1: FETCH RECIPIENT'S DEVICES FROM FIREBASE FIRESTORE
    // ========================================
    
    log('\n🔍 Step 1: Fetching recipient devices from Firebase Firestore...');
    
    const userDocRef = db.collection('users').doc(recipientFirebaseUid);
    const userDoc = await userDocRef.get();
    
    if (!userDoc.exists) {
      error('❌ Recipient not found in Firebase Firestore');
      return res.json({ 
        success: false, 
        error: 'Recipient user not found',
        firebaseUid: recipientFirebaseUid,
        timestamp: new Date().toISOString()
      }, 404);
    }
    
    const userData = userDoc.data();
    let devicesMap = userData.devices || {};
    
    // NEW: Filter by target device if specified
    if (targetDeviceId) {
      if (devicesMap[targetDeviceId]) {
        log(`   🎯 Targeting specific device: ${targetDeviceId}`);
        devicesMap = {
          [targetDeviceId]: devicesMap[targetDeviceId]
        };
      } else {
        error(`❌ Target device ${targetDeviceId} not found for user`);
        return res.json({ 
          success: false, 
          error: 'Target device not found',
          deviceId: targetDeviceId,
          timestamp: new Date().toISOString()
        }, 404);
      }
    }
    
    const deviceCount = Object.keys(devicesMap).length;
    
    if (deviceCount === 0) {
      log('   ⚠️ WARNING: User has NO registered devices');
      
      // Fallback to old method
      if (userData.lastAppwriteUserId) {
        log('   🔄 Fallback: Using lastAppwriteUserId');
        devicesMap = {
          'fallback_device': {
            appwriteUserId: userData.lastAppwriteUserId,
            deviceName: 'Unknown Device (Legacy)',
            deviceId: 'fallback'
          }
        };
      } else {
        error('❌ No devices found and no fallback appwriteUserId');
        return res.json({ 
          success: false, 
          error: 'No devices found',
          firebaseUid: recipientFirebaseUid,
          timestamp: new Date().toISOString()
        }, 404);
      }
    } else {
      log(`   ✅ Found ${deviceCount} registered device(s) in Firebase Firestore`);
      
      if (deviceCount >= CONFIG.MIN_DEVICES_FOR_WARNING) {
        log(`   ⚠️ WARNING: User has ${deviceCount} devices (above threshold)`);
      }
      
      Object.entries(devicesMap).forEach(([deviceId, deviceData], index) => {
        log(`   Device ${index + 1}: ${deviceData.deviceName || 'Unknown'} (ID: ${deviceId.substring(0, 12)}...)`);
      });
    }
    
    // ========================================
    // STEP 2: FETCH SENDER INFORMATION
    // ========================================
    
    log('\n👤 Step 2: Fetching sender information from Firebase Firestore...');
    
    let senderName = 'Someone';
    let senderEmail = null;
    
    if (senderFirebaseUid) {
      try {
        const senderDocRef = db.collection('users').doc(senderFirebaseUid);
        const senderDoc = await senderDocRef.get();
        
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          
          senderName = senderData.fullName?.trim() || 
                       senderData.username?.trim() || 
                       (senderData.email ? senderData.email.split('@')[0] : null) ||
                       'Someone';
          
          senderEmail = senderData.email;
          
          log(`   ✅ Sender found: ${senderName}`);
          if (senderEmail) log(`      Email: ${senderEmail}`);
        } else {
          log(`   ⚠️ Sender document not found, using default name`);
        }
      } catch (err) {
        log(`   ⚠️ Could not fetch sender: ${err.message}`);
        log(`      Using default sender name`);
      }
    } else {
      log(`   ⚠️ No sender Firebase UID provided, using default name`);
    }
    
    // ========================================
    // STEP 3: FORMAT NOTIFICATION
    // ========================================
    
    log('\n💬 Step 3: Formatting notification...');
    
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
    // STEP 4: SEND TO ALL DEVICES
    // ========================================
    
    log('\n📤 Step 4: Sending push notifications to devices...');
    log('========================================');
    
    const results = {
      total: Object.keys(devicesMap).length,
      success: 0,
      failed: 0,
      deviceResults: []
    };
    
    for (const [deviceId, deviceData] of Object.entries(devicesMap)) {
      const deviceStartTime = Date.now();
      const deviceName = deviceData.deviceName || 'Unknown Device';
      const appwriteUserId = deviceData.appwriteUserId;
      
      log(`\n📱 Processing Device: ${deviceName}`);
      log(`   Device ID: ${deviceId}`);
      log(`   Appwrite User ID: ${appwriteUserId}`);
      
      try {
        // Verify push targets
        log(`   🔍 Verifying push targets...`);
        
        const userTargets = await users.listTargets(appwriteUserId);
        
        if (userTargets.total === 0) {
          log(`   ⚠️ No push targets found for this device`);
          log(`   Skipping device...`);
          
          results.failed++;
          results.deviceResults.push({
            deviceId,
            deviceName,
            appwriteUserId,
            success: false,
            error: 'No push targets',
            duration: Date.now() - deviceStartTime
          });
          
          continue;
        }
        
        log(`   ✓ Found ${userTargets.total} push target(s)`);
        
        // Prepare notification data
        const notificationData = {
          type: 'chat_message',
          chatId: String(chatId || ''),
          messageId: String(messageId || ''),
          senderId: String(senderFirebaseUid || ''),
          senderName: String(senderName),
          recipientId: String(recipientFirebaseUid || ''),
          messageType: String(type),
          timestamp: new Date().toISOString(),
          deepLink: `trovatask://chat/${chatId}`,
          badge: '1',
          deviceId: String(deviceId),
          deviceName: String(deviceName),
          appwriteUserId: String(appwriteUserId),
          notificationVersion: '14.1.0'
        };
        
        // Send push notification
        log(`   📤 Sending push notification...`);
        
        const message = await messaging.createPush(
          sdk.ID.unique(),
          title,
          body,
          undefined,                  // topics
          [appwriteUserId],          // users ✅ FIXED: Now populated!
          undefined,                  // targets
          notificationData,           // data
          undefined,                  // action
          undefined,                  // icon
          undefined,                  // sound
          undefined,                  // color
          undefined,                  // tag
          undefined,                  // badge
          undefined,                  // draft
          false                       // scheduledAt
        );
        
        const deviceDuration = Date.now() - deviceStartTime;
        
        log(`   ✅ SUCCESS! Push sent to ${deviceName}`);
        log(`   Message ID: ${message.$id}`);
        log(`   Duration: ${deviceDuration}ms`);
        
        results.success++;
        results.deviceResults.push({
          deviceId,
          deviceName,
          appwriteUserId,
          success: true,
          messageId: message.$id,
          targetsCount: userTargets.total,
          duration: deviceDuration
        });
        
      } catch (deviceErr) {
        const deviceDuration = Date.now() - deviceStartTime;
        
        error(`   ❌ FAILED to send to ${deviceName}`);
        error(`   Error: ${deviceErr.message}`);
        error(`   Duration: ${deviceDuration}ms`);
        
        results.failed++;
        results.deviceResults.push({
          deviceId,
          deviceName,
          appwriteUserId,
          success: false,
          error: deviceErr.message,
          errorCode: deviceErr.code,
          duration: deviceDuration
        });
      }
    }
    
    // ========================================
    // FINAL SUMMARY
    // ========================================
    
    const totalDuration = Date.now() - startTime;
    
    log('\n========================================');
    log(`✅ MULTI-DEVICE NOTIFICATION COMPLETE`);
    log('========================================');
    log(`⏱️ Total Duration: ${totalDuration}ms`);
    log(`📊 Results:`);
    log(`   Total Devices: ${results.total}`);
    log(`   Successful: ${results.success}`);
    log(`   Failed: ${results.failed}`);
    log(`   Success Rate: ${((results.success / results.total) * 100).toFixed(1)}%`);
    log(`👤 Sender: ${senderName}`);
    log(`📱 Recipient Firebase UID: ${recipientFirebaseUid}`);
    log(`📝 Message Type: ${type}`);
    if (targetDeviceId) {
      log(`🎯 Targeted Device: ${targetDeviceId}`);
    }
    log('========================================\n');
    
    const overallSuccess = results.success > 0;
    
    return res.json({
      success: overallSuccess,
      duration: `${totalDuration}ms`,
      recipientFirebaseUid: recipientFirebaseUid,
      senderName: senderName,
      messageType: type,
      targetDevice: targetDeviceId || null,
      devices: {
        total: results.total,
        success: results.success,
        failed: results.failed,
        successRate: `${((results.success / results.total) * 100).toFixed(1)}%`
      },
      deviceResults: results.deviceResults,
      timestamp: new Date().toISOString(),
      version: '14.1.0'
    });
    
  } catch (err) {
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
      version: '14.1.0'
    }, statusCode);
  }
};
