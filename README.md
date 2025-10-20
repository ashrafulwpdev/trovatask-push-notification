
# 🔔 TrovaTask Push Notification System

Complete push notification implementation for TrovaTask chat application using Appwrite Messaging API and Firebase Cloud Messaging (FCM).

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
  - [1. Firebase Configuration](#1-firebase-configuration)
  - [2. Appwrite Configuration](#2-appwrite-configuration)
  - [3. Android App Configuration](#3-android-app-configuration)
  - [4. Cloud Function Deployment](#4-cloud-function-deployment)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)
- [Version History](#version-history)

---

## 🎯 Overview

This push notification system automatically sends real-time notifications to users when they receive new messages in TrovaTask chat. The system uses Appwrite's native Messaging API integrated with Firebase Cloud Messaging for reliable delivery.

**Version:** 4.0  
**Last Updated:** October 20, 2025  
**Status:** ✅ Production Ready

---

## ✨ Features

- ✅ **Automatic Notifications** - Triggered on message creation
- ✅ **Real-time Delivery** - Instant push notification via FCM
- ✅ **Deep Linking** - Direct navigation to specific chats
- ✅ **Sender Recognition** - Shows sender's name in notification
- ✅ **Multiple Device Support** - Automatic token management
- ✅ **Offline Support** - Notifications work when app is closed
- ✅ **Production-Ready** - Comprehensive error handling and logging

---

## 🏗️ Architecture

```

┌────────────────────┐
│   User A Device    │
│   (Android App)    │
└─────────┬──────────┘
│ Sends message
↓
┌─────────────────────┐
│  Appwrite Database  │
│  (messages)         │
└─────────┬───────────┘
│ Event trigger
↓
┌─────────────────────┐
│  Cloud Function     │
│  (Auto-triggered)   │
└─────────┬───────────┘
│ Calls Messaging API
↓
┌─────────────────────┐
│  Appwrite Messaging │
│  (FCM Provider)     │
└─────────┬───────────┘
│ Sends to FCM
↓
┌─────────────────────┐
│ Firebase FCM Server │
└─────────┬───────────┘
│ Delivers push
↓
┌─────────────────────┐
│   User B Device     │
│   (Notification!)   │
└─────────────────────┘

```

---

## 📋 Prerequisites

Before starting, ensure you have:

- ✅ **Appwrite Cloud Project** (v1.5+)
- ✅ **Firebase Project** with FCM enabled
- ✅ **Android Studio** (for app development)
- ✅ **Node.js** 18+ (for cloud function)
- ✅ **Firebase Service Account JSON** file

---

## 🚀 Setup Guide

### 1. Firebase Configuration

#### Step 1.1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or select existing project
3. Enable **Google Analytics** (optional)
4. Click **"Create project"**

#### Step 1.2: Add Android App
1. In Firebase Console, click **⚙️ Settings** → **Project settings**
2. Under **"Your apps"**, click **Android icon**
3. Register app:
   - **Android package name**: `com.softourtech.trovatask`
   - **App nickname**: TrovaTask
   - **Debug signing certificate** (optional for testing)
4. Click **"Register app"**
5. Download **`google-services.json`**
6. Place in `app/` directory of your Android project

#### Step 1.3: Get Service Account Key
1. In Firebase Console, click **⚙️ Settings** → **Project settings**
2. Go to **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Download **`service-account.json`** file
5. **Keep this file secure!** (Don't commit to Git)

---

### 2. Appwrite Configuration

#### Step 2.1: Create Appwrite Database
1. Go to [Appwrite Console](https://cloud.appwrite.io)
2. Navigate to **Databases** → **Create database**
3. Name: `ChatDatabase`
4. Create collections:
   - **`messages`** - Stores chat messages
   - **`chats`** - Stores chat metadata
   - **`users`** - Stores user profiles

#### Step 2.2: Configure FCM Provider
1. In Appwrite Console, go to **Messaging** → **Providers**
2. Click **"Add provider"**
3. Select **"Push notification"** → **"FCM"**
4. Configure provider:
   - **Name**: `TrovaTask FCM`
   - **Service Account JSON**: Upload `service-account.json` from Firebase
5. Click **"Create"**
6. **Copy the Provider ID** (e.g., `676ab8e4000d9e4c5678`)

#### Step 2.3: Create API Key
1. Go to **Overview** → **API Keys**
2. Click **"Create API Key"**
3. Configure:
   - **Name**: `TrovaTask Push Notification Function`
   - **Expiration**: Never (or set far future)
   - **Scopes**: 
     - ✅ `databases.read`
     - ✅ `databases.write`
     - ✅ `users.read`
     - ✅ `messaging.read`
     - ✅ `messaging.write`
4. Click **"Create"**
5. **Copy the API Key** (shown only once!)

---

### 3. Android App Configuration

#### Step 3.1: Update AppwriteConfig.java

```

package com.softourtech.trovatask.data.appwrite;

public class AppwriteConfig {
public static final String ENDPOINT = "https://sfo.cloud.appwrite.io";
public static final String PROJECT_ID = "trovatask";
public static final String DATABASE_ID = "ChatDatabase";

    // Collections
    public static final String CHATS_COLLECTION = "chats";
    public static final String MESSAGES_COLLECTION = "messages";
    public static final String USERS_COLLECTION = "users";
    
    // ⚠️ IMPORTANT: Replace with your FCM Provider ID from Step 2.2
    public static final String FCM_PROVIDER_ID = "YOUR_PROVIDER_ID_HERE";
    }

```

#### Step 3.2: Add Dependencies (build.gradle)

```

dependencies {
// Firebase
implementation platform('com.google.firebase:firebase-bom:32.7.0')
implementation 'com.google.firebase:firebase-messaging'
implementation 'com.google.firebase:firebase-auth'
implementation 'com.google.firebase:firebase-firestore'

    // Retrofit for Appwrite REST API
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.12.0'
    }

```

#### Step 3.3: Update AndroidManifest.xml

```

<service
    android:name=".data.firebase.FcmService"
    android:exported="false">
<intent-filter>
<action android:name="com.google.firebase.MESSAGING_EVENT" />
</intent-filter>
</service>

<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="trovatask_default_channel" />

```

---

### 4. Cloud Function Deployment

#### Step 4.1: Create Function in Appwrite
1. Go to **Functions** → **Create function**
2. Configure:
   - **Name**: `TrovaTaskSendPushNotification`
   - **Runtime**: Node.js 18.0
   - **Execute Access**: Server
   - **Timeout**: 15 seconds
3. Click **"Create"**

#### Step 4.2: Upload Function Code
1. Create `index.js` with the function code provided
2. Create `package.json`:
```

{
"name": "trovatask-push-notification",
"version": "4.0.0",
"main": "index.js",
"dependencies": {
"node-appwrite": "^11.0.0"
},
"engines": {
"node": ">=18.0.0"
}
}

```
3. Upload both files to the function

#### Step 4.3: Configure Event Trigger
1. In function settings, go to **"Events"** section
2. Click **"Add Event"**
3. Enter: `databases.*.collections.messages.documents.*.create`
4. Click **"Update"**

#### Step 4.4: Add Environment Variable
1. Go to **"Settings"** → **"Environment Variables"**
2. Add variable:
   - **Key**: `APPWRITE_API_KEY`
   - **Value**: API key from Step 2.3
3. Click **"Add"** then **"Update"**

#### Step 4.5: Deploy
1. Click **"Deploy"** button
2. Wait for build to complete (1-2 minutes)
3. Check **"Executions"** tab for any errors

---

## 🔑 Environment Variables

### Cloud Function Variables

| Variable | Required | Auto-Provided | Value |
|----------|----------|---------------|-------|
| `APPWRITE_FUNCTION_API_ENDPOINT` | ✅ | ✅ Yes | `https://cloud.appwrite.io/v1` |
| `APPWRITE_FUNCTION_PROJECT_ID` | ✅ | ✅ Yes | `trovatask` |
| `APPWRITE_API_KEY` | ✅ | ❌ **Manual** | Your API key from Step 2.3 |

### Android App Configuration

| Constant | File | Value |
|----------|------|-------|
| `FCM_PROVIDER_ID` | `AppwriteConfig.java` | Provider ID from Step 2.2 |
| `PROJECT_ID` | `AppwriteConfig.java` | `trovatask` |
| `DATABASE_ID` | `AppwriteConfig.java` | `ChatDatabase` |

---

## 🧪 Testing

### Manual Test

1. **Setup**: Ensure two users are logged in on different devices
2. **Send Message**: User A sends message to User B
3. **Expected Result**: User B receives notification even if app is closed

### Expected Logs (Cloud Function)

```

🚀 TrovaTask Push Notification v4.0
⏰ Invoked: 2025-10-20T12:00:00.000Z
========================================
📨 Event data received
📢 Notification details:
→ Recipient: user123
→ Sender: user456
→ Chat ID: chat789
→ Type: text
→ Message: "Hello there!"
🔍 Fetching sender info for: user456
✅ Sender name: John Doe
📤 Sending notification...
Title: "John Doe sent you a message"
Body: "Hello there!"
✅ Notification sent successfully in 245ms
Message ID: msg_abc123
Status: sent
========================================

```

### Test Checklist

- [ ] FCM token registered on login
- [ ] Push target created in Appwrite
- [ ] Message saved to `messages` collection
- [ ] Cloud function triggered automatically
- [ ] Notification received on device
- [ ] Deep link opens correct chat
- [ ] Works when app is closed
- [ ] Works when device is locked

---

## 🔧 Troubleshooting

### Issue: No notification received

**Possible Causes:**
1. FCM token not registered → Check login logs
2. Push target not created → Check Appwrite Console → Account → Targets
3. Function not triggered → Check function execution logs
4. Invalid Provider ID → Verify `FCM_PROVIDER_ID` in `AppwriteConfig.java`
5. Missing API key scopes → Verify API key has `messaging.write` scope

**Solution:**
```


# Check Android logs

adb logcat | grep -E "FcmService|AppwriteManager"

# Check function logs in Appwrite Console

Functions → TrovaTaskSendPushNotification → Executions → Latest

```

### Issue: HTTP 401 Unauthorized

**Cause:** Invalid or missing API key

**Solution:**
1. Verify API key is added to function environment variables
2. Check API key has correct scopes
3. Regenerate API key if needed

### Issue: HTTP 404 Not Found

**Cause:** User not found or collection doesn't exist

**Solution:**
1. Verify `users` collection exists in `ChatDatabase`
2. Ensure user document exists with correct ID
3. Check `recipientId` is valid Firebase user ID

---

## 📚 API Reference

### Cloud Function Input (Event Data)

```

{
"recipientId": "firebase_user_id_123",
"senderId": "firebase_user_id_456",
"text": "Hello, how are you?",
"chatId": "chat_abc123",
"type": "text",
"$id": "msg_xyz789",
  "$createdAt": "2025-10-20T12:00:00.000Z"
}

```

### Cloud Function Output (Success)

```

{
"success": true,
"duration": "245ms",
"messageId": "msg_abc123",
"recipient": "firebase_user_id_123",
"sender": "John Doe",
"status": "sent"
}

```

### Cloud Function Output (Error)

```

{
"success": false,
"error": "Missing recipientId in event data",
"duration": "12ms"
}

```

---

## 📊 Version History

### v4.0.0 (2025-10-20) - Current
- ✅ Modular design with helper functions
- ✅ Enhanced error handling
- ✅ Better logging with emojis
- ✅ Comprehensive documentation
- ✅ Production-ready

### v3.0.0 (2025-10-19)
- ✅ Switched to Appwrite Messaging API
- ✅ Removed Firebase Admin SDK dependency
- ✅ Added Push Targets support

### v2.0.0 (2025-10-18)
- ✅ Added sender name lookup
- ✅ Custom push_tokens collection
- ✅ Deep link support

### v1.0.0 (2025-10-17)
- ✅ Initial release
- ✅ Basic push notification support

---

## 📝 License

MIT License - Free to use for personal and commercial projects.

---

## 👥 Support

For issues or questions:
- **Email**: support@trovatask.com
- **GitHub Issues**: [Create an issue](https://github.com/trovatask/push-notifications/issues)
- **Appwrite Discord**: [Join community](https://appwrite.io/discord)

---

## 🙏 Acknowledgments

- **Appwrite Team** - For excellent Messaging API
- **Firebase Team** - For reliable FCM service
- **TrovaTask Team** - For building amazing chat features

---

**Made with ❤️ by TrovaTask Engineering Team**

*Last updated: October 20, 2025*

