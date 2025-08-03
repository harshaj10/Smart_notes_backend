const { admin } = require('./firebase');

// Initialize Firestore
function getFirestore() {
  if (!admin.apps.length) {
    console.error('Firebase Admin SDK is not initialized yet!');
    return null;
  }
  
  return admin.firestore();
}

// Helper function to convert Firestore document to a regular object with ID
const docToObject = (doc) => {
  if (!doc || !doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

// Helper function to convert a Firestore snapshot to an array of objects
const snapshotToArray = (snapshot) => {
  if (!snapshot) return [];
  
  const items = [];
  snapshot.forEach((doc) => {
    items.push({ id: doc.id, ...doc.data() });
  });
  return items;
};

module.exports = {
  getFirestore,
  docToObject,
  snapshotToArray
};