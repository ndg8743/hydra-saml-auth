// routes/webui-api.js with improved SQL sanitization

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Helper function to properly escape strings for SQLite
function sqliteEscape(str) {
  // SQLite uses single quotes for string literals
  // To escape a single quote in SQLite, you use two single quotes
  return str//.replace(/'/g, "''");
}

// Helper function to run SQLite commands via the shell script
async function runSqliteCommand(command) {
  try {
    // Wrap the entire command in double quotes for the shell
    // Escape any embedded double quotes
    const escapedCommand = command.replace(/"/g, '\\"');
    console.log("Executing SQLite command:", command);
    
    const { stdout, stderr } = await execPromise(
      `sudo /usr/local/bin/webui-db-query.sh '${command}'`
    );
    
    
    if (stderr) {
      console.error('SQLite Error:', stderr);
      throw new Error(stderr);
    }
    
    return stdout.trim();
  } catch (error) {
    console.error('Error executing SQLite command:', error);
    throw error;
  }
}

// Async function to hash passwords properly with bcrypt
async function hashPassword(password) {
  const saltRounds = 12;
  const hash = await bcrypt.hash(password, saltRounds);
  console.log("Generated bcrypt hash:", hash);
  return hash;
}

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ success: false, message: 'Not authenticated' });
}

// Check if user exists in OpenWebUI
router.post('/check-user', ensureAuthenticated, async (req, res) => {
  try {
    const { email } = req.body;
    
    // Properly escape the email for SQLite
    const safeEmail = sqliteEscape(email);
    
    // Query to check if user exists
    const userQuery = `SELECT id, name, email, role FROM user WHERE email="${safeEmail}";`;
    const result = await runSqliteCommand(userQuery);
    
    if (result) {
      // Parse the result (format: id|name|email|role)
      const [id, name, userEmail, role] = result.split('|');
      
      res.json({
        exists: true,
        id,
        username: name,
        email: userEmail,
        role
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
  }
});

// Create a new OpenWebUI account
router.post('/create-account', ensureAuthenticated, async (req, res) => {
  try {
    const { email, name, password } = req.body;
    
    // Properly escape strings for SQLite
    const safeEmail = sqliteEscape(email);
    const safeName = sqliteEscape(name);
    
    // Check if user already exists
    const checkUserQuery = `SELECT id FROM user WHERE email="${safeEmail}";`;
    const existingUser = await runSqliteCommand(checkUserQuery);
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Generate a unique ID for the user
    const userId = crypto.randomUUID();
    
    // Hash the password
    const hashedPassword = await hashPassword(password);
    const safeHashedPassword = hashedPassword.replace(/\$/g, '\\$');
    
    // Get current timestamp in seconds
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Insert new user
    const createUserQuery = `
      INSERT INTO user (
        id, name, email, role, profile_image_url, created_at, updated_at, last_active_at
      ) VALUES (
        "${userId}", "${safeName}", "${safeEmail}", "user", "https://upload.wikimedia.org/wikipedia/en/7/73/Trollface.png", ${timestamp}, ${timestamp}, ${timestamp}
      );
    `;
    
    await runSqliteCommand(createUserQuery);
    
    // Insert auth record
    const createAuthQuery = `
      INSERT INTO auth (id, email, password, active) 
      VALUES ("${userId}", "${safeEmail}", "${safeHashedPassword}", 1);
    `;
    
    await runSqliteCommand(createAuthQuery);
    
    res.json({
      success: true,
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating account'
    });
  }
});

// Change password for an existing account
router.post('/change-password', ensureAuthenticated, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Properly escape the email for SQLite
    const safeEmail = sqliteEscape(email);
    
    // Check if user exists
    const checkUserQuery = `SELECT id FROM user WHERE email="${safeEmail}";`;
    const userId = await runSqliteCommand(checkUserQuery);
    
    if (!userId) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Hash the new password
    const hashedPassword = await hashPassword(password);
    const safeHashedPassword = hashedPassword
    .replace(/\$/g, '\\$'); // Escape dollar signs
    console.log("Hashed password for update:", safeHashedPassword);
    
    // Update password
    const updatePasswordQuery = `
      UPDATE auth SET password="${safeHashedPassword}" WHERE email="${safeEmail}";
    `;
    
    await runSqliteCommand(updatePasswordQuery);
    
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
  }
});

module.exports = router;