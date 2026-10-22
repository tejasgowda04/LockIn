/**
 * ====================================================================
 * LockIn – Authentication & Onboarding Controller
 * ====================================================================
 * Handles:
 * - Cinematic Name Reveal Splash Animation controller
 * - Authentication Screen UI & State Machine (from auth.html reference)
 * - Firebase Google OAuth & Email/Password Sign Up & Sign In
 * - Post-Registration Profile Onboarding Workflow
 * - Supabase PostgreSQL Cloud Sync Session Handshake
 * ====================================================================
 */

var LockinAuth = (function () {
  var _currentUser = null;
  var _initialized = false;
  var _authInstance = null;
  var _initialAuthResolved = false;
  var _initialAuthCallback = null;
  var _splashDismissed = false;

  var _authReadyPromise = new Promise(function (resolve) {
    _initialAuthCallback = resolve;
  });

  function init() {
    if (_initialized) return;

    // Check if Firebase is available and configured
    if (typeof firebase === "undefined" || !isFirebaseConfigured()) {
      console.log("LockIn: Firebase not configured or offline mode.");
      _initialAuthResolved = true;
      if (_initialAuthCallback) _initialAuthCallback(null);
      initSplashAndAuth();
      initAuthUI();
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
              if (!hasData && typeof S !== "undefined" && S.trades && S.trades.length > 0) {
                checkLocalDataMigration(user);
              }
            });
          }
        } else {
          console.log("LockIn: No user signed in (Local/Guest mode).");
        }

        if (!_initialAuthResolved) {
          _initialAuthResolved = true;
          if (_initialAuthCallback) _initialAuthCallback(user);
        }
      });

      initSplashAndAuth();
      initAuthUI();
    } catch (err) {
      console.error("LockIn Auth initialization failed:", err);
      _initialAuthResolved = true;
      if (_initialAuthCallback) _initialAuthCallback(null);
      initSplashAndAuth();
      initAuthUI();
    }
  }

  function waitForInitialAuth() {
    return _authReadyPromise;
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
        var name = _currentUser.displayName || _currentUser.email || (typeof S !== "undefined" && S.profile && S.profile.name) || "Trader";
        avBtn.textContent = name.charAt(0).toUpperCase();
      }
      avBtn.title = _currentUser.displayName || _currentUser.email || "My Account";
    } else {
      avBtn.textContent =
        typeof S !== "undefined" && S.profile && S.profile.name
          ? S.profile.name.charAt(0).toUpperCase()
          : "T";
      avBtn.title = "Profile & Account";
    }
  }

  function checkLocalDataMigration(user) {
    if (typeof S === "undefined" || !S.trades) return;
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
    if (typeof modal === "function") modal(html);
  }

  /* ====================================================================
   * Splash Screen Controller
   * ==================================================================== */
  function initSplashAndAuth() {
    var splash = document.querySelector("#splash-screen");
    if (!splash) return;

    var minDelay = new Promise(function (resolve) {
      setTimeout(resolve, 2100);
    });

    // Skip on tap/click
    splash.addEventListener("click", function () {
      dismissSplash();
    });

    // When minimum animation duration passes and initial auth resolves:
    Promise.all([minDelay, waitForInitialAuth()]).then(function () {
      dismissSplash();
    });

    // Fallback safety timeout (max 3.5s)
    setTimeout(function () {
      dismissSplash();
    }, 3500);
  }

  function dismissSplash() {
    if (_splashDismissed) return;
    _splashDismissed = true;

    var splash = document.querySelector("#splash-screen");
    if (splash) {
      splash.classList.add("splash-hidden");
      setTimeout(function () {
        splash.style.display = "none";
      }, 600);
    }

    document.body.classList.remove("splash-active");

    // If user is already authenticated -> reveal dashboard
    if (_currentUser) {
      hideAuthScreen();
      if (typeof render === "function") render();
    } else {
      // If not authenticated -> reveal Auth Screen
      showAuthScreen();
    }
  }

  /* ====================================================================
   * Auth Screen Visibility Controller
   * ==================================================================== */
  function showAuthScreen() {
    var authScreen = document.querySelector("#auth-screen");
    if (authScreen) {
      authScreen.classList.remove("auth-hidden");
      authScreen.style.display = "flex";
    }
    document.body.classList.add("auth-active");
  }

  function hideAuthScreen() {
    var authScreen = document.querySelector("#auth-screen");
    if (authScreen) {
      authScreen.classList.add("auth-hidden");
      setTimeout(function () {
        authScreen.style.display = "none";
      }, 400);
    }
    document.body.classList.remove("auth-active");
    if (typeof render === "function") render();
  }

  /* ====================================================================
   * Auth API Methods
   * ==================================================================== */
  function signInWithGoogle() {
    if (!_authInstance) {
      if (typeof toast === "function") toast("Firebase keys need to be added to js/config.js first.");
      return Promise.reject(new Error("Firebase not configured"));
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    return _authInstance.signInWithPopup(provider);
  }

  function signInWithEmail(email, password) {
    if (!_authInstance) {
      if (typeof toast === "function") toast("Firebase keys need to be added to js/config.js first.");
      return Promise.reject(new Error("Firebase not configured"));
    }
    return _authInstance.signInWithEmailAndPassword(email, password);
  }

  function signUpWithEmail(email, password, displayName) {
    if (!_authInstance) {
      if (typeof toast === "function") toast("Firebase keys need to be added to js/config.js first.");
      return Promise.reject(new Error("Firebase not configured"));
    }
    return _authInstance
      .createUserWithEmailAndPassword(email, password)
      .then(function (result) {
        if (displayName && result.user) {
          return result.user.updateProfile({ displayName: displayName }).then(function () {
            return result;
          });
        }
        return result;
      });
  }

  function signOut() {
    if (!_authInstance) {
      _currentUser = null;
      updateUserUI();
      showAuthScreen();
      return Promise.resolve();
    }
    return _authInstance.signOut().then(function () {
      _currentUser = null;
      updateUserUI();
      if (typeof toast === "function") toast("Signed out successfully");
      showAuthScreen();
    });
  }

  /* ====================================================================
   * Interactive Auth Screen UI Controller (from auth.html reference)
   * ==================================================================== */
  function initAuthUI() {
    var card = document.querySelector("#auth-card");
    if (!card) return;

    var mode = "login";
    var busy = false;
    var T = {
      login: ["Welcome back", "Log in to continue your journal.", "Log in"],
      signup: ["Create your account", "Start journaling your edge today.", "Create account"]
    };

    function setMode(m) {
      mode = m;
      card.dataset.mode = m;
      var tabLogin = document.querySelector("#tab-login");
      var tabSignup = document.querySelector("#tab-signup");
      if (tabLogin && tabSignup) {
        tabLogin.classList.toggle("on", m === "login");
        tabSignup.classList.toggle("on", m === "signup");
        tabLogin.setAttribute("aria-selected", m === "login");
        tabSignup.setAttribute("aria-selected", m === "signup");
      }
      var authTitle = document.querySelector("#auth-title");
      var authSub = document.querySelector("#auth-sub");
      var authSubmit = document.querySelector("#auth-submit");
      if (authTitle) authTitle.textContent = T[m][0];
      if (authSub) authSub.textContent = T[m][1];
      if (authSubmit && !busy) authSubmit.textContent = T[m][2];

      var passInput = document.querySelector("#auth-password");
      if (passInput) passInput.autocomplete = m === "login" ? "current-password" : "new-password";
      setError("");
    }

    function setError(msg) {
      var errEl = document.querySelector("#auth-error");
      if (errEl) errEl.textContent = msg || "";
    }

    function setNotice(html) {
      var n = document.querySelector("#auth-notice");
      if (!n) return;
      n.hidden = !html;
      n.innerHTML = html || "";
    }

    function setLoading(b) {
      busy = !!b;
      var s = document.querySelector("#auth-submit");
      if (!s) return;
      s.disabled = busy;
      s.innerHTML = busy
        ? '<span class="auth-spin"></span> ' + (mode === "login" ? "Logging in…" : "Creating account…")
        : T[mode][2];
    }

    function bad(selector, on) {
      var el = document.querySelector(selector);
      if (!el) return;
      var f = el.closest(".auth-f");
      if (f) f.classList.toggle("bad", !!on);
    }

    // Tab buttons
    var tabLogin = document.querySelector("#tab-login");
    var tabSignup = document.querySelector("#tab-signup");
    if (tabLogin) tabLogin.onclick = function () { setMode("login"); };
    if (tabSignup) tabSignup.onclick = function () { setMode("signup"); };

    // Password visibility toggle
    var eyeBtn = document.querySelector("#auth-eye");
    if (eyeBtn) {
      eyeBtn.onclick = function () {
        var p1 = document.querySelector("#auth-password");
        var p2 = document.querySelector("#auth-confirm");
        var show = p1 && p1.type === "password";
        if (p1) p1.type = show ? "text" : "password";
        if (p2) p2.type = show ? "text" : "password";
        this.classList.toggle("show", show);
      };
    }

    // Password strength meter
    var passInput = document.querySelector("#auth-password");
    if (passInput) {
      passInput.addEventListener("input", function () {
        var v = this.value;
        var sc =
          (v.length >= 6) +
          (v.length >= 10) +
          (/[A-Z]/.test(v) && /[a-z]/.test(v)) +
          (/\d/.test(v)) +
          (/[^A-Za-z0-9]/.test(v));
        var m = document.querySelector("#auth-meter-bar");
        var hint = document.querySelector("#auth-meter-hint");
        if (m) {
          m.style.width = (sc / 5 * 100) + "%";
          m.style.background = sc <= 1 ? "#EF4444" : sc <= 3 ? "#F59E0B" : "#22C55E";
        }
        if (hint) {
          hint.textContent = !v
            ? "Use 8+ characters with a mix of letters & numbers."
            : sc <= 1
            ? "Weak. Add more characters."
            : sc <= 3
            ? "Getting there. Add numbers or symbols."
            : "Strong password.";
        }
      });
    }

    // Clear error on input
    ["#auth-name", "#auth-email", "#auth-password", "#auth-confirm"].forEach(function (id) {
      var el = document.querySelector(id);
      if (el) {
        el.addEventListener("input", function () {
          bad(id, false);
          setError("");
        });
      }
    });

    // Form submit
    var form = document.querySelector("#auth-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (busy) return;

        var nameVal = (document.querySelector("#auth-name") ? document.querySelector("#auth-name").value.trim() : "");
        var emailVal = (document.querySelector("#auth-email") ? document.querySelector("#auth-email").value.trim() : "");
        var passVal = (document.querySelector("#auth-password") ? document.querySelector("#auth-password").value : "");
        var confirmVal = (document.querySelector("#auth-confirm") ? document.querySelector("#auth-confirm").value : "");

        ["#auth-name", "#auth-email", "#auth-password", "#auth-confirm"].forEach(function (id) {
          bad(id, false);
        });

        if (mode === "signup" && !nameVal) {
          bad("#auth-name", true);
          setError("Add your name / trader handle.");
          return;
        }
        if (!/^\S+@\S+\.\S+$/.test(emailVal)) {
          bad("#auth-email", true);
          setError("Enter a valid email address.");
          return;
        }
        if (!passVal) {
          bad("#auth-password", true);
          setError("Enter your password.");
          return;
        }
        if (mode === "signup") {
          if (passVal.length < 6) {
            bad("#auth-password", true);
            setError("Use at least 6 characters for your password.");
            return;
          }
          if (passVal !== confirmVal) {
            bad("#auth-confirm", true);
            setError("Passwords don’t match.");
            return;
          }
        }

        setError("");
        setLoading(true);

        if (mode === "signup") {
          // --- USER REGISTRATION ---
          signUpWithEmail(emailVal, passVal, nameVal)
            .then(function () {
              setLoading(false);
              // Save registered name into profile state
              if (typeof S !== "undefined") {
                if (!S.profile) S.profile = {};
                S.profile.name = nameVal;
                if (typeof save === "function") save();
              }
              hideAuthScreen();
              if (typeof toast === "function") toast("Account created! Welcome to LockIn.");

              // REQUIREMENT: AFTER REGISTER ONLY, ASK ABOUT PROFILE SETTINGS
              setTimeout(function () {
                if (typeof profileForm === "function") {
                  profileForm(true);
                }
              }, 350);
            })
            .catch(function (err) {
              setLoading(false);
              setError(err.message || "Registration failed.");
            });
        } else {
          // --- USER LOGIN ---
          signInWithEmail(emailVal, passVal)
            .then(function () {
              setLoading(false);
              hideAuthScreen();
              if (typeof toast === "function") toast("Welcome back!");
              // Note: Do NOT open profileForm on login!
            })
            .catch(function (err) {
              setLoading(false);
              setError(err.message || "Invalid email or password.");
            });
        }
      });
    }

    // Google Sign-In button
    var googleBtn = document.querySelector("#auth-google");
    if (googleBtn) {
      googleBtn.onclick = function () {
        setError("");
        signInWithGoogle()
          .then(function (result) {
            var isNewUser = false;
            if (result && result.additionalUserInfo && result.additionalUserInfo.isNewUser) {
              isNewUser = true;
            } else if (typeof S !== "undefined" && (!S.profile || !S.profile.name)) {
              isNewUser = true;
            }

            hideAuthScreen();

            if (isNewUser) {
              if (result && result.user && result.user.displayName && typeof S !== "undefined") {
                if (!S.profile) S.profile = {};
                S.profile.name = result.user.displayName;
                if (typeof save === "function") save();
              }
              if (typeof toast === "function") toast("Welcome to LockIn! Let's set up your profile.");
              setTimeout(function () {
                if (typeof profileForm === "function") {
                  profileForm(true);
                }
              }, 350);
            } else {
              if (typeof toast === "function") toast("Welcome back!");
            }
          })
          .catch(function (err) {
            if (err && err.code !== "auth/popup-closed-by-user") {
              setError(err.message || "Google sign in failed.");
            }
          });
      };
    }

    // Forgot password button
    var forgotBtn = document.querySelector("#auth-forgot");
    if (forgotBtn) {
      forgotBtn.onclick = function () {
        var emailInput = document.querySelector("#auth-email");
        var em = emailInput ? emailInput.value.trim() : "";
        if (!/^\S+@\S+\.\S+$/.test(em)) {
          bad("#auth-email", true);
          setError("Type your email above first, then tap Forgot password.");
          return;
        }
        if (!_authInstance) {
          setError("Firebase auth not configured.");
          return;
        }
        _authInstance
          .sendPasswordResetEmail(em)
          .then(function () {
            setNotice("Password reset link sent to <b>" + esc(em) + "</b>! Please check your email.");
            setError("");
          })
          .catch(function (err) {
            setError(err.message || "Failed to send reset link.");
          });
      };
    }

    // Continue as guest button
    var guestBtn = document.querySelector("#auth-guest");
    if (guestBtn) {
      guestBtn.onclick = function () {
        hideAuthScreen();
        if (typeof toast === "function") toast("Exploring in Guest Mode (Offline)");
      };
    }

    // Theme toggle on Auth screen
    var themeToggle = document.querySelector("#auth-theme-toggle");
    if (themeToggle) {
      themeToggle.onclick = function () {
        if (typeof toggleTheme === "function") {
          toggleTheme();
        } else {
          var cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
          document.documentElement.setAttribute("data-theme", cur);
          try { localStorage.setItem("ascend1t", cur); } catch (e) {}
        }
      };
    }

    setMode("login");
  }

  function showAuthModal() {
    showAuthScreen();
  }

  return {
    init: init,
    getCurrentUser: getCurrentUser,
    signInWithGoogle: signInWithGoogle,
    signInWithEmail: signInWithEmail,
    signUpWithEmail: signUpWithEmail,
    signOut: signOut,
    showAuthModal: showAuthModal,
    showAuthScreen: showAuthScreen,
    hideAuthScreen: hideAuthScreen,
    waitForInitialAuth: waitForInitialAuth,
  };
})();
