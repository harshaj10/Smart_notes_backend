const { getFirestore, docToObject, snapshotToArray } = require('../config/firestore');
const { v4: uuidv4 } = require('uuid');
const User = require('./User');

class Note {
  static getCollections() {
    const db = getFirestore();
    if (!db) {
      throw new Error('Firestore is not initialized');
    }
    
    return {
      notesCollection: db.collection('notes'),
      permissionsCollection: db.collection('permissions'),
      usersCollection: db.collection('users'),
      versionsCollection: db.collection('noteVersions'),
      db
    };
  }
  
  // Create a new note
  static async createNote(userId, noteData) {
    const { notesCollection } = this.getCollections();
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const note = {
      id,
      title: noteData.title || 'Untitled Note',
      content: noteData.content || '',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      isArchived: false
    };
    
    try {
      await notesCollection.doc(id).set(note);
      console.log(`Note ${id} created successfully by user ${userId}`);
      return note;
    } catch (error) {
      console.error('Error creating note:', error);
      throw error;
    }
  }
  
  // Get note by ID
  static async getNoteById(noteId, userId) {
    const { notesCollection, permissionsCollection } = this.getCollections();
    
    try {
      console.log(`Getting note ${noteId} for user ${userId}`);
      const noteDoc = await notesCollection.doc(noteId).get();
      if (!noteDoc.exists) {
        console.log(`Note ${noteId} not found`);
        return null;
      }
      
      const note = docToObject(noteDoc);
      
      // Check if user is the owner
      if (note.createdBy === userId) {
        console.log(`User ${userId} is the owner of note ${noteId}`);
        return { ...note, permission: 'admin' };
      }
      
      // Check if user has permission
      const permissionDoc = await permissionsCollection.doc(`${noteId}_${userId}`).get();
      if (!permissionDoc.exists) {
        // Also check if there's a pending permission for an email that matches this user
        // This is for handling the case where a note was shared with a user before they registered
        
        try {
          // Get the user's email to check if there's a pending share
          const { usersCollection } = this.getCollections();
          const userDoc = await usersCollection.doc(userId).get();
          
          if (userDoc.exists) {
            const userData = docToObject(userDoc);
            const userEmail = userData.email.toLowerCase();
            
            // Check for pending permissions with the user's email
            console.log(`Checking for pending permissions for ${userEmail}`);
            
            // Use the proper formatting method for the pending ID
            const pendingId = User.formatPendingUserId(userEmail);
            if (pendingId) {
              const pendingPermissionDoc = await permissionsCollection.doc(`${noteId}_${pendingId}`).get();
              
              if (pendingPermissionDoc.exists) {
                console.log(`Found pending permission for ${userEmail}`);
                const pendingPermission = docToObject(pendingPermissionDoc);
                
                // Create a new permission for the actual user
                await permissionsCollection.doc(`${noteId}_${userId}`).set({
                  noteId,
                  userId,
                  permission: pendingPermission.permission,
                  createdAt: new Date().toISOString(),
                  createdBy: pendingPermission.createdBy,
                  migratedFrom: pendingId
                });
                
                console.log(`Migrated permission from ${pendingId} to ${userId}`);
                
                // Return note with the migrated permission
                return { ...note, permission: pendingPermission.permission };
              }
            }
          }
        } catch (err) {
          console.error("Error checking for pending permissions:", err);
          // Continue with normal flow if there was an error
        }
        
        console.log(`User ${userId} does not have permission to access note ${noteId}`);
        return null;
      }
      
      const permission = docToObject(permissionDoc);
      console.log(`User ${userId} has ${permission.permission} permission for note ${noteId}`);
      return { ...note, permission: permission.permission };
    } catch (error) {
      console.error(`Error getting note ${noteId} for user ${userId}:`, error);
      throw error;
    }
  }
  
  // Get all notes for a user (owned and shared)
  static async getAllNotes(userId) {
    const { notesCollection, permissionsCollection, usersCollection } = this.getCollections();
    const result = { own: [], shared: [] };
    
    try {
      console.log(`Getting all notes for user ${userId}`);
      
      // Get notes created by the user
      const ownNotesSnapshot = await notesCollection
        .where('createdBy', '==', userId)
        .where('isArchived', '==', false)
        .get();
      
      result.own = snapshotToArray(ownNotesSnapshot);
      console.log(`Found ${result.own.length} notes owned by user ${userId}`);
      
      // Get notes shared with the user
      const permissionsSnapshot = await permissionsCollection
        .where('userId', '==', userId)
        .get();
      
      const sharedNoteIds = permissionsSnapshot.docs.map(doc => doc.data().noteId);
      console.log(`Found ${sharedNoteIds.length} permissions for user ${userId}`);
      
      // If there are shared notes, retrieve them
      if (sharedNoteIds.length > 0) {
        // Firestore doesn't support 'where in' with more than 10 items
        // So we need to chunk the requests
        const chunkSize = 10;
        const chunks = [];
        
        for (let i = 0; i < sharedNoteIds.length; i += chunkSize) {
          chunks.push(sharedNoteIds.slice(i, i + chunkSize));
        }
        
        // Get all shared notes
        const sharedNotes = [];
        
        for (const chunk of chunks) {
          const notesSnapshot = await notesCollection
            .where('id', 'in', chunk)
            .where('isArchived', '==', false)
            .get();
            
          const notes = snapshotToArray(notesSnapshot);
          sharedNotes.push(...notes);
        }
        
        console.log(`Retrieved ${sharedNotes.length} shared notes for user ${userId}`);
        
        // Add permission info to each shared note
        const sharedNotesWithPermission = await Promise.all(
          sharedNotes.map(async (note) => {
            const permissionDoc = await permissionsCollection.doc(`${note.id}_${userId}`).get();
            const permission = docToObject(permissionDoc);
            
            // Get owner info
            const ownerDoc = await usersCollection.doc(note.createdBy).get();
            const owner = docToObject(ownerDoc);
            
            return { 
              ...note, 
              permission: permission.permission,
              ownerName: owner ? owner.displayName : 'Unknown' 
            };
          })
        );
        
        result.shared = sharedNotesWithPermission;
      }
      
      return result;
    } catch (error) {
      console.error(`Error getting all notes for user ${userId}:`, error);
      throw error;
    }
  }
  
  // Update note
  static async updateNote(noteId, userId, noteData) {
    const { notesCollection } = this.getCollections();
    
    // First check if noteId is 'new' to create a new note
    if (noteId === 'new') {
      console.log(`Creating new note for user ${userId}`);
      return this.createNote(userId, noteData);
    }
    
    // Check if note exists
    const noteDoc = await notesCollection.doc(noteId).get();
    if (!noteDoc.exists) {
      throw new Error('Note not found');
    }
    
    const note = docToObject(noteDoc);
    
    // Check permission
    let hasPermission = note.createdBy === userId;
    
    if (!hasPermission) {
      const { permissionsCollection } = this.getCollections();
      const permissionDoc = await permissionsCollection.doc(`${noteId}_${userId}`).get();
      if (permissionDoc.exists) {
        const permission = permissionDoc.data().permission;
        hasPermission = permission === 'write' || permission === 'admin';
      }
    }
    
    if (!hasPermission) {
      throw new Error('You do not have permission to update this note');
    }
    
    // Create updates object with the current timestamp
    let updates = {
      ...noteData,
      updatedAt: new Date().toISOString()
    };
    
    // Remove any undefined values from the updates object
    // This prevents Firestore errors about undefined not being a valid value
    Object.keys(updates).forEach(key => {
      if (updates[key] === undefined) {
        console.log(`Removing undefined value for field: ${key}`);
        delete updates[key];
      }
    });
    
    // Log the filtered updates
    console.log(`Updating note ${noteId} with fields:`, Object.keys(updates));
    
    // Update the note in Firestore
    await notesCollection.doc(noteId).update(updates);
    console.log(`Note ${noteId} updated by user ${userId}`);
    
    // Save version history
    await this.createNoteVersion(noteId, userId, {
      title: noteData.title || note.title,
      content: noteData.content || note.content
    });
    
    // Get updated note
    const updatedNoteDoc = await notesCollection.doc(noteId).get();
    return docToObject(updatedNoteDoc);
  }
  
  // Archive note (soft delete)
  static async archiveNote(noteId, userId) {
    const { notesCollection } = this.getCollections();
    const noteDoc = await notesCollection.doc(noteId).get();
    if (!noteDoc.exists) throw new Error('Note not found');
    
    const note = docToObject(noteDoc);
    
    // Check permission
    if (note.createdBy !== userId) {
      throw new Error('You do not have permission to delete this note');
    }
    
    await notesCollection.doc(noteId).update({
      isArchived: true,
      updatedAt: new Date().toISOString()
    });
    
    console.log(`Note ${noteId} archived by user ${userId}`);
    return { success: true };
  }
  
  // Permanently delete note
  static async deleteNote(noteId, userId) {
    const { notesCollection, permissionsCollection, db } = this.getCollections();
    const noteDoc = await notesCollection.doc(noteId).get();
    if (!noteDoc.exists) throw new Error('Note not found');
    
    const note = docToObject(noteDoc);
    
    // Check permission
    if (note.createdBy !== userId) {
      throw new Error('You do not have permission to delete this note');
    }
    
    // Get all permissions for this note
    const permissionsSnapshot = await permissionsCollection
      .where('noteId', '==', noteId)
      .get();
    
    // Delete all permissions in a batch
    const batch = db.batch();
    permissionsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Delete the note
    batch.delete(notesCollection.doc(noteId));
    
    // Commit the batch
    await batch.commit();
    console.log(`Note ${noteId} permanently deleted by user ${userId}`);
    
    return { success: true };
  }
  
  // Share note with another user
  static async shareNote(noteId, ownerId, recipientEmail, permission) {
    const { notesCollection, permissionsCollection, usersCollection } = this.getCollections();
    
    // Validate inputs
    if (!recipientEmail || typeof recipientEmail !== 'string') {
      throw new Error('Valid email address is required');
    }
    
    console.log(`Sharing note ${noteId} with ${recipientEmail}, permission: ${permission}, owner: ${ownerId}`);
    
    // Normalize email to lowercase for consistent searching
    const normalizedEmail = recipientEmail.toLowerCase().trim();
    
    // Check if note exists and user is the owner
    const noteDoc = await notesCollection.doc(noteId).get();
    if (!noteDoc.exists) throw new Error('Note not found');
    
    const note = docToObject(noteDoc);
    
    // Check permission (only owner or admin can share)
    let hasPermission = note.createdBy === ownerId;
    
    if (!hasPermission) {
      const permissionDoc = await permissionsCollection.doc(`${noteId}_${ownerId}`).get();
      if (permissionDoc.exists) {
        hasPermission = permissionDoc.data().permission === 'admin';
      }
    }
    
    if (!hasPermission) {
      throw new Error('You do not have permission to share this note');
    }
    
    // Find the recipient user by email using User model
    console.log(`Searching for user with email: ${normalizedEmail}`);
    const recipient = await User.getUserByEmail(normalizedEmail);
    
    if (!recipient) {
      // User doesn't exist yet, create a placeholder user
      console.log(`User with email ${normalizedEmail} not found. Creating placeholder user.`);
      const placeholderId = User.formatPendingUserId(normalizedEmail);
      
      if (!placeholderId) {
        throw new Error('Invalid email format');
      }
      
      try {
        // First check if a placeholder user already exists
        const existingPlaceholder = await User.getUserById(placeholderId);
        
        let placeholderUser;
        if (existingPlaceholder) {
          console.log(`Existing placeholder user found with ID: ${placeholderId}`);
          placeholderUser = existingPlaceholder;
        } else {
          // Create a placeholder user with the User model
          placeholderUser = await User.createUser({
            uid: placeholderId,
            email: normalizedEmail,
            displayName: normalizedEmail.split('@')[0],
            photoURL: null
          });
          console.log(`Created new placeholder user with ID: ${placeholderId}`);
        }
        
        // Don't share with yourself
        if (placeholderUser.id === ownerId) {
          throw new Error('You cannot share a note with yourself');
        }
        
        // Check if permission already exists
        const existingPermission = await permissionsCollection.doc(`${noteId}_${placeholderUser.id}`).get();
        if (existingPermission.exists) {
          // Update existing permission
          await permissionsCollection.doc(`${noteId}_${placeholderUser.id}`).update({
            permission,
            updatedAt: new Date().toISOString()
          });
          console.log(`Updated permission for pending user ${placeholderUser.id} on note ${noteId}`);
        } else {
          // Create new permission
          await permissionsCollection.doc(`${noteId}_${placeholderUser.id}`).set({
            noteId,
            userId: placeholderUser.id,
            permission,
            createdAt: new Date().toISOString(),
            createdBy: ownerId
          });
          console.log(`Created permission for placeholder user ${placeholderUser.id} on note ${noteId}`);
        }
        
        return { success: true, recipient: placeholderUser };
      } catch (error) {
        console.error(`Error creating placeholder user or permission: ${error.message}`);
        throw error;
      }
    }
    
    // Don't share with yourself
    if (recipient.id === ownerId) {
      throw new Error('You cannot share a note with yourself');
    }
    
    // Check if permission already exists
    const existingPermission = await permissionsCollection.doc(`${noteId}_${recipient.id}`).get();
    if (existingPermission.exists) {
      // Update the permission
      await permissionsCollection.doc(`${noteId}_${recipient.id}`).update({
        permission,
        updatedAt: new Date().toISOString()
      });
      console.log(`Updated permission for user ${recipient.id} on note ${noteId} to ${permission}`);
    } else {
      // Create permission
      await permissionsCollection.doc(`${noteId}_${recipient.id}`).set({
        noteId,
        userId: recipient.id,
        permission,
        createdAt: new Date().toISOString(),
        createdBy: ownerId
      });
      console.log(`Created new permission for user ${recipient.id} on note ${noteId}`);
    }
    
    return { success: true, recipient };
  }
  
  // Revoke access to a note
  static async revokeAccess(noteId, ownerId, userId) {
    const { notesCollection, permissionsCollection } = this.getCollections();
    // Check if note exists and user is the owner
    const noteDoc = await notesCollection.doc(noteId).get();
    if (!noteDoc.exists) throw new Error('Note not found');
    
    const note = docToObject(noteDoc);
    
    // Check permission (only owner or admin can revoke access)
    let hasPermission = note.createdBy === ownerId;
    
    if (!hasPermission) {
      const permissionDoc = await permissionsCollection.doc(`${noteId}_${ownerId}`).get();
      if (permissionDoc.exists) {
        hasPermission = permissionDoc.data().permission === 'admin';
      }
    }
    
    if (!hasPermission) {
      throw new Error('You do not have permission to revoke access to this note');
    }
    
    // Check that we're not removing the owner's access
    if (userId === note.createdBy) {
      throw new Error('Cannot remove the owner\'s access to their own note');
    }
    
    // Delete the permission
    await permissionsCollection.doc(`${noteId}_${userId}`).delete();
    console.log(`Revoked access for user ${userId} to note ${noteId}`);
    
    return { success: true };
  }
  
  // Get collaborators for a note
  static async getCollaborators(noteId, userId) {
    const { notesCollection, permissionsCollection, usersCollection } = this.getCollections();
    
    console.log(`Getting collaborators for note ${noteId}, requested by user ${userId}`);
    
    // Special handling for new notes
    if (noteId === 'new') {
      // For a new note, the current user is the only collaborator (owner)
      const userDoc = await usersCollection.doc(userId).get();
      const user = docToObject(userDoc);
      
      if (!user) {
        console.error(`User not found for ID: ${userId}`);
        throw new Error('User not found');
      }
      
      return {
        owner: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          permission: 'admin'
        },
        collaborators: []
      };
    }
    
    // Check if note exists and user has access
    const note = await this.getNoteById(noteId, userId);
    if (!note) {
      console.error(`Note ${noteId} not found or user ${userId} does not have access`);
      throw new Error('Note not found or you do not have access');
    }
    
    // Get the owner info
    const ownerDoc = await usersCollection.doc(note.createdBy).get();
    if (!ownerDoc.exists) {
      // Handle the case where owner document doesn't exist - use User.getUserById which handles pending users
      console.log(`Owner document not found directly for user ID: ${note.createdBy}, trying User.getUserById`);
      const ownerUser = await User.getUserById(note.createdBy);
      
      if (ownerUser) {
        console.log(`Found owner via User.getUserById: ${ownerUser.displayName}`);
        return {
          owner: {
            id: ownerUser.id,
            displayName: ownerUser.displayName,
            email: ownerUser.email,
            photoURL: ownerUser.photoURL,
            permission: 'admin'
          },
          collaborators: await this._getCollaboratorsForNote(noteId, note.createdBy)
        };
      }
      
      // If still no owner found, return a placeholder
      console.error(`Owner document not found for user ID: ${note.createdBy}`);
      
      // Return a placeholder owner with the ID we have
      const placeholderOwner = {
        id: note.createdBy,
        displayName: 'Unknown User',
        email: '',
        photoURL: null,
        permission: 'admin'
      };
      
      return {
        owner: placeholderOwner,
        collaborators: await this._getCollaboratorsForNote(noteId, note.createdBy)
      };
    }
    
    const owner = docToObject(ownerDoc);
    if (!owner) {
      console.error(`Failed to convert owner document to object for user ID: ${note.createdBy}`);
      
      // Return a placeholder owner with the ID we have
      const placeholderOwner = {
        id: note.createdBy,
        displayName: 'Unknown User',
        email: '',
        photoURL: null,
        permission: 'admin'
      };
      
      return {
        owner: placeholderOwner,
        collaborators: await this._getCollaboratorsForNote(noteId, note.createdBy)
      };
    }
    
    const collaborators = await this._getCollaboratorsForNote(noteId, note.createdBy);
    
    return {
      owner: {
        id: owner.id,
        displayName: owner.displayName,
        email: owner.email,
        photoURL: owner.photoURL,
        permission: 'admin'
      },
      collaborators
    };
  }
  
  // Helper method to get collaborators for a note
  static async _getCollaboratorsForNote(noteId, ownerId) {
    const { permissionsCollection, usersCollection } = this.getCollections();
    
    // Get all permissions for this note
    const permissionsSnapshot = await permissionsCollection
      .where('noteId', '==', noteId)
      .get();
    
    console.log(`Found ${permissionsSnapshot.size} permissions for note ${noteId}`);
    
    // Get collaborators with their permissions
    const collaborators = [];
    
    // Use a for loop instead of Promise.all to handle errors individually
    for (const doc of permissionsSnapshot.docs) {
      try {
        const permission = doc.data();
        
        // Skip the owner's permissions
        if (permission.userId === ownerId) {
          continue;
        }
        
        // First try to get user directly from collection
        const userDoc = await usersCollection.doc(permission.userId).get();
        
        if (userDoc.exists) {
          const user = docToObject(userDoc);
          collaborators.push({
            id: user.id,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            permission: permission.permission
          });
          continue;
        }
        
        // If user doc not found directly, try with User.getUserById which handles pending users
        const user = await User.getUserById(permission.userId);
        if (user) {
          collaborators.push({
            id: user.id,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            permission: permission.permission,
            isPending: user.isPending
          });
        } else {
          console.warn(`User document not found for collaborator ID: ${permission.userId}`);
        }
      } catch (error) {
        console.error(`Error processing collaborator: ${error.message}`);
        // Continue with other collaborators instead of failing entirely
        continue;
      }
    }
    
    console.log(`Returning ${collaborators.length} collaborators for note ${noteId}`);
    return collaborators;
  }
  
  // Create note version (for version history)
  static async createNoteVersion(noteId, userId, versionData) {
    const { db } = this.getCollections();
    const versionRef = db.collection('noteVersions').doc();
    
    // Get current version number - modified to avoid requiring a composite index
    try {
      // Try to get all versions for this note (without ordering)
      const versionsSnapshot = await db.collection('noteVersions')
        .where('noteId', '==', noteId)
        .get();
      
      let versionNumber = 1; // Default to 1 if no versions exist
      
      // If we have versions, manually find the highest version number
      if (!versionsSnapshot.empty) {
        const versions = versionsSnapshot.docs.map(doc => doc.data().versionNumber || 0);
        versionNumber = Math.max(...versions) + 1;
      }
      
      // Create new version
      await versionRef.set({
        noteId,
        title: versionData.title,
        content: versionData.content,
        versionNumber,
        createdBy: userId,
        createdAt: new Date().toISOString()
      });
      
      return { success: true, versionNumber };
    } catch (error) {
      console.error(`Error creating version for note ${noteId}:`, error);
      
      // Fallback: If the above fails for any reason, create a version with timestamp as version number
      // This ensures we can still save changes even if version retrieval fails
      const timestamp = Date.now();
      await versionRef.set({
        noteId,
        title: versionData.title,
        content: versionData.content,
        versionNumber: timestamp,
        createdBy: userId,
        createdAt: new Date().toISOString()
      });
      
      return { success: true, versionNumber: timestamp };
    }
  }
  
  // Get version history for a note
  static async getNoteVersions(noteId, userId) {
    const { db, usersCollection } = this.getCollections();
    // Check if user has access to this note
    const note = await this.getNoteById(noteId, userId);
    if (!note) throw new Error('Note not found or you do not have access');
    
    // Get versions
    const versionsSnapshot = await db.collection('noteVersions')
      .where('noteId', '==', noteId)
      .orderBy('versionNumber', 'desc')
      .get();
    
    const versions = [];
    
    for (const doc of versionsSnapshot.docs) {
      const version = doc.data();
      
      // Get creator info
      const userDoc = await usersCollection.doc(version.createdBy).get();
      const user = userDoc.exists ? userDoc.data() : null;
      
      versions.push({
        id: doc.id,
        noteId: version.noteId,
        title: version.title,
        content: version.content,
        versionNumber: version.versionNumber,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
        displayName: user ? user.displayName : 'Unknown'
      });
    }
    
    return versions;
  }
  
  // Get a specific version of a note
  static async getNoteVersion(noteId, userId, versionNumber) {
    const { db, usersCollection } = this.getCollections();
    // Check if user has access to this note
    const note = await this.getNoteById(noteId, userId);
    if (!note) throw new Error('Note not found or you do not have access');
    
    // Get the specific version
    const versionsSnapshot = await db.collection('noteVersions')
      .where('noteId', '==', noteId)
      .where('versionNumber', '==', parseInt(versionNumber))
      .limit(1)
      .get();
    
    if (versionsSnapshot.empty) {
      throw new Error('Version not found');
    }
    
    const version = versionsSnapshot.docs[0].data();
    
    // Get creator info
    const userDoc = await usersCollection.doc(version.createdBy).get();
    const user = userDoc.exists ? userDoc.data() : null;
    
    return {
      id: versionsSnapshot.docs[0].id,
      noteId: version.noteId,
      title: version.title,
      content: version.content,
      versionNumber: version.versionNumber,
      createdBy: version.createdBy,
      createdAt: version.createdAt,
      displayName: user ? user.displayName : 'Unknown'
    };
  }
}

module.exports = Note;