/**
 * ====================================================================
 * LockIn – Firebase Authentication Controller
 * ====================================================================
 * Handles Google OAuth, Email/Password sign up & sign in, session
 * persistence, and user profile management.
 * ====================================================================
 */

var LockinAuth = (function () {
  var _currentUser = null;
  var _initialized = false;
  var _authInstance = null;

  function init() {
    if (_initialized) return;
    if (typeof firebase === "undefined" || !isFirebaseConfigured()) {
      console.log("LockIn: Firebase not configured. Running in Local Mode.");
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(LOCKIN_CONFIG.firebase);
      }
      _authInstance = firebase.auth();
      _initialized = true;

      _authInstance.onAuthStateChanged(function (user) {
        _currentUser = user;
        updateUserUI();

        if (user) {
          console.log("LockIn: Signed in as", user.email, user.uid);
          // Sync with Supabase
          if (typeof LockinSync !== "undefined" && isSupabaseConfigured()) {
            LockinSync.loadUserData(user.uid).then(function (hasData) {
              // If cloud is empty but local has trades, ask if user wants to sync them
              if (!hasData && S && S.trades && S.trades.length > 0) {
                checkLocalDataMigration(user);
              }
            });
          }
        } else {
          console.log("LockIn: No user signed in (Local/Guest mode).");
        }
      });
    } catch (err) {
      console.error("LockIn Auth initialization failed:", err);
    }
  }

  function getCurrentUser() {
    return _currentUser;
  }

  function updateUserUI() {
    var avBtn = document.querySelector("#av");
    if (!avBtn) return;

    if (_currentUser) {
      if (_currentUser.photoURL) {
        avBtn.innerHTML =
          '<img src="' +
          _currentUser.photoURL +
          '" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
      } else {
        var name = _currentUser.displayName || _currentUser.email || "Trader";
        avBtn.textContent = name.charAt(0).toUpperCase();
      }
      avBtn.title = _currentUser.displayName || _currentUser.email || "My Account";
    } else {
      avBtn.textContent =
        S && S.profile && S.profile.name
          ? S.profile.name.charAt(0).toUpperCase()
          : "T";
      avBtn.title = "Profile & Account";
    }
  }

  function checkLocalDataMigration(user) {
    var count = S.trades.length;
    var html =
      "<h2>Sync Local Trades to Cloud? ☁️</h2>" +
      '<p class="mut" style="margin:10px 0 16px;">We found <b>' +
      count +
      "</b> trades stored on this device. Would you like to upload them to your new <b>" +
      esc(user.email || "cloud") +
      "</b> account?</p>" +
      '<div style="display:flex;gap:10px;">' +
      '<button class="pri" style="flex:1" onclick="LockinSync.saveUserData(true);closeM();toast(\'Trades synced to cloud!\')">Upload My Trades</button>' +
      '<button class="ghost" style="flex:1" onclick="closeM()">Keep Separate</button>' +
      "</div>";
    modal(html);
  }

  function signInWithGoogle() {
    if (!_authInstance) {
      toast("Firebase keys need to be added to js/config.js first.");
      return Promise.reject("Firebase not configured");
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    return _authInstance.signInWithPopup(provider).catch(function (error) {
      toast(error.message || "Google sign in failed");
      throw error;
    });
  }

  function signInWithEmail(email, password) {
    if (!_authInstance) {
      toast("Firebase keys need to be added to js/config.js first.");
      return Promise.reject("Firebase not configured");
    }
    return _authInstance
      .signInWithEmailAndPassword(email, password)
      .catch(function (error) {
        toast(error.message || "Sign in failed");
        throw error;
      });
  }

  function signUpWithEmail(email, password, displayName) {
    if (!_authInstance) {
      toast("Firebase keys need to be added to js/config.js first.");
      return Promise.reject("Firebase not configured");
    }
    return _authInstance
      .createUserWithEmailAndPassword(email, password)
      .then(function (result) {
        if (displayName && result.user) {
          return result.user.updateProfile({ displayName: displayName });
        }
      })
      .catch(function (error) {
        toast(error.message || "Registration failed");
        throw error;
      });
  }

  function signOut() {
    if (!_authInstance) return Promise.resolve();
    return _authInstance.signOut().then(function () {
      _currentUser = null;
      updateUserUI();
      toast("Signed out successfully");
      render();
    });
  }

  function showAuthModal() {
    if (!isFirebaseConfigured()) {
      toast("Please add your Firebase keys to js/config.js to enable cloud login.");
      return;
    }

    var isUserLoggedIn = Boolean(_currentUser);

    if (isUserLoggedIn) {
      var email = _currentUser.email || "Anonymous";
      var name = _currentUser.displayName || "Trader";
      var html =
        "<h2>My Cloud Account 🔐</h2>" +
        '<div class="card" style="margin:16px 0;display:flex;gap:14px;align-items:center;">' +
        '<div class="av" style="width:48px;height:48px;font-size:20px;">' +
        (_currentUser.photoURL
          ? '<img src="' +
            _currentUser.photoURL +
            '" style="width:100%;height:100%;border-radius:50%;">'
          : name.charAt(0).toUpperCase()) +
        "</div>" +
        "<div>" +
        "<b>" +
        esc(name) +
        "</b>" +
        '<small class="mut" style="display:block;">' +
        esc(email) +
        "</small>" +
        '<span class="badge b-fd" style="margin-top:4px;">Cloud Synced</span>' +
        "</div>" +
        "</div>" +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<button class="pri" onclick="LockinSync.saveUserData(true);toast(\'Data synced to Supabase!\');">Sync Now to Supabase</button>' +
        '<button class="ghost" style="color:var(--dn);border-color:rgba(239,68,68,0.3);" onclick="LockinAuth.signOut();closeM();">Sign Out</button>' +
        "</div>";
      modal(html);
      return;
    }

    // Login / Sign Up Form
    var authHtml =
      "<h2>Sign in to LockIn 🔒</h2>" +
      '<p class="mut" style="margin:4px 0 16px;">Sync your trading journal & chart screenshots across all devices.</p>' +
      '<button class="pri" style="width:100%;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:10px;" onclick="LockinAuth.signInWithGoogle().then(function(){closeM();toast(\'Welcome!\');})">' +
      '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M21.35 11.1h-9.17v2.98h5.27c-.23 1.25-.94 2.31-2 3.02v2.51h3.24c1.9-1.75 2.99-4.32 2.99-7.41 0-.74-.06-1.45-.19-2.1z"/><path fill="#fff" d="M12.18 21.43c2.72 0 5-1.12 6.67-3.03l-3.24-2.51c-.9.6-2.06.96-3.43.96-2.63 0-4.86-1.77-5.66-4.16h-3.35v2.6c1.66 3.28 5.07 5.14 8.01 5.14z"/><path fill="#fff" d="M6.52 12.69c-.21-.6-.32-1.25-.32-1.92s.11-1.32.32-1.92v-2.6h-3.35c-.68 1.36-1.07 2.9-1.07 4.52s.39 3.16 1.07 4.52l3.35-2.6z"/><path fill="#fff" d="M12.18 4.09c1.48 0 2.81.51 3.86 1.51l2.89-2.89c-1.75-1.63-4.04-2.63-6.75-2.63-2.94 0-6.35 1.86-8.01 5.14l3.35 2.6c.8-2.39 3.03-4.16 5.66-4.16z"/></svg>' +
      "Continue with Google" +
      "</button>" +
      '<div style="text-align:center;color:var(--mut);font-size:12px;margin-bottom:14px;position:relative;">' +
      '<span style="background:var(--sheet);padding:0 8px;position:relative;z-index:1;">OR USE EMAIL</span>' +
      '<div style="position:absolute;top:50%;left:0;right:0;height:1px;background:var(--line);z-index:0;"></div>' +
      "</div>" +
      '<div id="authTabs" class="seg" style="display:flex;gap:6px;margin-bottom:12px;">' +
      '<button class="on" style="flex:1;" onclick="LockinAuth.switchAuthTab(\'login\')">Login</button>' +
      '<button style="flex:1;" onclick="LockinAuth.switchAuthTab(\'signup\')">Register</button>' +
      "</div>" +
      '<div id="authFormBody">' +
      "<label>Email Address</label>" +
      '<input id="authEmail" type="email" placeholder="trader@example.com" autocomplete="email">' +
      '<div id="authNameGroup" style="display:none;">' +
      "<label>Your Name / Handle</label>" +
      '<input id="authName" type="text" placeholder="e.g. Alex" autocomplete="name">' +
      "</div>" +
      "<label>Password</label>" +
      '<input id="authPass" type="password" placeholder="••••••••" autocomplete="current-password">' +
      '<button id="authSubmitBtn" class="pri" style="width:100%;margin-top:14px;" onclick="LockinAuth.handleAuthSubmit()">Sign In</button>' +
      "</div>" +
      '<div style="margin-top:12px;text-align:center;">' +
      '<button class="ghost" style="font-size:13px;border:none;color:var(--mut);" onclick="closeM()">Continue Offline / Guest Mode</button>' +
      "</div>";

    modal(authHtml);
  }

  var _authMode = "login";
  function switchAuthTab(mode) {
    _authMode = mode;
    var tabs = document.querySelectorAll("#authTabs button");
    if (tabs.length === 2) {
      tabs[0].className = mode === "login" ? "on" : "";
      tabs[1].className = mode === "signup" ? "on" : "";
    }
    var nameGroup = document.querySelector("#authNameGroup");
    var submitBtn = document.querySelector("#authSubmitBtn");
    if (nameGroup) nameGroup.style.display = mode === "signup" ? "block" : "none";
    if (submitBtn)
      submitBtn.textContent = mode === "signup" ? "Create Free Account" : "Sign In";
  }

  function handleAuthSubmit() {
    var email = document.querySelector("#authEmail").value.trim();
    var pass = document.querySelector("#authPass").value;
    var name = document.querySelector("#authName")
      ? document.querySelector("#authName").value.trim()
      : "";

    if (!email || !pass) {
      toast("Please fill in email and password");
      return;
    }

    if (_authMode === "signup") {
      signUpWithEmail(email, pass, name).then(function () {
        closeM();
        toast("Account created successfully! Welcome to LockIn.");
      });
    } else {
      signInWithEmail(email, pass).then(function () {
        closeM();
        toast("Welcome back!");
      });
    }
  }

  return {
    init: init,
    getCurrentUser: getCurrentUser,
    signInWithGoogle: signInWithGoogle,
    signInWithEmail: signInWithEmail,
    signUpWithEmail: signUpWithEmail,
    signOut: signOut,
    showAuthModal: showAuthModal,
    switchAuthTab: switchAuthTab,
    handleAuthSubmit: handleAuthSubmit,
  };
})();
