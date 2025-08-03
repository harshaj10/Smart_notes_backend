const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smartnotes',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Database initialization with tables creation
async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(128) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        displayName VARCHAR(100) NOT NULL,
        photoURL VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create notes table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        createdBy VARCHAR(128) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        isArchived BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create note_permissions table for collaborative access
    await connection.query(`
      CREATE TABLE IF NOT EXISTS note_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        noteId VARCHAR(36) NOT NULL,
        userId VARCHAR(128) NOT NULL,
        permission ENUM('read', 'write', 'admin') NOT NULL DEFAULT 'read',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY note_user (noteId, userId)
      )
    `);
    
    // Create note_versions table for version control
    await connection.query(`
      CREATE TABLE IF NOT EXISTS note_versions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        noteId VARCHAR(36) NOT NULL,
        content TEXT,
        title VARCHAR(255) NOT NULL,
        versionNumber INT NOT NULL,
        createdBy VARCHAR(128) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    console.log('Database tables initialized successfully');
    connection.release();
    return true;
  } catch (err) {
    console.error('Database initialization failed:', err);
    return false;
  }
}

module.exports = {
  pool,
  initDatabase
};