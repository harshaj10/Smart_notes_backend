const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Note = require('../models/Note');

// Get all notes for the authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get all notes (own and shared) using the Note model
    const notes = await Note.getAllNotes(userId);
    
    res.status(200).json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Error fetching notes' });
  }
});

// Create a new note
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, content } = req.body;
    const userId = req.userId;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    // Create a new note using the Note model
    const note = await Note.createNote(userId, { title, content: content || '' });
    
    res.status(201).json({
      ...note,
      message: 'Note created successfully'
    });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Error creating note' });
  }
});

// Get a specific note by ID
router.get('/:noteId', authenticate, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.userId;
    
    // Get note by ID using the Note model
    const note = await Note.getNoteById(noteId, userId);
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found or you do not have access' });
    }
    
    // Get collaborators
    const collaboratorsInfo = await Note.getCollaborators(noteId, userId);
    
    res.status(200).json({
      ...note,
      owner: collaboratorsInfo.owner,
      collaborators: collaboratorsInfo.collaborators
    });
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ error: 'Error fetching note' });
  }
});

// Update a note
router.put('/:noteId', authenticate, async (req, res) => {
  try {
    const { title, content } = req.body;
    const { noteId } = req.params;
    const userId = req.userId;
    
    if (!title && content === undefined) {
      return res.status(400).json({ error: 'No update data provided' });
    }
    
    // Update the note using the Note model
    const updatedNote = await Note.updateNote(noteId, userId, {
      title,
      content
    });
    
    res.status(200).json({
      ...updatedNote,
      message: 'Note updated successfully'
    });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: error.message || 'Error updating note' });
  }
});

// Delete a note (archive it)
router.delete('/:noteId', authenticate, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.userId;
    
    // Archive the note using the Note model
    await Note.archiveNote(noteId, userId);
    
    res.status(200).json({ message: 'Note archived successfully' });
  } catch (error) {
    console.error('Error archiving note:', error);
    res.status(500).json({ error: error.message || 'Error archiving note' });
  }
});

// Permanently delete a note
router.delete('/:noteId/permanent', authenticate, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.userId;
    
    // Permanently delete the note using the Note model
    await Note.deleteNote(noteId, userId);
    
    res.status(200).json({ message: 'Note permanently deleted' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: error.message || 'Error deleting note' });
  }
});

// Share a note with another user
router.post('/:noteId/share', authenticate, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { email, permission } = req.body;
    const userId = req.userId;
    
    if (!email || !['read', 'write', 'admin'].includes(permission)) {
      return res.status(400).json({ error: 'Valid email and permission (read, write, or admin) are required' });
    }
    
    // Share note using the Note model
    const result = await Note.shareNote(noteId, userId, email, permission);
    
    res.status(200).json({
      message: `Note shared with ${email} successfully`,
      recipient: result.recipient
    });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({ error: error.message || 'Error sharing note' });
  }
});

// Revoke access to a note
router.delete('/:noteId/share/:userId', authenticate, async (req, res) => {
  try {
    const { noteId, userId: targetUserId } = req.params;
    const userId = req.userId;
    
    // Revoke access using the Note model
    await Note.revokeAccess(noteId, userId, targetUserId);
    
    res.status(200).json({ message: 'Access revoked successfully' });
  } catch (error) {
    console.error('Error revoking access:', error);
    res.status(500).json({ error: error.message || 'Error revoking access' });
  }
});

// Get note versions
router.get('/:noteId/versions', authenticate, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.userId;
    
    // Get versions using the Note model
    const versions = await Note.getNoteVersions(noteId, userId);
    
    res.status(200).json(versions);
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: error.message || 'Error fetching note versions' });
  }
});

// Get a specific version of a note
router.get('/:noteId/versions/:versionNumber', authenticate, async (req, res) => {
  try {
    const { noteId, versionNumber } = req.params;
    const userId = req.userId;
    
    // Get specific version using the Note model
    const version = await Note.getNoteVersion(noteId, userId, versionNumber);
    
    res.status(200).json(version);
  } catch (error) {
    console.error('Error fetching version:', error);
    res.status(500).json({ error: error.message || 'Error fetching note version' });
  }
});

module.exports = router;