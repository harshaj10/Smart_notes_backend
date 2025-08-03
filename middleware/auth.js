const { verifyToken } = require('../config/firebase');
const Note = require('../models/Note');
const User = require('../models/User');

// Middleware to check if the user is authenticated
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const decodedToken = await verifyToken(token);
    
    // Set user ID in request object for use in controllers
    req.userId = decodedToken.uid;
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    };
    
    // Auto-register the user if they don't exist in our database
    try {
      const existingUser = await User.getUserById(decodedToken.uid);
      
      if (!existingUser) {
        console.log(`Auto-registering user ${decodedToken.uid} with email ${decodedToken.email}`);
        await User.createUser({
          uid: decodedToken.uid,
          email: decodedToken.email,
          displayName: decodedToken.name || decodedToken.email.split('@')[0],
          photoURL: decodedToken.picture || null
        });
      }
    } catch (error) {
      console.error('Error auto-registering user:', error);
      // Continue anyway - we don't want to block the request if auto-registration fails
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }
};

module.exports = {
  authenticate
};