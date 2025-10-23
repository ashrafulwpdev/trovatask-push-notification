/**
 * TrovaTask Push Notification v18.0 PRO
 * Core Notification Logic
 */

const sdk = require('node-appwrite');
const admin = require('firebase-admin');
const config = require('./config');
const { ProRateLimiter, ConcurrencyLimiter, fastRetry, formatNotification } = require('./utils');

// Global instances (singleton pattern)
let rateLimiter;
let concurrencyLimiter;
let firebaseInitialized = false;

// ========================================
// INITIALIZE SDK CLIENTS
// ========================================

function initializeClients() {
  // Appwrite client
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  
  const messaging = new sdk.Messaging(client);
  const users = new sdk.Users(client);
  
  // Firebase Admin SDK
  if (!firebaseInitialized) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
    firebaseInitialized = true;
  }
  
  const db = admin.firestore();
  
  // Rate limiters (singleton)
  if (!rateLimiter) {
    rateLimiter = new ProRateLimiter(config.APPWRITE_RATE_LIMIT);
    concurrencyLimiter = new ConcurrencyLimiter(config.MAX_CONCURRENT_REQUESTS);
  }
  
  return { messaging, users, db };
}

// ========================================
// SEND NOTIFICATION TO SINGLE DEVICE
// ========================================

async function sendToDevice(deviceEntry, notificationPayload, messaging, users) {
  const [deviceId, deviceData] = deviceEntry;
  
  try {
    const appwriteUserId = deviceData.appwriteUserId;
    
    if (!appwriteUserId) {
      return {
        deviceId,
        deviceName: deviceData.deviceName || 'Unknown',
        success: false,
        error: 'No Appwrite User ID'
      };
    }
    
    // Step 1: Fetch push targets (rate-limited)
    const userTargets = await concurrencyLimiter.run(async () => {
      await rateLimiter.acquire();
      return fastRetry(async () => {
        const targets = await users.listTargets(appwriteUserId);
        if (!targets || targets.total === 0) {
          throw new Error('No push targets');
        }
        return targets;
      });
    });
    
    // Step 2: Send push notification (rate-limited)
    const message = await concurrencyLimiter.run(async () => {
      await rateLimiter.acquire();
      return fastRetry(async () => {
        return messaging.createPush(
          sdk.ID.unique(),
          notificationPayload.title,
          notificationPayload.body,
          undefined,
          [appwriteUserId],
          undefined,
          notificationPayload.data,
          undefined, undefined, undefined, undefined,
          undefined, undefined, undefined, false
        );
      });
    });
    
    return {
      deviceId,
      deviceName: deviceData.deviceName || 'Unknown',
      success: true,
      messageId: message.$id
    };
    
  } catch (err) {
    return {
      deviceId,
      deviceName: deviceData.deviceName || 'Unknown',
      success: false,
      error: err.message
    };
  }
}

// ========================================
// MAIN NOTIFICATION HANDLER
// ========================================

async function handleNotification(eventData, log = console.log) {
  const { messaging, users, db } = initializeClients();
  
  // Extract event data
  const {
    recipientId: recipientFirebaseUid,
    senderId: senderFirebaseUid,
    text = 'New message',
    chatId,
    type = 'text',
    messageId,
    deviceId: targetDeviceId
  } = eventData;
  
  // Validation
  if (!recipientFirebaseUid || !chatId) {
    throw new Error('Missing required fields: recipientId or chatId');
  }
  
  log(`🔍 Fetching user data from Firestore...`);
  
  // Fetch user data in parallel
  const [userDoc, senderDoc] = await Promise.all([
    db.collection('users').doc(recipientFirebaseUid).get(),
    senderFirebaseUid 
      ? db.collection('users').doc(senderFirebaseUid).get().catch(() => null)
      : Promise.resolve(null)
  ]);
  
  if (!userDoc.exists) {
    throw new Error('Recipient not found in Firestore');
  }
  
  log(`✅ User data fetched`);
  
  const userData = userDoc.data();
  
  // Parse devices (supports both flat and nested structures)
  let devicesMap = userData.devices || {};
  
  if (Object.keys(devicesMap).length === 0) {
    Object.keys(userData).forEach(key => {
      if (key.startsWith('devices.')) {
        devicesMap[key.replace('devices.', '')] = userData[key];
      }
    });
  }
  
  // Filter by target device if specified
  if (targetDeviceId && devicesMap[targetDeviceId]) {
    devicesMap = { [targetDeviceId]: devicesMap[targetDeviceId] };
  }
  
  if (Object.keys(devicesMap).length === 0) {
    throw new Error('No devices found for recipient');
  }
  
  log(`📱 Found ${Object.keys(devicesMap).length} device(s)`);
  
  // Get sender name
  const senderName = senderDoc?.data()?.fullName || 
                     senderDoc?.data()?.username || 
                     'Someone';
  
  log(`👤 Sender: ${senderName}`);
  
  // Format notification content
  const { title, body } = formatNotification(type, text, senderName);
  
  log(`📢 Notification:`);
  log(`   Title: ${title}`);
  log(`   Body: ${body}`);
  
  // Prepare notification payload
  const notificationPayload = {
    title,
    body,
    data: {
      type: 'chat_message',
      chatId: String(chatId),
      messageId: String(messageId || ''),
      senderId: String(senderFirebaseUid || ''),
      senderName: String(senderName),
      messageType: String(type),
      timestamp: new Date().toISOString(),
      deepLink: `trovatask://chat/${chatId}`
    }
  };
  
  log(`⚡ Starting parallel device sending...`);
  
  // Send to all devices in parallel
  const deviceEntries = Object.entries(devicesMap);
  const notificationPromises = deviceEntries.map(entry => 
    sendToDevice(entry, notificationPayload, messaging, users)
  );
  
  // Early response mechanism
  const earlyTimeout = new Promise(resolve => 
    setTimeout(() => resolve({ earlyResponse: true }), config.EARLY_RESPONSE_THRESHOLD)
  );
  
  const raceResult = await Promise.race([
    Promise.allSettled(notificationPromises),
    earlyTimeout
  ]);
  
  // Handle early response (instant feedback)
  if (raceResult.earlyResponse) {
    log(`⚡ Early response triggered (${config.EARLY_RESPONSE_THRESHOLD}ms)`);
    
    // Continue processing in background
    Promise.allSettled(notificationPromises).then(results => {
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      log(`✅ Background complete: ${successful}/${deviceEntries.length} delivered`);
    }).catch(() => {});
    
    return {
      success: true,
      status: 'delivering',
      devices: deviceEntries.length
    };
  }
  
  // Handle full results
  const results = raceResult.map(r => 
    r.status === 'fulfilled' ? r.value : { success: false }
  );
  
  const successful = results.filter(r => r.success).length;
  
  log(`✅ All devices processed: ${successful}/${deviceEntries.length} success`);
  
  // Log each device result
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    log(`   ${status} Device ${index + 1}: ${result.deviceName || 'Unknown'} - ${result.success ? 'Sent' : result.error}`);
  });
  
  return {
    success: successful > 0,
    devices: {
      total: deviceEntries.length,
      success: successful,
      failed: deviceEntries.length - successful
    },
    deviceResults: results
  };
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  handleNotification
};
