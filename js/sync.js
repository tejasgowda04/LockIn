/**
 * ====================================================================
 * LockIn – Supabase PostgreSQL & Storage Synchronization Controller
 * ====================================================================
 * Handles multi-user data synchronization with Supabase PostgreSQL
 * and uploads chart screenshots to Supabase Storage.
 * ====================================================================
 */

var LockinSync = (function () {
  var _client = null;
  var _initialized = false;
  var _isSyncing = false;

  function init() {
    if (_initialized) return;
    if (typeof supabase === "undefined" || !isSupabaseConfigured()) {
      console.log("LockIn: Supabase not configured. Using local storage.");
      return;
    }

    try {
      _client = supabase.createClient(
        LOCKIN_CONFIG.supabase.url,
        LOCKIN_CONFIG.supabase.anonKey,
      );
      _initialized = true;
      console.log("LockIn: Supabase client connected.");
    } catch (e) {
      console.error("LockIn: Supabase init error:", e);
    }
  }

  function getClient() {
    if (!_initialized) init();
    return _client;
  }

  /**
   * Loads all user data from Supabase for the current user
   */
  function loadUserData(userId) {
    if (!getClient() || !userId) return Promise.resolve(false);
    _isSyncing = true;

    var client = getClient();
    toast("Syncing with cloud...");

    return Promise.all([
      client.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      client
        .from("trades")
        .select("*")
        .eq("user_id", userId)
        .order("trade_date", { ascending: false }),
      client.from("journal_days").select("*").eq("user_id", userId),
      client.from("prop_accounts").select("*").eq("user_id", userId),
      client.from("payouts").select("*").eq("user_id", userId),
    ])
      .then(function (results) {
        var profileRes = results[0];
        var tradesRes = results[1];
        var daysRes = results[2];
        var acctsRes = results[3];
        var paysRes = results[4];

        var hasCloudData = tradesRes.data && tradesRes.data.length > 0;

        if (profileRes.data) {
          S.profile = {
            name: profileRes.data.name || S.profile.name || "",
            bal: profileRes.data.balance || S.profile.bal || 10000,
            cur: profileRes.data.currency || S.profile.cur || "USD",
          };
          if (profileRes.data.theme) {
            setTheme(profileRes.data.theme);
          }
        }

        if (tradesRes.data && tradesRes.data.length > 0) {
          S.trades = tradesRes.data.map(function (row) {
            return {
              id: row.id,
              d: row.trade_date,
              sym: row.symbol,
              act: row.action,
              ent: row.entry,
              sl: row.sl,
              tp: row.tp,
              sz: row.size,
              exit: row.exit_price,
              pnl: row.pnl,
              r: row.r_multiple,
              res: row.result,
              setup: row.setup,
              mist: row.mistake,
              notes: row.notes,
              mood: row.mood,
              acct: row.account_id,
              shots: row.screenshots || [],
            };
          });
        }

        if (daysRes.data && daysRes.data.length > 0) {
          S.days = {};
          daysRes.data.forEach(function (row) {
            S.days[row.day_date] = {
              note: row.note || "",
              mood: row.mood || "",
              rules: row.rules || [],
            };
          });
        }

        if (acctsRes.data && acctsRes.data.length > 0) {
          S.accts = acctsRes.data.map(function (row) {
            return {
              id: row.id,
              name: row.name,
              size: row.size,
              cur: row.currency,
              st: row.status,
              bal: row.balance,
              maxdd: row.max_dd,
              ddd: row.daily_dd,
              prof: row.profit_target,
              ph: row.phase,
              rule: (row.rules && row.rules.rule) || "",
              fav: row.is_favorite,
            };
          });
        }

        if (paysRes.data && paysRes.data.length > 0) {
          S.pays = paysRes.data.map(function (row) {
            return {
              id: row.id,
              aid: row.account_id,
              d: row.payout_date,
              amt: row.amount,
              net: row.net,
              split: row.split,
              fee: row.fee,
            };
          });
        }

        // Cache loaded data to localStorage for instant offline access
        try {
          localStorage.setItem(K, JSON.stringify(S));
        } catch (e) {}

        _isSyncing = false;
        render();
        toast("Cloud sync complete! ✅");
        return hasCloudData;
      })
      .catch(function (err) {
        _isSyncing = false;
        console.error("LockIn Sync load error:", err);
        toast("Cloud sync failed. Using local data.");
        return false;
      });
  }

  /**
   * Saves current state to Supabase PostgreSQL
   */
  function saveUserData(showFeedback) {
    if (_isSyncing) return Promise.resolve();
    var user = LockinAuth.getCurrentUser();
    var client = getClient();

    if (!user || !client) {
      // Local mode fallback
      return Promise.resolve();
    }

    var userId = user.uid;

    // 1. Profile Upsert
    var profileData = {
      user_id: userId,
      email: user.email,
      name: (S.profile && S.profile.name) || user.displayName || "",
      balance: (S.profile && S.profile.bal) || 10000,
      currency: (S.profile && S.profile.cur) || "USD",
      theme: document.documentElement.getAttribute("data-theme") || "dark",
      updated_at: new Date().toISOString(),
    };

    // 2. Trades Upsert (Batch)
    var tradesRows = (S.trades || []).map(function (t) {
      return {
        id: t.id,
        user_id: userId,
        trade_date: t.d,
        symbol: t.sym,
        action: t.act,
        entry: t.ent != null ? Number(t.ent) : null,
        sl: t.sl != null ? Number(t.sl) : null,
        tp: t.tp != null ? Number(t.tp) : null,
        size: t.sz != null ? Number(t.sz) : null,
        exit_price: t.exit != null ? Number(t.exit) : null,
        pnl: Number(t.pnl) || 0,
        r_multiple: t.r != null && t.r !== "" ? Number(t.r) : null,
        result: t.res || null,
        setup: t.setup || "",
        mistake: t.mist || "",
        notes: t.notes || "",
        mood: t.mood || "",
        account_id: t.acct || "",
        screenshots: t.shots || [],
        updated_at: new Date().toISOString(),
      };
    });

    // 3. Days Upsert
    var daysRows = Object.keys(S.days || {}).map(function (d) {
      var item = S.days[d] || {};
      return {
        user_id: userId,
        day_date: d,
        note: item.note || "",
        mood: item.mood || "",
        rules: item.rules || [],
        updated_at: new Date().toISOString(),
      };
    });

    // 4. Accounts Upsert
    var acctsRows = (S.accts || []).map(function (a) {
      return {
        id: a.id,
        user_id: userId,
        name: a.name || "",
        size: Number(a.size) || 0,
        currency: a.cur || "USD",
        status: a.st || "ACTIVE",
        balance: Number(a.bal) || 0,
        max_dd: Number(a.maxdd) || 10,
        daily_dd: Number(a.ddd) || 5,
        profit_target: Number(a.prof) || 8,
        phase: a.ph || "PHASE 1",
        rules: { rule: a.rule || "" },
        is_favorite: Boolean(a.fav),
        updated_at: new Date().toISOString(),
      };
    });

    // Execute background batch upserts
    var promises = [
      client.from("profiles").upsert(profileData, { onConflict: "user_id" }),
    ];

    if (tradesRows.length > 0) {
      promises.push(
        client.from("trades").upsert(tradesRows, { onConflict: "id,user_id" }),
      );
    }
    if (daysRows.length > 0) {
      promises.push(
        client
          .from("journal_days")
          .upsert(daysRows, { onConflict: "user_id,day_date" }),
      );
    }
    if (acctsRows.length > 0) {
      promises.push(
        client
          .from("prop_accounts")
          .upsert(acctsRows, { onConflict: "id,user_id" }),
      );
    }

    return Promise.all(promises)
      .then(function () {
        if (showFeedback) toast("Saved to Supabase cloud! ☁️");
      })
      .catch(function (err) {
        console.error("LockIn Cloud save error:", err);
        if (showFeedback) toast("Could not sync to cloud. Saved locally.");
      });
  }

  /**
   * Deletes a trade from Supabase
   */
  function deleteTrade(tradeId) {
    var user = LockinAuth.getCurrentUser();
    var client = getClient();
    if (!user || !client || !tradeId) return Promise.resolve();

    return client
      .from("trades")
      .delete()
      .eq("id", tradeId)
      .eq("user_id", user.uid)
      .catch(function (err) {
        console.warn("Could not delete trade from cloud:", err);
      });
  }

  /**
   * Uploads chart screenshot to Supabase Storage bucket 'screenshots'
   * Returns public URL of the uploaded image.
   */
  function uploadScreenshot(fileBlob, tradeId) {
    var user = LockinAuth.getCurrentUser();
    var client = getClient();

    // If offline or not configured, return null to fall back to IndexedDB
    if (!user || !client) return Promise.resolve(null);

    var userId = user.uid;
    var ext = fileBlob.type === "image/png" ? "png" : "jpg";
    var fileName =
      userId + "/" + (tradeId || "temp") + "_" + Date.now() + "." + ext;

    return client.storage
      .from("screenshots")
      .upload(fileName, fileBlob, {
        cacheControl: "3600",
        upsert: true,
        contentType: fileBlob.type || "image/png",
      })
      .then(function (res) {
        if (res.error) throw res.error;
        var publicUrlData = client.storage
          .from("screenshots")
          .getPublicUrl(fileName);
        return publicUrlData.data.publicUrl;
      })
      .catch(function (err) {
        console.warn(
          "Supabase Storage upload failed, falling back to local:",
          err,
        );
        return null;
      });
  }

  return {
    init: init,
    getClient: getClient,
    loadUserData: loadUserData,
    saveUserData: saveUserData,
    deleteTrade: deleteTrade,
    uploadScreenshot: uploadScreenshot,
  };
})();
