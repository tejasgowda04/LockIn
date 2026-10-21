/**
 * ====================================================================
 * LockIn – Cloud Configuration (Firebase Auth + Supabase PostgreSQL)
 * ====================================================================
 * You can either:
 * 1. Paste your credentials directly below, OR
 * 2. Paste them inside the app via Settings -> Cloud Sync.
 * ====================================================================
 */

var LOCKIN_CONFIG = {
  // --- 1. Firebase Authentication Config (Free Tier) ---
  // Get from: Firebase Console -> Project Settings -> General -> Your Apps -> Web SDK configuration
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
  },

  // --- 2. Supabase PostgreSQL & Storage Config (Free Tier) ---
  // Get from: Supabase Dashboard -> Project Settings -> API (Project URL & anon public key)
  supabase: {
    url: "",
    anonKey: "",
  },
};

// Check for user-saved overrides in localStorage
(function () {
  try {
    var savedFirebase = localStorage.getItem("lockin_firebase_cfg");
    if (savedFirebase) {
      var parsedFb = JSON.parse(savedFirebase);
      if (parsedFb && parsedFb.apiKey) {
        LOCKIN_CONFIG.firebase = Object.assign(
          {},
          LOCKIN_CONFIG.firebase,
          parsedFb,
        );
      }
    }

    var savedSupabase = localStorage.getItem("lockin_supabase_cfg");
    if (savedSupabase) {
      var parsedSb = JSON.parse(savedSupabase);
      if (parsedSb && parsedSb.url) {
        LOCKIN_CONFIG.supabase = Object.assign(
          {},
          LOCKIN_CONFIG.supabase,
          parsedSb,
        );
      }
    }
  } catch (e) {
    console.warn("Could not load local cloud config", e);
  }
})();

function isFirebaseConfigured() {
  return Boolean(
    LOCKIN_CONFIG.firebase &&
    LOCKIN_CONFIG.firebase.apiKey &&
    LOCKIN_CONFIG.firebase.apiKey !== "YOUR_FIREBASE_API_KEY",
  );
}

function isSupabaseConfigured() {
  return Boolean(
    LOCKIN_CONFIG.supabase &&
    LOCKIN_CONFIG.supabase.url &&
    LOCKIN_CONFIG.supabase.url !== "YOUR_SUPABASE_PROJECT_URL" &&
    LOCKIN_CONFIG.supabase.anonKey,
  );
}
