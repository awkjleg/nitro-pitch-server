// Nitro Pitch accounts: your Firebase web app settings (see README.md).
// These values are not secret: every website using Firebase shows them. The database rules keep each save private.
window.NP_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCYni0K4gjcmcYW6YmRSRM20kHy2AwrHG8",
  authDomain: "nitro-pitch.firebaseapp.com",
  projectId: "nitro-pitch",
  appId: "1:581849800594:web:dc1c92a951b384cd9eab4b"
};

// TURN relay (Metered): lets players whose network blocks direct connections still play online
window.NP_ICE_SERVERS = [
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "turn:global.relay.metered.ca:80", username: "2d6cfa40f34ba6d9beb447ce", credential: "WNaLatZQsY8FrFqI" },
  { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "2d6cfa40f34ba6d9beb447ce", credential: "WNaLatZQsY8FrFqI" },
  { urls: "turn:global.relay.metered.ca:443", username: "2d6cfa40f34ba6d9beb447ce", credential: "WNaLatZQsY8FrFqI" },
  { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "2d6cfa40f34ba6d9beb447ce", credential: "WNaLatZQsY8FrFqI" }
];

// the site owner's account (the admin panel only opens for it; the database rules check the same id)
window.NP_ADMIN_UID = "NarUbbrLmcWC74xWsfH2lzUpDyB3";
