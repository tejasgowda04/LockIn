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
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  // --- 2. Supabase PostgreSQL & Storage Config (Free Tier) ---
  // Get from: Supabase Dashboard -> Project Settings -> API (Project URL & anon public key)
  supabase: {
    url: "",
    anonKey: ""
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
