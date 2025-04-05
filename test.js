const express = require('express');

// test.js - Simple Hello World Express App

// Initialize Express application
const app = express();
const PORT = 6969;

// Define a route for the root URL
app.get('/', (req, res) => {
  res.send('Hello, World!');
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});