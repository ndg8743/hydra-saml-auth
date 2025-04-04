// index.js - Main application file
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy: SamlStrategy } = require('passport-saml');
const path = require('path');

// Import routes
const webuiApiRoutes = require('./routes/webui-api');

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Configure views and static files
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }  // Set to true in production
}));

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Azure AD certificate extracted from the federationmetadata.xml
const azureCertificate = `-----BEGIN CERTIFICATE-----
MIIEbzCCA1egAwIBAgIUd0s9nVZb2HzqtPRbPZsrZmVdTKMwDQYJKoZIhvcNAQEL
BQAwgd8xCzAJBgNVBAYTAlVTMREwDwYDVQQIDAhOZXcgWW9yazESMBAGA1UEBwwJ
TmV3IFBhbHR6MTIwMAYDVQQKDClTdGF0ZSBVbml2ZXJzaXR5IG9mIE5ldyBZb3Jr
IGF0IE5ldyBQYWx0ejEoMCYGA1UECwwfSW5mb3JtYXRpb24gVGVjaG5vbG9neSBT
ZXJ2aWNlczEkMCIGCSqGSIb3DQEJARYVc3lzYWRtaW5AbmV3cGFsdHouZWR1MSUw
IwYDVQQDDBxBenVyZSBTQU1MIENlcnQgZm9yIGNzLWh5ZHJhMB4XDTI1MDQwMzE3
NTgzNFoXDTM1MDQwMTE3NTgzNFowgd8xCzAJBgNVBAYTAlVTMREwDwYDVQQIDAhO
ZXcgWW9yazESMBAGA1UEBwwJTmV3IFBhbHR6MTIwMAYDVQQKDClTdGF0ZSBVbml2
ZXJzaXR5IG9mIE5ldyBZb3JrIGF0IE5ldyBQYWx0ejEoMCYGA1UECwwfSW5mb3Jt
YXRpb24gVGVjaG5vbG9neSBTZXJ2aWNlczEkMCIGCSqGSIb3DQEJARYVc3lzYWRt
aW5AbmV3cGFsdHouZWR1MSUwIwYDVQQDDBxBenVyZSBTQU1MIENlcnQgZm9yIGNz
LWh5ZHJhMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzuFtMaIHpdtQ
lN1haYWzAV2UjF8euuDDApVUQIrKXi9Ddb6HERq1C1n1AX2fP2YueGY15YUm5PQP
roK+we0ByJZy0P3q7fdLhPUAT0F2BrE/p9fI87189bKE/pmqOwcsL3HJR16QXauV
QgQd5UE5zhAkCZZOeK0lScH+K8b8NXpOxcG6tb8jv4ewIZXJIA5pyDaiyJD+hMc+
vaPUHdEsuYEjs8bsvBi4BYcYKfEQ6A24WVvnfwYCHBiI+oiy36Vf5crujPmRom4g
zidmSFbp9WqmtLJzFI7UBucWCS7cMt8s5ejl1wnTF6u0ltJKI5I1b4LIPSuY9hyF
f8XxmCkQGQIDAQABoyEwHzAdBgNVHQ4EFgQUQ6sY4Nq2LQ+7NyVYwUfDfg7ww2Mw
DQYJKoZIhvcNAQELBQADggEBALrhoIPZ3a9WY6f6pLO3pjdODRT7c2stIvQGm4P5
hlRsSs45w9fBC1D4hCaO0+ntKS84O0BHMDIwAK5l4a1sVP5qgN2Iy9NAouMSp8JD
EDdiyA+Jv9g1ySSPQ9LoDonxs1BUkHqzEWMSP3k59QkLWyuYHckT5DsbUjAsu1+U
9cnxU0TjUUXlbmNuFeULDtYNXCCkp7P/DaW4PEDnvIiXJyG1YwVKb81ZHRZ45jgu
epnMzlj6Qlm4ZgXpMt/Xgu6mEFeQQVvClZKSYqg571dZCUzLxp+ZGhEmUncuznAJ
5ndorurlV5BVJs0jhBwMxmoaG3pUilpXhauTENwqubR8G8o=
-----END CERTIFICATE-----`;

// Configure SAML Strategy
const samlStrategy = new SamlStrategy({
  callbackUrl: 'https://hydra.newpaltz.edu/login/callback',
  entryPoint: 'https://login.microsoftonline.com/ebd45737-b352-4722-bb0c-9f539bcbfa65/saml2',
  issuer: 'hydra.newpaltz.edu',
  identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  cert: azureCertificate,
  validateInResponseTo: true,
  disableRequestedAuthnContext: true
}, (profile, done) => {
  // This is where you would typically look up or create a user in your database
  // For this simple example, we'll just use the profile directly
  console.log('SAML Authentication successful. Profile:', profile);
  return done(null, {
    id: profile.nameID,
    email: profile.email || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'],
    firstName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'],
    lastName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'],
    displayName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || profile.displayName,
    // Include any other attributes you need
  });
});

passport.use(samlStrategy);

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

// Add body parser middleware for POST requests
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Use the WebUI API routes
app.use('/api/webui', webuiApiRoutes);

// Routes
app.get('/', (req, res) => {
  res.redirect(req.isAuthenticated() ? '/dashboard' : '/login');
});

// Login route - initiates SAML authentication
app.get('/login', passport.authenticate('saml', { 
  failureRedirect: '/login-failed', 
  failureFlash: true 
}));

// SAML callback route - processes the SAML response
app.post('/login/callback', passport.authenticate('saml', { 
  failureRedirect: '/login-failed', 
  failureFlash: true 
}), (req, res) => {
  console.log('Authentication successful, redirecting to dashboard');
  res.redirect('/dashboard');
});

// Dashboard route - requires authentication
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.render('dashboard', { user: req.user });
});

// Logout route
app.get('/logout', (req, res) => {
  // Perform SAML Single Logout if necessary
  req.logout(function(err) {
    if (err) { 
      console.error('Error during logout:', err);
      return next(err); 
    }
    res.redirect('/');
  });
});

// Login failure route
app.get('/login-failed', (req, res) => {
  res.render('login-failed');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Application error:', err);
  res.status(500).render('error', { error: err });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});