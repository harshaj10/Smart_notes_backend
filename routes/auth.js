const express = require('express');
const router = express.Router();
const { verifyToken } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');

// User registration/profile creation after Firebase authentication
router.post('/register', authenticate, async (req, res) => {
  try {
    const { displayName, photoURL } = req.body;
    const { uid, email } = req.user;
    
    // Create user using the User model
    const user = await User.createUser({
      uid,
      email,
      displayName: displayName || email.split('@')[0],
      photoURL: photoURL || null
    });
    
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Error registering user' });
  }
});

// Get user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get user data using the User model
    const user = await User.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.status(200).json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Error getting user profile' });
  }
});

// Update user profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { displayName, photoURL } = req.body;
    
    // Update user data using the User model
    const updatedUser = await User.updateUser(userId, {
      displayName,
      photoURL
    });
    
    res.status(200).json({ 
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Error updating user profile' });
  }
});

// Verify token validity
router.get('/verify-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    await verifyToken(token);
    
    res.status(200).json({ valid: true });
  } catch (error) {
    res.status(200).json({ valid: false, error: error.message });
  }
});

module.exports = router;