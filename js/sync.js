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
              date: row.trade_date,
              d: row.trade_date,
              inst: row.symbol,
              sym: row.symbol,
              side: row.action || "Long",
              act: row.action || "Long",
              entry: row.entry,
              ent: row.entry,
              sl: row.sl,
              tp: row.tp,
              size: row.size,
              sz: row.size,
              exit: row.exit_price,
              pnl: Number(row.pnl) || 0,
              r: row.r_multiple != null ? row.r_multiple : "",
              res: row.result,
              setup: row.setup || "",
              grade: row.grade || "",
              mistake: row.mistake || "None",
              mist: row.mistake || "None",
              notes: row.notes || "",
              mood: row.mood || "",
              acc: row.account_id || "",
              acct: row.account_id || "",
              sh: row.screenshots || [],
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
            var r = row.rules || {};
            var statusVal = r.status || row.status || "Evaluation";
            var firmName = r.firm || row.name || "Account";
            return {
              id: row.id,
              firm: firmName,
              name: firmName,
              size: Number(row.size) || 0,
              cur: row.currency || "USD",
              status: statusVal,
              st: statusVal,
              bal: Number(row.balance) || 0,
              cost: Number(r.cost) || 0,
              market: r.market || "Futures",
              type: r.type || "One Step",
              split: Number(r.split) || 80,
              notes: r.notes || "",
              label: r.label || "",
              date: r.date || "",
              maxdd: Number(row.max_dd) || 10,
              ddd: Number(row.daily_dd) || 5,
              prof: Number(row.profit_target) || 8,
              ph: row.phase || "PHASE 1",
              fav: Boolean(row.is_favorite),
              hist: Array.isArray(r.hist)
                ? r.hist
                : r.date
                  ? [{ d: r.date, s: statusVal, n: "Purchased" }]
                  : [],
            };
          });
        }

        if (paysRes.data && paysRes.data.length > 0) {
          S.pays = paysRes.data.map(function (row) {
            return {
              id: row.id,
              acc: row.account_id,
              aid: row.account_id,
              date: row.payout_date,
              d: row.payout_date,
              amt: Number(row.amount) || 0,
              net: Number(row.net || row.amount) || 0,
              split: Number(row.split) || 80,
              fee: Number(row.fee) || 0,
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
        trade_date: t.date || t.d || new Date().toISOString().slice(0, 10),
        symbol: t.inst || t.sym || "Trade",
        action: t.side || t.act || "Long",
        entry: t.entry != null ? Number(t.entry) : t.ent != null ? Number(t.ent) : null,
        sl: t.sl != null && t.sl !== "" ? Number(t.sl) : null,
        tp: t.tp != null && t.tp !== "" ? Number(t.tp) : null,
        size: t.size != null && t.size !== "" ? Number(t.size) : t.sz != null && t.sz !== "" ? Number(t.sz) : null,
        exit_price: t.exit != null && t.exit !== "" ? Number(t.exit) : null,
        pnl: Number(t.pnl) || 0,
        r_multiple: t.r != null && t.r !== "" ? Number(t.r) : null,
        result: t.res || (Number(t.pnl) > 0 ? "Win" : Number(t.pnl) < 0 ? "Loss" : "BE"),
        setup: t.setup || "",
        mistake: t.mistake || t.mist || "",
        notes: t.notes || "",
        mood: t.mood || "",
        account_id: t.acc || t.acct || "",
        screenshots: t.sh || t.shots || [],
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
        name: a.firm || a.name || "",
        size: Number(a.size) || 0,
        currency: a.cur || "USD",
        status: a.status || a.st || "Evaluation",
        balance: Number(a.bal) || 0,
        max_dd: Number(a.maxdd) || 10,
        daily_dd: Number(a.ddd) || 5,
        profit_target: Number(a.prof) || 8,
        phase: a.ph || "PHASE 1",
        rules: { rule: a.rule || "", split: a.split || 80, cost: a.cost || 0 },
        is_favorite: Boolean(a.fav),
        updated_at: new Date().toISOString(),
      };
    });

    // 5. Payouts Upsert
    var paysRows = (S.pays || []).map(function (p) {
      return {
        id: p.id,
        user_id: userId,
        account_id: p.acc || p.aid || "",
        payout_date: p.date || p.d || new Date().toISOString().slice(0, 10),
        amount: Number(p.gross || p.amt) || 0,
        net: Number(p.amt) || 0,
        split: Number(p.split) || 80,
        fee: Number(p.fee) || 0,
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
    if (paysRows.length > 0) {
      promises.push(
        client
          .from("payouts")
          .upsert(paysRows, { onConflict: "id,user_id" }),
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
   * Deletes a payout from Supabase
   */
  function deletePayout(payoutId) {
    var user = LockinAuth.getCurrentUser();
    var client = getClient();
    if (!user || !client || !payoutId) return Promise.resolve();

    return client
      .from("payouts")
      .delete()
      .eq("id", payoutId)
      .eq("user_id", user.uid)
      .catch(function (err) {
        console.warn("Could not delete payout from cloud:", err);
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
    deletePayout: deletePayout,
    uploadScreenshot: uploadScreenshot,
  };
})();
