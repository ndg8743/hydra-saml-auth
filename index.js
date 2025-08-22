// index.js - SAML with strict SP Entity ID + metadata discovery + RelayState return
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy: SamlStrategy } = require('passport-saml');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const PORT = process.env.PORT || 6969;

// ---------- REQUIRED CONFIG ----------
const BASE_URL = process.env.BASE_URL || 'https://hydra.newpaltz.edu';
const METADATA_URL = process.env.METADATA_URL; // Azure federation metadata URL (with your tenant/appid)
const CALLBACK_PATH = process.env.SAML_CALLBACK_PATH || '/login/callback';
const CALLBACK_URL = process.env.CALLBACK_URL || `${BASE_URL}${CALLBACK_PATH}`;

// *** THIS MUST MATCH AZURE "Identifier (Entity ID)" EXACTLY (scheme + trailing slash) ***
const SAML_SP_ENTITY_ID = process.env.SAML_SP_ENTITY_ID; // e.g. "https://hydra.newpaltz.edu/" OR "urn:hydra.newpaltz.edu"

if (!METADATA_URL) {
  console.error('Missing METADATA_URL (Azure federation metadata URL).');
  process.exit(1);
}
if (!SAML_SP_ENTITY_ID) {
  console.error('Missing SAML_SP_ENTITY_ID. Set it to the exact Azure "Identifier (Entity ID)".');
  process.exit(1);
}

// ---------- Helpers ----------
function sanitizeReturnTo(input) {
  try {
    const u = new URL(input || '/', BASE_URL);
    const base = new URL(BASE_URL);
    if (u.origin === base.origin) return (u.pathname || '/') + (u.search || '') + (u.hash || '');
  } catch (_e) {}
  return '/';
}

async function loadIdPFromMetadata(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Metadata fetch failed: ${resp.status}`);
  const xml = await resp.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const md = parser.parse(xml);

  const ed = md['EntityDescriptor'] || md['md:EntityDescriptor'];
  const idp = ed?.['IDPSSODescriptor'] || ed?.['md:IDPSSODescriptor'];
  if (!idp) throw new Error('Metadata missing IDPSSODescriptor');

  // Pick SAML2 HTTP-Redirect SSO endpoint
  let sso = idp['SingleSignOnService'] || idp['md:SingleSignOnService'];
  sso = Array.isArray(sso) ? sso : [sso];
  const redirect = sso.find(s => (s['@_Binding'] || '').includes('HTTP-Redirect'));
  const entryPoint = (redirect || sso[0])?.['@_Location'];
  if (!entryPoint) throw new Error('Metadata missing SSO Location');

  // Signing certificate
  let kd = idp['KeyDescriptor'] || idp['md:KeyDescriptor'];
  kd = Array.isArray(kd) ? kd : [kd];
  const signing = kd.find(k => !k?.['@_use'] || k['@_use'] === 'signing') || kd[0];
  const ki = signing?.['KeyInfo'] || signing?.['ds:KeyInfo'];
  const x = ki?.['X509Data'] || ki?.['ds:X509Data'];
  const certRaw = x?.['X509Certificate'] || x?.['ds:X509Certificate'];
  const cert = (Array.isArray(certRaw) ? certRaw[0] : certRaw || '').replace(/\s+/g, '');
  if (!cert) throw new Error('Metadata missing IdP X509Certificate');

  // Azure also advertises SLO
  const slo = idp['SingleLogoutService'] || idp['md:SingleLogoutService'];
  const logoutUrl = (Array.isArray(slo) ? slo[0] : slo)?.['@_Location'] || null;

  return { entryPoint, certificate: cert, logoutUrl };
}

// ---------- App + middleware ----------
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((u, d) => d(null, u));

const ensureAuthenticated = (req, res, next) =>
  req.isAuthenticated() ? next() : res.redirect('/login');

// ---------- Boot ----------
(async function start() {
  try {
    const { entryPoint, certificate, logoutUrl } = await loadIdPFromMetadata(METADATA_URL);

    console.log('[SAML] Using:');
    console.log('  SP Entity ID (issuer):', SAML_SP_ENTITY_ID);
    console.log('  ACS (Reply URL):       ', CALLBACK_URL);
    console.log('  IdP SSO entryPoint:    ', entryPoint);
    console.log('  IdP SLO (optional):    ', logoutUrl || '(none)');

    const saml = new SamlStrategy(
      {
        // Your SP coordinates:
        issuer: SAML_SP_ENTITY_ID,               // *** must match Azure "Identifier (Entity ID)" EXACTLY ***
        callbackUrl: CALLBACK_URL,               // must match Azure "Reply URL (ACS)"
        // IdP coordinates from metadata:
        entryPoint,
        cert: certificate,                       // base64 cert (no PEM headers)
        logoutUrl,

        // Compatibility / security:
        identifierFormat: null,                  // let IdP choose NameID format
        validateInResponseTo: true,
        disableRequestedAuthnContext: true,
        acceptedClockSkewMs: 2 * 60 * 1000,
        wantAssertionsSigned: true,
        wantAuthnResponseSigned: true,
        passReqToCallback: true
      },
      (req, profile, done) => {
        try {
          if (process.env.NODE_ENV !== 'production') {
            console.log('Authentication successful. Profile:', JSON.stringify(profile, null, 2));
          }
          const user = {
            id: profile.nameID,
            email: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || profile.email,
            firstName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'],
            lastName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'],
            displayName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || profile.displayName,
            groups: profile['http://schemas.microsoft.com/ws/2008/06/identity/claims/groups'] || [],
            affiliation: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/eduPersonPrimaryAffiliation'] || ''
          };
          if (process.env.NODE_ENV !== 'production') {
            console.log('Extracted user data:', user);
          }
          done(null, user);
        } catch (e) {
          done(e);
        }
      }
    );

    passport.use(saml);

    // ----- routes -----

    // Helpful: publish SP metadata so Azure can import the exact values you’re using
    app.get('/saml/metadata', (_req, res) => {
      res.type('application/xml');
      // If you sign/encrypt, pass SP cert(s) here. For now, minimal metadata:
      res.send(saml.generateServiceProviderMetadata());
    });

    // Start login, capture where to return (RelayState)
    app.get('/login', (req, res, next) => {
      const returnTo = sanitizeReturnTo(req.query.returnTo || req.get('referer') || '/dashboard');
      req.session.returnTo = returnTo;
      passport.authenticate('saml', {
        failureRedirect: '/login-failed',
        additionalParams: { RelayState: returnTo }
      })(req, res, next);
    });

    // Keep RelayState for the redirect
    function captureRelayState(req, _res, next) {
      req._relayState = req.body?.RelayState;
      next();
    }

    app.post(
      CALLBACK_PATH,
      captureRelayState,
      passport.authenticate('saml', { failureRedirect: '/login-failed' }),
      (req, res) => {
        const returnTo = sanitizeReturnTo(req._relayState || req.session.returnTo || '/dashboard');
        delete req.session.returnTo;
        res.redirect(returnTo);
      }
    );

    app.get('/', (req, res) => {
      res.redirect(req.isAuthenticated() ? '/dashboard' : '/login');
    });

    app.get('/dashboard', ensureAuthenticated, (req, res) => {
      res.send(`<pre>Welcome ${req.user.displayName || req.user.email}\n\n${JSON.stringify(req.user, null, 2)}</pre>`);
    });

    app.get('/logout', (req, res, next) => {
      req.logout(err => err ? next(err) : res.redirect('/'));
    });

    app.get('/login-failed', (_req, res) => res.status(401).send('Authentication failed.'));

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on ${PORT}`);
      console.log(`SP metadata: ${BASE_URL}/saml/metadata`);
    });
  } catch (e) {
    console.error('Failed to start server:', e);
    process.exit(1);
  }
})();
