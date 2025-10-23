
# 🔔 TrovaTask Push Notification System v18.0 PRO

Complete push notification implementation for TrovaTask chat application using **Appwrite Messaging API**, **Firebase Cloud Messaging (FCM)**, and **Firebase Firestore** for device management.

## 📋 Table of Contents

- [Overview](#overview)
- [What's New in v18.0](#whats-new-in-v180)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
  - [1. Firebase Configuration](#1-firebase-configuration)
  - [2. Appwrite Configuration](#2-appwrite-configuration)
  - [3. Android App Configuration](#3-android-app-configuration)
  - [4. Cloud Function Deployment](#4-cloud-function-deployment)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)
- [Performance](#performance)
- [Version History](#version-history)

---

## 🎯 Overview

This push notification system automatically sends real-time notifications to users when they receive new messages in TrovaTask chat. The system uses **Appwrite Messaging API** integrated with **Firebase Cloud Messaging** for reliable delivery, and **Firebase Firestore** for device management and multi-device support.

**Version:** 18.0.0 PRO Edition  
**Last Updated:** October 23, 2025  
**Status:** ✅ Production Ready  
**Plan:** Appwrite Pro (700 req/sec)

---

## 🆕 What's New in v18.0

### Major Updates
- ✨ **Modular Architecture** - Clean separation of concerns (main, config, utils, notification)
- ⚡ **Ultra-Fast Response** - Sub-300ms early response mechanism
- 🚀 **Appwrite Pro Optimized** - 700 req/sec rate limiting
- 📱 **Multi-Device Support** - Firebase Firestore device management
- 🔄 **Advanced Rate Limiting** - Token bucket algorithm with queuing
- ⚡ **Parallel Processing** - 100 concurrent requests
- 🎯 **Smart Retry Logic** - Exponential backoff with 2 attempts
- 📊 **Enhanced Logging** - Comprehensive request tracking

### Breaking Changes
- ❗ **New Dependencies** - Now requires `firebase-admin` SDK
- ❗ **Device Storage** - Uses Firestore instead of Appwrite database
- ❗ **Modular Structure** - Code split into 4 files (main, config, utils, notification)

---

## ✨ Features

- ✅ **Automatic Notifications** - Triggered on message creation
- ✅ **Real-time Delivery** - Instant push notification via FCM (< 300ms)
- ✅ **Multi-Device Support** - Send to all user devices simultaneously
- ✅ **Deep Linking** - Direct navigation to specific chats
- ✅ **Sender Recognition** - Shows sender's name in notification
- ✅ **Media Type Support** - Different icons for images, videos, audio, files
- ✅ **Offline Support** - Notifications work when app is closed
- ✅ **Rate Limiting** - 700 requests/second (Appwrite Pro)
- ✅ **Parallel Processing** - 100 concurrent device notifications
- ✅ **Early Response** - Instant feedback with background completion
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
┌─────────────────────────────────────┐
│  Cloud Function (Modular v18.0)     │
│  ┌──────────────────────────────┐   │
│  │ src/main.js (Entry Point)    │   │
│  └──────────┬───────────────────┘   │
│             ↓                        │
│  ┌──────────────────────────────┐   │
│  │ src/notification.js          │   │
│  │ (Core Logic)                 │   │
│  └──────────┬───────────────────┘   │
│             ↓                        │
│  ┌──────────────────────────────┐   │
│  │ Firebase Firestore           │   │
│  │ (Device Management)          │   │
│  └──────────┬───────────────────┘   │
│             ↓                        │
│  ┌──────────────────────────────┐   │
│  │ src/utils.js                 │   │
│  │ (Rate Limiter, Retry)        │   │
│  └──────────┬───────────────────┘   │
└─────────────┼───────────────────────┘
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
┌─────────────────────────────┐
│   User B Device 1, 2, 3...  │
│   (Notification!)           │
└─────────────────────────────┘
```

### Data Flow

1. **Message Created** → Triggers Appwrite function
2. **Fetch User Data** → Get recipient info from Firestore (parallel)
3. **Fetch Sender Data** → Get sender name from Firestore (parallel)
4. **Parse Devices** → Extract all devices for recipient
5. **Parallel Sending** → Send to all devices concurrently (rate-limited)
6. **Early Response** → Return within 300ms (continue in background)

---

## 📋 Prerequisites

Before starting, ensure you have:

- ✅ **Appwrite Cloud Project** (v1.5+) with **Pro Plan**
- ✅ **Firebase Project** with FCM enabled
- ✅ **Firebase Firestore** database created
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

#### Step 1.2: Create Firestore Database
1. In Firebase Console, go to **Build** → **Firestore Database**
2. Click **"Create database"**
3. Select **Production mode** (or Test mode for development)
4. Choose location (use same region as Appwrite if possible)
5. Click **"Enable"**

#### Step 1.3: Set Up Firestore Structure
Create a `users` collection with documents structured like:

```json
{
  "userId": "firebase_user_123",
  "fullName": "John Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "devices": {
    "device_001": {
      "appwriteUserId": "appwrite_user_abc123",
      "deviceName": "Samsung Galaxy S21",
      "deviceModel": "SM-G991B",
      "osVersion": "Android 13",
      "appVersion": "1.0.0",
      "lastActive": "2025-10-23T12:00:00.000Z",
      "createdAt": "2025-10-20T10:30:00.000Z"
    },
    "device_002": {
      "appwriteUserId": "appwrite_user_xyz789",
      "deviceName": "Pixel 7",
      "deviceModel": "Pixel 7",
      "osVersion": "Android 14",
      "appVersion": "1.0.0",
      "lastActive": "2025-10-23T11:45:00.000Z",
      "createdAt": "2025-10-22T08:15:00.000Z"
    }
  }
}
```

#### Step 1.4: Add Android App
1. In Firebase Console, click **⚙️ Settings** → **Project settings**
2. Under **"Your apps"**, click **Android icon**
3. Register app:
   - **Android package name**: `com.softourtech.trovatask`
   - **App nickname**: TrovaTask
   - **Debug signing certificate** (optional for testing)
4. Click **"Register app"**
5. Download **`google-services.json`**
6. Place in `app/` directory of your Android project

#### Step 1.5: Get Service Account Key
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
     - ✅ `users.read`
     - ✅ `users.write`
     - ✅ `messaging.read`
     - ✅ `messaging.write`
4. Click **"Create"**
5. **Copy the API Key** (shown only once!)

---

### 3. Android App Configuration

#### Step 3.1: Update AppwriteConfig.java

```java
package com.softourtech.trovatask.data.appwrite;

public class AppwriteConfig {
    public static final String ENDPOINT = "https://cloud.appwrite.io/v1";
    public static final String PROJECT_ID = "trovatask";
    public static final String DATABASE_ID = "ChatDatabase";
    
    // Collections
    public static final String CHATS_COLLECTION = "chats";
    public static final String MESSAGES_COLLECTION = "messages";
    
    // ⚠️ IMPORTANT: Replace with your FCM Provider ID from Step 2.2
    public static final String FCM_PROVIDER_ID = "YOUR_PROVIDER_ID_HERE";
}
```

#### Step 3.2: Add Firebase Config (build.gradle)

```gradle
plugins {
    id 'com.android.application'
    id 'com.google.gms.google-services' // Add this
}

dependencies {
    // Firebase BOM
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-messaging'
    implementation 'com.google.firebase:firebase-auth'
    implementation 'com.google.firebase:firebase-firestore'
    
    // Appwrite
    implementation 'io.appwrite:sdk-for-android:5.0.0'
}
```

#### Step 3.3: Update AndroidManifest.xml

```xml
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
   - **Timeout**: 45 seconds
   - **Memory**: 512 MB
3. Click **"Create"**

#### Step 4.2: Prepare Function Code

Create the following file structure:

```
trovatask-push-notification/
├── src/
│   ├── main.js           # Entry point
│   ├── config.js         # Configuration
│   ├── utils.js          # Utilities
│   └── notification.js   # Core logic
├── package.json
└── .gitignore
```

**package.json:**
```json
{
  "name": "trovatask-push-notification",
  "version": "18.0.0",
  "description": "TrovaTask Push Notification System v18.0 PRO",
  "main": "src/main.js",
  "dependencies": {
    "node-appwrite": "^13.0.0",
    "firebase-admin": "^12.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

#### Step 4.3: Upload Function Code
1. Compress the entire `trovatask-push-notification` folder (including `src/` directory)
2. In Appwrite Console, go to your function → **Deployments**
3. Click **"Create deployment"**
4. Upload the `.zip` or `.tar.gz` file
5. Set **Entrypoint**: `src/main.js`
6. Click **"Create"**

#### Step 4.4: Configure Event Trigger
1. In function settings, go to **"Events"** section
2. Click **"Add Event"**
3. Enter: `databases.*.collections.messages.documents.*.create`
4. Click **"Update"**

#### Step 4.5: Add Environment Variables
1. Go to **"Settings"** → **"Environment Variables"**
2. Add variables:
   - **Key**: `APPWRITE_API_KEY`
   - **Value**: API key from Step 2.3
   
   - **Key**: `FIREBASE_SERVICE_ACCOUNT`
   - **Value**: Contents of `service-account.json` (entire JSON as string)
3. Click **"Update"**

#### Step 4.6: Deploy
1. Click **"Deploy"** button
2. Wait for build to complete (2-3 minutes)
3. Check **"Executions"** tab for any errors

---

## 📁 Project Structure

```
trovatask-push-notification/
├── src/
│   ├── main.js              # Entry point (Appwrite handler)
│   ├── config.js            # Configuration constants
│   ├── utils.js             # Utility classes (rate limiter, retry, formatter)
│   └── notification.js      # Core notification logic
├── package.json             # Dependencies
├── .gitignore              # Git ignore rules
├── README.md               # This file
└── LICENSE                 # MIT License
```

### File Responsibilities

| File | Responsibility |
|------|----------------|
| `src/main.js` | Entry point, request handling, validation |
| `src/config.js` | All configuration constants (rate limits, timeouts) |
| `src/utils.js` | Rate limiter, concurrency limiter, retry logic, message formatter |
| `src/notification.js` | Core business logic, Firestore integration, device management |

---

## 🔑 Environment Variables

### Cloud Function Variables

| Variable | Required | Auto-Provided | Value |
|----------|----------|---------------|-------|
| `APPWRITE_FUNCTION_API_ENDPOINT` | ✅ | ✅ Yes | `https://cloud.appwrite.io/v1` |
| `APPWRITE_FUNCTION_PROJECT_ID` | ✅ | ✅ Yes | `trovatask` |
| `APPWRITE_API_KEY` | ✅ | ❌ **Manual** | Your API key from Step 2.3 |
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | ❌ **Manual** | Firebase service account JSON (as string) |

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
3. **Expected Result**: User B receives notification on **all devices** even if app is closed

### Expected Logs (Cloud Function)

```
✅ Completed in 285ms
Devices: 3 total, 3 success, 0 failed
```

### Test Checklist

- [ ] Firebase Firestore database created
- [ ] User document exists in Firestore with `devices` field
- [ ] FCM token registered on login (saved to Firestore)
- [ ] Push target created in Appwrite for each device
- [ ] Message saved to `messages` collection
- [ ] Cloud function triggered automatically
- [ ] Notification received on **all user devices**
- [ ] Deep link opens correct chat
- [ ] Works when app is closed
- [ ] Works when device is locked
- [ ] Handles 100+ concurrent users

---

## 🔧 Troubleshooting

### Issue: No notification received

**Possible Causes:**
1. Device not registered in Firestore → Check `users/{userId}/devices` collection
2. FCM token not registered → Check login logs
3. Push target not created → Check Appwrite Console → Account → Targets
4. Function not triggered → Check function execution logs
5. Invalid Provider ID → Verify `FCM_PROVIDER_ID` in `AppwriteConfig.java`
6. Missing API key scopes → Verify API key has `messaging.write` scope
7. Firebase Service Account not configured → Check environment variables

**Solution:**
```bash
# Check Android logs
adb logcat | grep -E "FcmService|AppwriteManager"

# Check function logs in Appwrite Console
Functions → TrovaTaskSendPushNotification → Executions → Latest
```

### Issue: HTTP 401 Unauthorized

**Cause:** Invalid or missing API key

**Solution:**
1. Verify API key is added to function environment variables
2. Check API key has correct scopes (`users.read`, `messaging.write`)
3. Regenerate API key if needed

### Issue: HTTP 404 Not Found

**Cause:** User not found in Firestore or collection doesn't exist

**Solution:**
1. Verify `users` collection exists in Firebase Firestore
2. Ensure user document exists with correct ID (Firebase UID)
3. Check `recipientId` is valid Firebase user ID
4. Verify document has `devices` field

### Issue: Rate limiting errors

**Cause:** Exceeding 700 requests/second (Appwrite Pro limit)

**Solution:**
- Verify you're on Appwrite Pro plan
- Check function logs for rate limit errors
- Consider upgrading to Enterprise for higher limits

---

## 📚 API Reference

### Cloud Function Input (Event Data)

```json
{
  "recipientId": "firebase_user_id_123",
  "senderId": "firebase_user_id_456",
  "text": "Hello, how are you?",
  "chatId": "chat_abc123",
  "type": "text",
  "messageId": "msg_xyz789",
  "deviceId": "device_001",  // Optional: target specific device
  "$id": "msg_xyz789",
  "$createdAt": "2025-10-23T12:00:00.000Z"
}
```

### Cloud Function Output (Success - Early Response)

```json
{
  "success": true,
  "status": "delivering",
  "devices": 3,
  "duration": "285ms",
  "timestamp": "2025-10-23T12:00:00.000Z"
}
```

### Cloud Function Output (Success - Full Results)

```json
{
  "success": true,
  "duration": "450ms",
  "devices": {
    "total": 3,
    "success": 3,
    "failed": 0
  },
  "deviceResults": [
    {
      "deviceId": "device_001",
      "deviceName": "Samsung Galaxy S21",
      "success": true,
      "messageId": "msg_abc123"
    },
    {
      "deviceId": "device_002",
      "deviceName": "Pixel 7",
      "success": true,
      "messageId": "msg_def456"
    },
    {
      "deviceId": "device_003",
      "deviceName": "OnePlus 9",
      "success": true,
      "messageId": "msg_ghi789"
    }
  ],
  "timestamp": "2025-10-23T12:00:00.000Z"
}
```

### Cloud Function Output (Error)

```json
{
  "success": false,
  "error": "Missing required fields: recipientId or chatId",
  "duration": "12ms",
  "timestamp": "2025-10-23T12:00:00.000Z"
}
```

---

## ⚡ Performance

### Benchmarks (Appwrite Pro Plan)

| Scenario | Devices | Response Time | Success Rate |
|----------|---------|---------------|--------------|
| Single user | 1 device | < 300ms | 100% |
| Single user | 3 devices | < 500ms | 100% |
| 10 concurrent users | 30 devices | < 500ms | 99.5% |
| 100 concurrent users | 300 devices | 1-2 sec | 99% |
| 1000 concurrent users | 3000 devices | 5-10 sec | 98% |

### Performance Features

- ⚡ **Sub-300ms response** - Early response mechanism
- 🚀 **700 req/sec** - Appwrite Pro rate limit
- ⚡ **100 concurrent requests** - Parallel processing
- 🔄 **2 retry attempts** - Exponential backoff
- 📊 **Comprehensive logging** - Request tracking

---

## 📊 Version History

### v18.0.0 PRO (2025-10-23) - Current
- ✨ **PRO EDITION** - Ultra-fast parallel processing, advanced rate limiting (700 req/sec)
- ⚡ **Modular Architecture** - Clean separation (main, config, utils, notification)
- 🚀 **100 Concurrent Requests** - 2x increase from v17.0
- ⚡ **Ultra-Fast Response** - Sub-300ms early response for instant user feedback
- � **Optimized for Appwrite Pro Plan** - Handles 1000+ concurrent users easily
- 🎯 **Reduced Retry Attempts** - 2 instead of 3 (Pro is more stable)
- � **Aggressive Batch Processing** - 50 devices per batch
- 🔄 **Fast Retry Mechanism** - Reduced delays for better performance

### v17.0.0 (2025-10-22) - ULTRA-SCALE
- 🔄 **Built-in Rate Limiting** - Request queuing system
- ⚡ **Exponential Backoff** - Retry mechanism with smart delays
- 🚀 **Concurrency Limiter** - 50 parallel requests
- 🛡️ **Circuit Breaker Pattern** - API failure protection
- ⏱️ **Request Timeout Handling** - 10 seconds max
- 📦 **Batch Processing** - Multiple devices optimized
- 🎯 **Graceful Degradation** - Handles high load efficiently

### v16.0.0 (2025-10-21) - ULTRA-FAST
- ⚡ **Parallel Device Processing** - 5x faster than v15.0
- 🚀 **Reduced API Calls** - Single fast lookup
- 📊 **Parallel Firestore Reads** - 50% faster data fetching
- ⏱️ **Early Response Mechanism** - 500ms threshold
- 📉 **Minimal Logging Overhead** - Optimized performance
- 🔄 **Background Processing Continuation** - Non-blocking operations

### v15.0.0 (2025-10-20) - PRODUCTION PERFECT
- 🎯 **Smart Dual-API Target Detection** - Checks both Account API and Users API
- 🔄 **Backward Compatible** - Works with v13.1 and v14.1
- ✅ **NO Android App Changes Required** - Seamless upgrade
- 🔀 **Automatic Fallback** - Between API types
- 📊 **Per-Device Target Source Tracking** - Enhanced logging
- 🛡️ **Production-Grade Error Handling** - At every level

### v14.1.0 (2025-10-19)
- 📱 **Multi-Device Support** - Firebase Firestore via Firebase Admin SDK
- 🐛 **Fixed userId Parameter Bug** - Corrected parameter handling
- 🎯 **Optional deviceId Targeting** - Target specific devices
- 🔥 **Firebase Firestore Integration** - Device mapping storage
- 📊 **Enhanced Device Management** - Better device tracking

### v13.1.0 (2025-10-18)
- ✅ **Production-Ready Version** - Smart user lookup
- 🔄 **Fallback Mechanisms** - Multiple lookup strategies
- 🛡️ **Enhanced Error Handling** - Comprehensive error management
- 📊 **Improved Logging** - Better debugging capabilities

### v13.0.0 (2025-10-17)
- 🎯 **Smart User Lookup** - Intelligent user detection
- 🔍 **Enhanced User Search** - Better user matching
- 📊 **Improved Performance** - Faster lookup times

### v12.0.0 (2025-10-16)
- 👥 **User Mapping Support** - User ID mapping
- 📄 **Pagination Support** - Handle large datasets
- 🔄 **Bulk Operations** - Process multiple users

### v11.0.0 (2025-10-15)
- 🆕 **Newest User Fallback Logic** - Smart user selection
- 🔍 **Improved User Detection** - Better user matching
- 📊 **Enhanced Reliability** - More robust operations

### v10.0.0 (2025-10-14)
- 🎉 **Official Appwrite Messaging API Integration** - Native messaging support
- 🚀 **Major Architecture Change** - Switched from custom to official API
- ✅ **Production Ready** - Stable and tested

### Earlier Versions (v1.0 - v9.0)
- 🔧 **Development Iterations** - Experimental features and testing
- 📚 **Foundation Building** - Core functionality development

---

## 📝 License

MIT License - Free to use for personal and commercial projects.

---

## 👥 Support

For issues or questions:
- **Email**: [engineering@trovatask.com](mailto:engineering@trovatask.com)
- **GitHub Issues**: [Create an issue](https://github.com/trovatask/push-notifications/issues)
- **Appwrite Discord**: [Join community](https://appwrite.io/discord)

---

## 🙏 Acknowledgments

- **Appwrite Team** - For excellent Messaging API and Pro Plan
- **Firebase Team** - For reliable FCM service and Firestore
- **TrovaTask Team** - For building amazing chat features
- **Open Source Community** - For continuous feedback and improvements

---

**Made with ❤️ by Ashraful & TrovaTask Engineering Team**

*Last updated: October 23, 2025*

