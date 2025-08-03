const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { initFirebase } = require('./config/firebase');

// Load environment variables
dotenv.config();

// Initialize Firebase Admin - MUST BE DONE BEFORE IMPORTING FIRESTORE
const firebaseInitialized = initFirebase();
if (!firebaseInitialized) {
  console.warn('Firebase Admin SDK initialization failed. Authentication and database features may not work.');
  // You might want to exit the process here if Firebase is critical

}

// Import Firestore AFTER Firebase initialization
const { getFirestore } = require('./config/firestore');
const db = getFirestore();

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const authRoutes = require('./routes/auth');
const notesRoutes = require('./routes/notes');
const userRoutes = require('./routes/users');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/users', userRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Smart Notes API is running with Firebase/Firestore' });
});

// Socket.io real-time collaboration
io.on('connection', (socket) => {
  console.log('New client connected', socket.id);
  
  // Join a note editing session
  socket.on('join-note', (noteId) => {
    socket.join(`note-${noteId}`);
    console.log(`Socket ${socket.id} joined note-${noteId}`);
  });
  
  // Handle note updates
  socket.on('note-update', (data) => {
    socket.to(`note-${data.noteId}`).emit('note-updated', data);
  });
  
  // Handle cursor position updates
  socket.on('cursor-move', (data) => {
    socket.to(`note-${data.noteId}`).emit('cursor-moved', {
      userId: data.userId,
      position: data.position
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT} with Firestore database`);
});

module.exports = { app, server, io };