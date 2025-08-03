const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const Note = require('../models/Note');

// Get user by ID (public profile info)
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    
    // Get user data using the User model
    const user = await User.getUserById(targetUserId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return only public fields
    const publicProfile = {
      id: user.id,
      displayName: user.displayName,
      photoURL: user.photoURL
    };
    
    res.status(200).json(publicProfile);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Error getting user information' });
  }
});

// Search users by email or display name
router.get('/', authenticate, async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.userId;
    
    if (!query || query.length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters long' });
    }
    
    // Search users using the User model
    const users = await User.searchUsers(query, userId);
    
    res.status(200).json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Error searching for users' });
  }
});

// Get users who have access to a specific note
router.get('/notes/:noteId/collaborators', authenticate, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.userId;
    
    // Get collaborators using the Note model
    const collaboratorInfo = await Note.getCollaborators(noteId, userId);
    
    res.status(200).json(collaboratorInfo);
  } catch (error) {
    console.error('Get collaborators error:', error);
    res.status(500).json({ error: error.message || 'Error getting collaborators' });
  }
});

module.exports = router;