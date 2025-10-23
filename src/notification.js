/**
 * ========================================
 * TROVATASK v18.1 PRO - AUTO-CLEANUP
 * Push Notification Handler
 * ========================================
 */

const admin = require('firebase-admin');
const sdk = require('node-appwrite');
const config = require('./config');

// Initialize Firebase Admin (inline - no separate file needed)
function initializeClients() {
  // Initialize Firebase Admin if not already initialized
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  const db = admin.firestore();

  // Initialize Appwrite clients
  const appwriteClient = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const messaging = new sdk.Messaging(appwriteClient);
  const users = new sdk.Users(appwriteClient);

  return { messaging, users, db };
}

// Rate limiter and concurrency control (from previous code)
class RateLimiter {
  constructor(maxPerSecond) {
    this.maxPerSecond = maxPerSecond;
    this.tokens = maxPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxPerSecond, this.tokens + timePassed * this.maxPerSecond);
    this.lastRefill = now;

    if (this.tokens < 1) {
      const waitTime = ((1 - this.tokens) / this.maxPerSecond) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.tokens = 0;
    } else {
      this.tokens -= 1;
    }
  }
}

class ConcurrencyLimiter {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async run(fn) {
    while (this.current >= this.max) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.current++;
    try {
      return await fn();
    } finally {
      this.current--;
      if (this.queue.length > 0) {
        const resolve = this.queue.shift();
        resolve();
      }
    }
  }
}

const rateLimiter = new RateLimiter(config.RATE_LIMIT_PER_SECOND);
const concurrencyLimiter = new ConcurrencyLimiter(config.MAX_CONCURRENT_REQUESTS);

async function fastRetry(fn, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
    }
  }
}

function formatNotification(type, text, senderName) {
  const typeMap = {
    text: { title: senderName, body: text },
    image: { title: senderName, body: '📷 Photo' },
    video: { title: senderName, body: '🎥 Video' },
    file: { title: senderName, body: '📎 File' },
    audio: { title: senderName, body: '🎵 Audio' }
  };
  
  return typeMap[type] || { title: senderName, body: 'New message' };
}

/**
 * ✅ ENHANCED v18.1: Send notification to a single device with auto-cleanup
 * 
 * NEW: Automatically removes invalid devices from Firestore
 */
async function sendToDevice(deviceEntry, notificationPayload, messaging, users, db, recipientFirebaseUid) {
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
    
    // Rate-limited target fetch
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

    // Rate-limited push send
    const message = await concurrencyLimiter.run(async () => {
      await rateLimiter.acquire();
      return fastRetry(async () => {
        const sdk = require('node-appwrite');
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
    // ✅ NEW v18.1: AUTO-CLEANUP invalid devices
    if (err.message.includes('could not be found')) {
      console.log(`🧹 Removing invalid device ${deviceId} from Firestore for user ${recipientFirebaseUid}`);
      try {
        await db.collection('users').doc(recipientFirebaseUid)
          .update({ [`devices.${deviceId}`]: admin.firestore.FieldValue.delete() });
        console.log(`✅ Device ${deviceId} removed successfully`);
      } catch (removeErr) {
        console.error(`❌ Failed to remove device ${deviceId}: ${removeErr.message}`);
      }
    }
    
    return {
      deviceId,
      deviceName: deviceData.deviceName || 'Unknown',
      success: false,
      error: err.message
    };
  }
}

/**
 * ✅ ENHANCED v18.1: Main notification handler with enhanced logging
 */
async function handleNotification(eventData) {
  const { messaging, users, db } = initializeClients();
  
  const {
    recipientId: recipientFirebaseUid,
    senderId: senderFirebaseUid,
    text = 'New message',
    chatId,
    type = 'text',
    messageId,
    deviceId: targetDeviceId
  } = eventData;
  
  console.log(`🔍 Fetching user data from Firestore...`);
  
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
  
  console.log(`✅ User data fetched`);
  
  const userData = userDoc.data();
  
  // Parse devices
  let devicesMap = userData.devices || {};
  
  if (Object.keys(devicesMap).length === 0) {
    Object.keys(userData).forEach(key => {
      if (key.startsWith('devices.')) {
        devicesMap[key.replace('devices.', '')] = userData[key];
      }
    });
  }
  
  if (targetDeviceId && devicesMap[targetDeviceId]) {
    devicesMap = { [targetDeviceId]: devicesMap[targetDeviceId] };
  }
  
  if (Object.keys(devicesMap).length === 0) {
    throw new Error('No devices found for recipient');
  }
  
  console.log(`📱 Found ${Object.keys(devicesMap).length} device(s)`);
  
  // Get sender name
  const senderName = senderDoc?.data()?.fullName || 
                     senderDoc?.data()?.username || 
                     'Someone';
  
  console.log(`👤 Sender: ${senderName}`);
  
  // Format notification content
  const { title, body } = formatNotification(type, text, senderName);
  
  console.log(`📢 Notification:`);
  console.log(`   Title: ${title}`);
  console.log(`   Body: ${body}`);
  
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
  
  console.log(`⚡ Starting parallel device sending...`);
  
  // Send to all devices in parallel (with db and recipientFirebaseUid)
  const deviceEntries = Object.entries(devicesMap);
  const notificationPromises = deviceEntries.map(entry => 
    sendToDevice(entry, notificationPayload, messaging, users, db, recipientFirebaseUid)
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
    console.log(`⚡ Early response triggered (${config.EARLY_RESPONSE_THRESHOLD}ms)`);
    
    // Continue processing in background
    Promise.allSettled(notificationPromises).then(results => {
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      console.log(`✅ Background complete: ${successful}/${deviceEntries.length} delivered`);
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
  
  console.log(`✅ All devices processed: ${successful}/${deviceEntries.length} success`);
  
  // Log each device result
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${status} Device ${index + 1}: ${result.deviceName || 'Unknown'} - ${result.success ? 'Sent' : result.error}`);
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

module.exports = { handleNotification };
