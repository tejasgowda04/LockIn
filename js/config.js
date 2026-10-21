/**
 * ====================================================================
 * LockIn – Cloud Configuration (Firebase Auth + Supabase PostgreSQL)
 * ====================================================================
 * Enter your Firebase and Supabase API credentials directly below.
 * Once added, all users / friends will automatically use cloud sync!
 * ====================================================================
 */

var LOCKIN_CONFIG = {
  // --- 1. Firebase Authentication Config (Free Tier) ---
  // Get from: Firebase Console -> Project Settings -> General -> Your Apps (Web </>)
  firebase: {
    apiKey: "AIzaSyDuuU1tc1mUE6vYf7xkKYw6PrxEZ0sFoyg",
    authDomain: "lockin-dba7f.firebaseapp.com",
    projectId: "lockin-dba7f",
    storageBucket: "lockin-dba7f.firebasestorage.app",
    messagingSenderId: "583892921334",
    appId: "1:583892921334:web:e072c5a1690aa4fa2fb5d7",
    measurementId: "G-LSFD8XYY2P"
  },

  // --- 2. Supabase PostgreSQL & Storage Config (Free Tier) ---
  // Get from: Supabase Dashboard -> Project Settings -> API (Project URL & anon public key)
  supabase: {
    url: "https://nuyfeyjfmuvlshntkqjw.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51eWZleWpmbXV2bHNobnRrcWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MDgyNjYsImV4cCI6MjEwODE4NDI2Nn0.X1-OfcMhlFScXN53cP23MibFJ7Q78wwfjLDsTJrO2WQ"
  }
};

function isFirebaseConfigured() {
  return Boolean(
    LOCKIN_CONFIG.firebase &&
    LOCKIN_CONFIG.firebase.apiKey &&
    LOCKIN_CONFIG.firebase.apiKey.trim() !== ""
  );
}

function isSupabaseConfigured() {
  return Boolean(
    LOCKIN_CONFIG.supabase &&
    LOCKIN_CONFIG.supabase.url &&
    LOCKIN_CONFIG.supabase.url.trim() !== "" &&
    LOCKIN_CONFIG.supabase.anonKey &&
    LOCKIN_CONFIG.supabase.anonKey.trim() !== ""
  );
}
