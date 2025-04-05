// routes/webui-api.js with direct SQLite access
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { getDb } = require('../db');

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ success: false, message: 'Not authenticated' });
}

// Helper function to hash passwords properly with bcrypt
async function hashPassword(password) {
  const saltRounds = 12;
  const hash = await bcrypt.hash(password, saltRounds);
  console.log("Generated bcrypt hash:", hash);
  return hash;
}

// Check if user exists in OpenWebUI
router.post('/check-user', ensureAuthenticated, async (req, res) => {
  const db = await getDb();
  try {
    const { email } = req.body;
    
    // Use prepared statements for security
    const user = await db.get('SELECT id, name, email, role FROM user WHERE email = ?', [email]);
    
    if (user) {
      res.json({
        exists: true,
        id: user.id,
        username: user.name,
        email: user.email,
        role: user.role
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking user status' 
    });
  } finally {
    // Close the database connection
    await db.close();
  }
});

// Create a new OpenWebUI account
router.post('/create-account', ensureAuthenticated, async (req, res) => {
  const db = await getDb();
  try {
    const { email, name, password } = req.body;
    
    // Start a transaction
    await db.run('BEGIN TRANSACTION');
    
    // Check if user already exists
    const existingUser = await db.get('SELECT id FROM user WHERE email = ?', [email]);
    
    if (existingUser) {
      await db.run('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Generate a unique ID for the user
    const userId = crypto.randomUUID();
    
    // Hash the password
    const hashedPassword = await hashPassword(password);
    
    // Get current timestamp in seconds
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Insert new user
    await db.run(
      `INSERT INTO user (
        id, name, email, role, profile_image_url, created_at, updated_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        name, 
        email, 
        'user', 
        'https://hydra.newpaltz.edu/SUNYCAT.png', 
        timestamp, 
        timestamp, 
        timestamp
      ]
    );
    
    // Insert auth record
    await db.run(
      `INSERT INTO auth (id, email, password, active) VALUES (?, ?, ?, ?)`,
      [userId, email, hashedPassword, 1]
    );
    
    // Commit the transaction
    await db.run('COMMIT');
    
    res.json({
      success: true,
      message: 'Account created successfully'
    });
  } catch (error) {
    // Rollback on error
    await db.run('ROLLBACK');
    console.error('Error creating account:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating account'
    });
  } finally {
    // Close the database connection
    await db.close();
  }
});

// Change password for an existing account
router.post('/change-password', ensureAuthenticated, async (req, res) => {
  const db = await getDb();
  try {
    const { email, password } = req.body;
    
    // Check if user exists
    const user = await db.get('SELECT id FROM user WHERE email = ?', [email]);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Hash the new password
    const hashedPassword = await hashPassword(password);
    
    // Update password
    await db.run(
      'UPDATE auth SET password = ? WHERE email = ?',
      [hashedPassword, email]
    );
    
    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating password'
    });
  } finally {
    // Close the database connection
    await db.close();
  }
});

module.exports = router;