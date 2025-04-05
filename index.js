// index.js - Main application file with improved SAML configuration
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy: SamlStrategy } = require('passport-saml');
const path = require('path');
const fs = require('fs');
const { fetchAndProcessMetadata } = require('./fetch-metadata');

// Import routes
const webuiApiRoutes = require('./routes/webui-api');

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 6969;

// Configure views and static files
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: 'your-secret-key-change-this-in-production', // TODO: Change this to a secure key in production
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }  // Set to true in production
}));

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Add body parser middleware for POST requests
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Use the WebUI API routes
app.use('/api/webui', webuiApiRoutes);

// Serialize/Deserialize user for session management
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Middleware to check if user is authenticated
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
};

// Fallback routes for initial app load before metadata is fetched
app.get('/', (req, res) => {
  res.redirect(req.isAuthenticated() ? '/dashboard' : '/login');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Application error:', err);
  res.status(500).render('error', { error: err });
});

// Prepare to start the server
async function startServer() {
  try {
    console.log('Starting server initialization...');
    
    // Federation metadata URL
    const metadataUrl = 'https://login.microsoftonline.com/ebd45737-b352-4722-bb0c-9f539bcbfa65/federationmetadata/2007-06/federationmetadata.xml?appid=7472c01c-ce87-4425-9923-f1048e4aa5eb';
    
    // Fetch and process the metadata
    const samlConfig = await fetchAndProcessMetadata(metadataUrl);
    
    console.log('Successfully processed SAML metadata', samlConfig);
    
    // Configure SAML Strategy with the fetched data
    const samlStrategy = new SamlStrategy({
      // Essential settings
      callbackUrl: 'https://hydra.newpaltz.edu/login/callback',
      entryPoint: samlConfig.entryPoint,
      issuer: 'hydra.newpaltz.edu', // This should match the application ID in Azure AD
      identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent', // Changed from emailAddress
      cert: samlConfig.certificate,
      
      // Additional settings that can help
      validateInResponseTo: true,
      disableRequestedAuthnContext: true,
      acceptedClockSkewMs: 300000, // 5 minutes to handle clock differences
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      
      // Better error handling
      passReqToCallback: true,
      
      // Logging and debugging
      logoutUrl: samlConfig.logoutUrl || null
    }, (req, profile, done) => {
      // Log the entire profile for debugging
      console.log('SAML Authentication successful. Profile:', JSON.stringify(profile, null, 2));
      
      // Extract user data with proper error handling
      try {
        const user = {
          id: profile.nameID,
          email: profile.email || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'],
          firstName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'],
          lastName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'],
          displayName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || profile.displayName,
        };
        
        console.log('Extracted user data:', user);
        return done(null, user);
      } catch (error) {
        console.error('Error processing user profile:', error);
        return done(error);
      }
    });

    passport.use(samlStrategy);

    // Login route - initiates SAML authentication with proper error handling
    app.get('/login', (req, res, next) => {
      passport.authenticate('saml', { 
        failureRedirect: '/login-failed', 
        failureFlash: true
      })(req, res, next);
    });

    // SAML callback route - processes the SAML response with better error logging
    app.post('/login/callback', (req, res, next) => {
      passport.authenticate('saml', { 
        failureRedirect: '/login-failed', 
        failureFlash: true 
      })(req, res, next);
    }, (req, res) => {
      console.log('Authentication successful, redirecting to dashboard');
      res.redirect('/dashboard');
    });

    // Dashboard route - requires authentication
    app.get('/dashboard', ensureAuthenticated, (req, res) => {
      res.render('dashboard', { user: req.user });
    });

    // Logout route
    app.get('/logout', (req, res, next) => {
      // Perform SAML Single Logout if necessary
      req.logout(function(err) {
        if (err) { 
          console.error('Error during logout:', err);
          return next(err); 
        }
        res.redirect('/');
      });
    });

    // Login failure route with more detailed error information
    app.get('/login-failed', (req, res) => {
      // If there's a flash message, use it
      const errorMessage = req.flash ? req.flash('error') : 'Authentication failed';
      console.error('Login failed:', errorMessage);
      res.render('login-failed', { errorMessage });
    });

    // Start the server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();