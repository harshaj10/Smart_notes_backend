const { getFirestore, docToObject, snapshotToArray } = require('../config/firestore');
const { v4: uuidv4 } = require('uuid');

class User {
  static getCollections() {
    const db = getFirestore();
    if (!db) {
      throw new Error('Firestore is not initialized');
    }
    
    return {
      usersCollection: db.collection('users'),
      db
    };
  }
  
  // Create a new user
  static async createUser(userData) {
    const { usersCollection } = this.getCollections();
    const { uid, email, displayName, photoURL } = userData;
    
    console.log('Creating/updating user with data:', { uid, email, displayName });
    
    // Validate user ID - this fixes the "not a valid resource path" error
    if (!uid || typeof uid !== 'string' || uid.trim() === '') {
      throw new Error('Invalid user ID. Cannot create user with empty ID.');
    }

    // Validate email is provided
    if (!email || typeof email !== 'string' || email.trim() === '') {
      throw new Error('Valid email is required to create a user.');
    }
    
    const user = {
      id: uid,
      email,
      displayName: displayName || email.split('@')[0],
      photoURL: photoURL || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    try {
      // Check if user already exists
      const existingUser = await usersCollection.doc(uid).get();
      
      if (existingUser.exists) {
        // Update existing user with any new information
        await usersCollection.doc(uid).update({
          displayName: user.displayName,
          photoURL: user.photoURL,
          updatedAt: user.updatedAt
        });
        console.log(`User ${uid} already exists. Updated user data.`);
        return docToObject(await usersCollection.doc(uid).get());
      }
      
      // Create new user
      await usersCollection.doc(uid).set(user);
      console.log(`User ${uid} created successfully.`);
      return user;
    } catch (error) {
      console.error('Error creating/updating user:', error);
      throw error;
    }
  }
  
  // Get user by ID
  static async getUserById(userId) {
    const { usersCollection } = this.getCollections();
    
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      console.error('Invalid user ID provided to getUserById:', userId);
      return null;
    }
    
    try {
      console.log(`Getting user by ID: ${userId}`);
      const userDoc = await usersCollection.doc(userId).get();
      
      // If the user doc exists, return it
      if (userDoc.exists) {
        return docToObject(userDoc);
      }
      
      // Check if this is a pending user (from sharing a note with someone who hasn't registered yet)
      if (userId.startsWith('pending_')) {
        console.log(`User ${userId} appears to be a pending user`);
        
        // Try to extract email from the pending ID
        // Format: pending_username_domain_com
        const emailPart = userId.substring(8); // remove 'pending_'
        
        // Find the last underscore before the domain
        const lastUnderscoreIndex = emailPart.lastIndexOf('_');
        
        if (lastUnderscoreIndex > 0) {
          // Extract domain with extension (e.g., gmail_com)
          const domain = emailPart.substring(lastUnderscoreIndex + 1);
          // Extract username (everything before the last underscore)
          const username = emailPart.substring(0, lastUnderscoreIndex);
          
          // Reconstruct email (username@domain.ext)
          // Replace all underscores in domain with dots
          const formattedDomain = domain.replace(/_/g, '.');
          const potentialEmail = username + '@' + formattedDomain;
          
          console.log(`Reconstructed potential email: ${potentialEmail}`);
          
          // Create a placeholder user if we can reconstruct the email
          return {
            id: userId,
            email: potentialEmail,
            displayName: username,
            photoURL: null,
            isPending: true,
            createdAt: new Date().toISOString()
          };
        }
      }
      
      console.log(`No user found with ID: ${userId}`);
      return null;
    } catch (error) {
      console.error(`Error fetching user by ID ${userId}:`, error);
      throw error;
    }
  }
  
  // Get user by email
  static async getUserByEmail(email) {
    const { usersCollection } = this.getCollections();
    
    if (!email || typeof email !== 'string') {
      console.error('Invalid email provided to getUserByEmail');
      return null;
    }
    
    // Normalize email to lowercase for consistent searching
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`Searching for user with email: ${normalizedEmail}`);
    
    try {
      // First try exact match
      const snapshot = await usersCollection.where('email', '==', normalizedEmail).limit(1).get();
      if (!snapshot.empty) {
        console.log(`User found with exact email match: ${normalizedEmail}`);
        return docToObject(snapshot.docs[0]);
      }
      
      // If not found, try case-insensitive search (might be necessary if emails were stored with different casing)
      console.log('No exact match found, trying case-insensitive search');
      const allUsersSnapshot = await usersCollection.get();
      for (const doc of allUsersSnapshot.docs) {
        const user = doc.data();
        if (user.email && user.email.toLowerCase() === normalizedEmail) {
          console.log(`User found with case-insensitive email match: ${user.email}`);
          return docToObject(doc);
        }
      }
      
      console.log(`No user found with email: ${normalizedEmail}`);
      return null;
    } catch (error) {
      console.error(`Error searching for user by email ${normalizedEmail}:`, error);
      throw error;
    }
  }
  
  // Update user
  static async updateUser(userId, userData) {
    const { usersCollection } = this.getCollections();
    const updates = {
      ...userData,
      updatedAt: new Date().toISOString()
    };
    
    try {
      await usersCollection.doc(userId).update(updates);
      
      const updatedUser = await usersCollection.doc(userId).get();
      return docToObject(updatedUser);
    } catch (error) {
      console.error(`Error updating user ${userId}:`, error);
      throw error;
    }
  }
  
  // Format an email address to a pending user ID
  static formatPendingUserId(email) {
    if (!email) return null;
    
    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();
    
    // Split email into username and domain parts
    const [username, domain] = normalizedEmail.split('@');
    if (!username || !domain) return null;
    
    // Replace dots in domain with underscores (e.g., gmail.com -> gmail_com)
    const formattedDomain = domain.replace(/\./g, '_');
    
    // Create pending ID: pending_username_domain_ext
    const pendingId = `pending_${username}_${formattedDomain}`;
    
    return pendingId;
  }
  
  // Search users by email or name (for sharing functionality)
  static async searchUsers(query, currentUserId, limit = 10) {
    const { usersCollection } = this.getCollections();
    query = query.toLowerCase();
    
    // Search by displayName or email containing the query string
    const nameSnapshot = await usersCollection
      .where('displayName', '>=', query)
      .where('displayName', '<=', query + '\uf8ff')
      .limit(limit)
      .get();
      
    const emailSnapshot = await usersCollection
      .where('email', '>=', query)
      .where('email', '<=', query + '\uf8ff')
      .limit(limit)
      .get();
    
    // Combine results and remove duplicates
    const users = [];
    const userIds = new Set();
    
    // Add users from name search
    nameSnapshot.forEach(doc => {
      const user = docToObject(doc);
      if (user.id !== currentUserId && !userIds.has(user.id)) {
        users.push(user);
        userIds.add(user.id);
      }
    });
    
    // Add users from email search
    emailSnapshot.forEach(doc => {
      const user = docToObject(doc);
      if (user.id !== currentUserId && !userIds.has(user.id)) {
        users.push(user);
        userIds.add(user.id);
      }
    });
    
    return users.slice(0, limit);
  }
}

module.exports = User;