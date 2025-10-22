const sdk = require('node-appwrite');

/**
 * ========================================
 * TROVATASK PUSH NOTIFICATION v14.1 FINAL
 * ========================================
 * 
 * FEATURES:
 * ✅ Reads devices map from Firebase Firestore via REST API
 * ✅ Multi-device support (sends to ALL user devices)
 * ✅ Per-device error handling
 * ✅ Human-readable device names in logs
 * ✅ Fixed userId parameter bug
 * ✅ NO Firebase Admin dependency needed!
 * 
 * Architecture:
 * - Firebase Firestore: Device mapping (via REST API)
 * - Appwrite Messaging: Push notification delivery
 * - Multi-device: Each device gets its own notification
 * 
 * Author: TrovaTask Engineering Team
 * Version: 14.1.0 FINAL
 * Date: October 22, 2025
 * ========================================
 */

const CONFIG = {
  MAX_TEXT_LENGTH: 100,
  TRUNCATE_SUFFIX: '...',
  MIN_DEVICES_FOR_WARNING: 5,
  TIMEOUT_PER_DEVICE: 5000
};

module.exports = async ({ req, res, log, error }) => {
  const startTime = Date.now();
  
  log('========================================');
  log('🚀 TrovaTask Push Notification v14.1 FINAL');
  log(`⏰ Timestamp: ${new Date().toISOString()}`);
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
    
    log('\n📋 Message Details:');
    log(`   Recipient: ${recipientFirebaseUid || 'MISSING ❌'}`);
    log(`   Sender: ${senderFirebaseUid || 'MISSING ⚠️'}`);
    log(`   Chat: ${chatId || 'MISSING ❌'}`);
    log(`   Type: ${type}`);
    log(`   Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    // Validation
    if (!recipientFirebaseUid || !chatId) {
      error('❌ Missing required fields');
      return res.json({ 
        success: false, 
        error: 'Missing recipientId or chatId' 
      }, 400);
    }
    
    // Initialize Appwrite
    log('\n🔧 Initializing Appwrite...');
    
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);
    
    const messaging = new sdk.Messaging(client);
    const users = new sdk.Users(client);
    
    log('   ✓ Appwrite initialized');
    
    // ========================================
    // STEP 1: FETCH DEVICES FROM FIRESTORE (REST API)
    // ========================================
    
    log('\n🔍 Step 1: Fetching devices from Firebase Firestore...');
    
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/trovataskapp/databases/(default)/documents/users/${recipientFirebaseUid}`;
    
    let devicesMap = {};
    let userData = null;
    
    try {
      const response = await fetch(firestoreUrl);
      
      if (!response.ok) {
        throw new Error(`Firestore HTTP ${response.status}`);
      }
      
      const firestoreDoc = await response.json();
      
      // Parse Firestore document format
      if (firestoreDoc.fields) {
        // Extract devices map
        if (firestoreDoc.fields.devices && firestoreDoc.fields.devices.mapValue) {
          const devicesFields = firestoreDoc.fields.devices.mapValue.fields;
          
          for (const [deviceId, deviceValue] of Object.entries(devicesFields)) {
            if (deviceValue.mapValue && deviceValue.mapValue.fields) {
              const fields = deviceValue.mapValue.fields;
              
              devicesMap[deviceId] = {
                appwriteUserId: fields.appwriteUserId?.stringValue || '',
                deviceName: fields.deviceName?.stringValue || 'Unknown',
                deviceId: fields.deviceId?.stringValue || deviceId
              };
            }
          }
        }
        
        // Store for sender lookup
        userData = {
          fullName: firestoreDoc.fields.fullName?.stringValue || '',
          username: firestoreDoc.fields.username?.stringValue || '',
          email: firestoreDoc.fields.email?.stringValue || '',
          lastAppwriteUserId: firestoreDoc.fields.lastAppwriteUserId?.stringValue || ''
        };
      }
      
      const deviceCount = Object.keys(devicesMap).length;
      
      if (deviceCount === 0) {
        log('   ⚠️ No devices found');
        
        // Fallback to lastAppwriteUserId
        if (userData && userData.lastAppwriteUserId) {
          log('   🔄 Using fallback appwriteUserId');
          devicesMap = {
            'fallback': {
              appwriteUserId: userData.lastAppwriteUserId,
              deviceName: 'Unknown Device',
              deviceId: 'fallback'
            }
          };
        } else {
          throw new Error('No devices and no fallback');
        }
      } else {
        log(`   ✅ Found ${deviceCount} device(s)`);
        
        Object.entries(devicesMap).forEach(([deviceId, deviceData], index) => {
          log(`   Device ${index + 1}: ${deviceData.deviceName} (${deviceId.substring(0, 8)}...)`);
        });
      }
      
    } catch (firestoreErr) {
      error(`❌ Firestore fetch failed: ${firestoreErr.message}`);
      return res.json({ 
        success: false, 
        error: 'Failed to fetch user data' 
      }, 404);
    }
    
    // ========================================
    // STEP 2: FETCH SENDER NAME
    // ========================================
    
    log('\n👤 Step 2: Fetching sender...');
    
    let senderName = 'Someone';
    
    if (senderFirebaseUid) {
      try {
        const senderUrl = `https://firestore.googleapis.com/v1/projects/trovataskapp/databases/(default)/documents/users/${senderFirebaseUid}`;
        const senderResponse = await fetch(senderUrl);
        
        if (senderResponse.ok) {
          const senderDoc = await senderResponse.json();
          
          if (senderDoc.fields) {
            senderName = senderDoc.fields.fullName?.stringValue || 
                        senderDoc.fields.username?.stringValue || 
                        'Someone';
          }
        }
        
        log(`   ✅ Sender: ${senderName}`);
      } catch (err) {
        log(`   ⚠️ Could not fetch sender`);
      }
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
        body = text.substring(0, CONFIG.MAX_TEXT_LENGTH);
    }
    
    log(`   Title: "${title}"`);
    log(`   Body: "${body}"`);
    
    // ========================================
    // STEP 4: SEND TO ALL DEVICES
    // ========================================
    
    log('\n📤 Step 4: Sending notifications...');
    log('========================================');
    
    const results = {
      total: Object.keys(devicesMap).length,
      success: 0,
      failed: 0,
      deviceResults: []
    };
    
    for (const [deviceId, deviceData] of Object.entries(devicesMap)) {
      const deviceStartTime = Date.now();
      const deviceName = deviceData.deviceName || 'Unknown';
      const appwriteUserId = deviceData.appwriteUserId;
      
      log(`\n📱 ${deviceName}`);
      log(`   Device ID: ${deviceId}`);
      log(`   Appwrite ID: ${appwriteUserId}`);
      
      try {
        // Verify targets
        log(`   🔍 Checking targets...`);
        
        const userTargets = await users.listTargets(appwriteUserId);
        
        if (userTargets.total === 0) {
          log(`   ⚠️ No targets, skipping`);
          results.failed++;
          results.deviceResults.push({
            deviceId,
            deviceName,
            success: false,
            error: 'No push targets',
            duration: Date.now() - deviceStartTime
          });
          continue;
        }
        
        log(`   ✓ Found ${userTargets.total} target(s)`);
        
        // Prepare data
        const notificationData = {
          type: 'chat_message',
          chatId: String(chatId),
          messageId: String(messageId),
          senderId: String(senderFirebaseUid || ''),
          senderName: String(senderName),
          recipientId: String(recipientFirebaseUid),
          messageType: String(type),
          timestamp: new Date().toISOString(),
          deepLink: `trovatask://chat/${chatId}`,
          badge: '1',
          deviceId: String(deviceId),
          deviceName: String(deviceName),
          version: '14.1.0'
        };
        
        // Send notification
        log(`   📤 Sending...`);
        
        const message = await messaging.createPush(
          sdk.ID.unique(),
          title,
          body,
          undefined,
          [appwriteUserId],  // ✅ FIXED: users parameter
          undefined,
          notificationData
        );
        
        const duration = Date.now() - deviceStartTime;
        
        log(`   ✅ SUCCESS! ${message.$id}`);
        log(`   Duration: ${duration}ms`);
        
        results.success++;
        results.deviceResults.push({
          deviceId,
          deviceName,
          success: true,
          messageId: message.$id,
          duration
        });
        
      } catch (deviceErr) {
        const duration = Date.now() - deviceStartTime;
        
        error(`   ❌ FAILED: ${deviceErr.message}`);
        error(`   Duration: ${duration}ms`);
        
        results.failed++;
        results.deviceResults.push({
          deviceId,
          deviceName,
          success: false,
          error: deviceErr.message,
          duration
        });
      }
    }
    
    // ========================================
    // FINAL SUMMARY
    // ========================================
    
    const totalDuration = Date.now() - startTime;
    
    log('\n========================================');
    log(`✅ COMPLETE!`);
    log('========================================');
    log(`⏱️ Duration: ${totalDuration}ms`);
    log(`📊 Results:`);
    log(`   Total: ${results.total}`);
    log(`   Success: ${results.success}`);
    log(`   Failed: ${results.failed}`);
    log(`   Rate: ${((results.success / results.total) * 100).toFixed(1)}%`);
    log('========================================');
    
    return res.json({
      success: results.success > 0,
      duration: `${totalDuration}ms`,
      devices: results,
      sender: senderName,
      timestamp: new Date().toISOString(),
      version: '14.1.0'
    });
    
  } catch (err) {
    const duration = Date.now() - startTime;
    
    error('\n========================================');
    error('❌ ERROR');
    error('========================================');
    error(`Duration: ${duration}ms`);
    error(`Message: ${err.message}`);
    error(`Stack: ${err.stack}`);
    error('========================================');
    
    return res.json({
      success: false,
      error: err.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }, 500);
  }
};
