const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

// Initialize Firebase Admin SDK
function initFirebase() {
  try {
    if (admin.apps.length === 0) {
      // Option 1: Using service account path from environment
      if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        if (fs.existsSync(serviceAccountPath)) {
          const serviceAccount = require(serviceAccountPath);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // Initialize Firestore
            databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
          });
          console.log('Firebase Admin SDK initialized successfully using service account file');
          return true;
        }
      }
      
      // Option 2: Using default service account location
      const defaultServiceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
      if (fs.existsSync(defaultServiceAccountPath)) {
        const serviceAccount = require(defaultServiceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          // Initialize Firestore
          databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
        });
        console.log('Firebase Admin SDK initialized successfully using default service account file');
        return true;
      }
      
      console.warn('Firebase service account not found. Authentication and database will not work.');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    return false;
  }
}

// Verify Firebase ID token
async function verifyToken(token) {
  try {
    if (!token) {
      throw new Error('No token provided');
    }
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying token:', error);
    throw error;
  }
}

module.exports = {
  initFirebase,
  verifyToken,
  admin
};