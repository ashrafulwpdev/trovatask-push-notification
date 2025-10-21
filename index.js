const sdk = require('node-appwrite');

/**
 * ========================================
 * TROVATASK PUSH NOTIFICATION v14.0 - MULTI-DEVICE PRODUCTION
 * ========================================
 * 
 * Architecture:
 * - Firebase Auth = Main authentication (email/password/Google)
 * - Appwrite = Push notifications + Message storage
 * - Anonymous users per device (one per device for security)
 * - Firebase UID → Appwrite User IDs mapping (MULTIPLE devices)
 * - Device-specific mapping in Firebase Firestore
 * 
 * Features:
 * ✅ Multi-device support (sends to ALL user devices)
 * ✅ Device-specific mapping lookup
 * ✅ Human-readable device names in logs
 * ✅ All message types supported (text, image, video, audio, file, location)
 * ✅ Production-grade error handling
 * ✅ Comprehensive logging per device
 * ✅ Target verification before sending
 * ✅ Fallback strategies for each device
 * ✅ FCM-compliant data payload (all strings)
 * 
 * NEW in v14.0:
 * ✅ Reads devices map from Firebase Firestore
 * ✅ Sends notification to ALL registered devices
 * ✅ Per-device error handling (one device failure doesn't stop others)
 * ✅ Device name and ID tracking in logs
 * 
 * Author: TrovaTask Engineering Team
 * Last Updated: October 22, 2025
 * Version: 14.0.0
 * Aligned with: AppwriteManager v11.0
 * ========================================
 */

// Configuration constants
const CONFIG = {
  MAX_TEXT_LENGTH: 100,
  TRUNCATE_SUFFIX: '...',
  MIN_DEVICES_FOR_WARNING: 5,  // Log warning if user has this many devices
  TIMEOUT_PER_DEVICE: 5000     // 5 seconds timeout per device
};

module.exports = async ({ req, res, log, error }) => {
  const startTime = Date.now();
  
  // ========================================
  // INITIALIZATION
  // ========================================
  
  log('========================================');
  log('🚀 TrovaTask Push Notification v14.0 - MULTI-DEVICE');
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
    // STEP 1: FETCH RECIPIENT'S DEVICES MAP
    // ========================================
    
    log('\n🔍 Step 1: Fetching recipient devices from Firebase Firestore...');
    
    let recipientData;
    let devicesMap = {};
    
    try {
      recipientData = await databases.getDocument(
        'UserDatabase', 
        'users', 
        recipientFirebaseUid
      );
      
      // Extract devices map
      devicesMap = recipientData.devices || {};
      
      const deviceCount = Object.keys(devicesMap).length;
      
      if (deviceCount === 0) {
        log('   ⚠️ WARNING: User has NO registered devices');
        log('   This user may be using old sync method or never logged in');
        
        // Fallback to old method (lastAppwriteUserId)
        if (recipientData.lastAppwriteUserId) {
          log('   🔄 Fallback: Using lastAppwriteUserId from mapping');
          devicesMap = {
            'fallback_device': {
              appwriteUserId: recipientData.lastAppwriteUserId,
              deviceName: 'Unknown Device (Legacy)',
              deviceId: 'fallback'
            }
          };
        } else {
          throw new Error('No devices found and no fallback appwriteUserId');
        }
      } else {
        log(`   ✅ Found ${deviceCount} registered device(s)`);
        
        if (deviceCount >= CONFIG.MIN_DEVICES_FOR_WARNING) {
          log(`   ⚠️ WARNING: User has ${deviceCount} devices (above normal threshold)`);
        }
        
        // Log device details
        Object.entries(devicesMap).forEach(([deviceId, deviceData], index) => {
          log(`   Device ${index + 1}: ${deviceData.deviceName || 'Unknown'} (ID: ${deviceId.substring(0, 8)}...)`);
        });
      }
      
    } catch (mappingErr) {
      if (mappingErr.code === 404) {
        error('❌ Recipient not found in UserDatabase');
        return res.json({ 
          success: false, 
          error: 'Recipient user not found in database',
          firebaseUid: recipientFirebaseUid,
          timestamp: new Date().toISOString()
        }, 404);
      } else {
        throw mappingErr;
      }
    }
    
    // ========================================
    // STEP 2: FETCH SENDER INFORMATION
    // ========================================
    
    log('\n👤 Step 2: Fetching sender information...');
    
    let senderName = 'Someone';
    let senderEmail = null;
    
    if (senderFirebaseUid) {
      try {
        const senderDoc = await databases.getDocument(
          'UserDatabase', 
          'users', 
          senderFirebaseUid
        );
        
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
    
    log('\n📤 Step 4: Sending push notifications to all devices...');
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
        // Verify user has push targets
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
        
        // Prepare device-specific notification data
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
          // Device-specific metadata
          deviceId: String(deviceId),
          deviceName: String(deviceName),
          appwriteUserId: String(appwriteUserId),
          notificationVersion: '14.0.0'
        };
        
        // Send push notification
        log(`   📤 Sending push notification...`);
        
        const message = await messaging.createPush(
          sdk.ID.unique(),
          title,
          body,
          undefined,                  // topics
          [appwriteUserId],          // users (this specific device's Appwrite user)
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
    log('========================================\n');
    
    // Return success if at least one device received notification
    const overallSuccess = results.success > 0;
    
    return res.json({
      success: overallSuccess,
      duration: `${totalDuration}ms`,
      recipientFirebaseUid: recipientFirebaseUid,
      senderName: senderName,
      messageType: type,
      devices: {
        total: results.total,
        success: results.success,
        failed: results.failed,
        successRate: `${((results.success / results.total) * 100).toFixed(1)}%`
      },
      deviceResults: results.deviceResults,
      timestamp: new Date().toISOString(),
      version: '14.0.0'
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
      version: '14.0.0'
    }, statusCode);
  }
};
