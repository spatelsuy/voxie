import { useState, useEffect, useCallback, useRef } from "react";

/* ─── Constants ───────────────────────────────────── */
export const DB_NAME          = "VoiceRecorderDB";
export const DB_VERSION       = 4;               // v4 adds settings store
export const STORE_RECORDINGS = "recordings";
export const STORE_A2T        = "a2t_results";
export const STORE_ITEMS      = "organizer_items"; // DB-2 — independent item lifecycle
export const STORE_SETTINGS   = "settings";
export const WARN_MB          = 50;
export const CRITICAL_MB      = 200;

/* ─── Low-level DB helpers ────────────────────────── */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_RECORDINGS))
        db.createObjectStore(STORE_RECORDINGS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_A2T))
        db.createObjectStore(STORE_A2T, { keyPath: "recordingId" });
      // v3 — independent items store
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const s = db.createObjectStore(STORE_ITEMS, { keyPath: "id" });
        s.createIndex("bySource", "sourceRecordingId", { unique: false });
        s.createIndex("byDate",   "recordingDate",     { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS))
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ── recordings ── */
export function dbSaveRecording(db, rec) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, "readwrite");
    tx.objectStore(STORE_RECORDINGS).put({
      id: rec.id,
      name: rec.name,
      blob: rec.blob || null,
      size: rec.size,
      duration: rec.duration,
      createdAt: rec.createdAt.toISOString(),
      kind: rec.kind || "audio",
      text: rec.text || null,
    });
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

export function dbDeleteRecording(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, "readwrite");
    tx.objectStore(STORE_RECORDINGS).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

function dbLoadAllRecordings(db) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_RECORDINGS, "readonly");
    const req = tx.objectStore(STORE_RECORDINGS).getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ── a2t_results ── */
/** Write a full a2t record: status = "pending" | "done" | "failed", data = null or result */
export function dbSaveA2T(db, recordingId, status, jsonData = null, createdAt = null) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_A2T, "readwrite");
    const store = tx.objectStore(STORE_A2T);
    // Preserve existing createdAt if record already exists
    const getReq = store.get(recordingId);
    getReq.onsuccess = (e) => {
      const existing = e.target.result;
      store.put({
        recordingId,
        status,
        data:      jsonData,
        createdAt: existing?.createdAt || createdAt || new Date().toISOString(),
      });
    };
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

export function dbDeleteA2T(db, recordingId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_A2T, "readwrite");
    tx.objectStore(STORE_A2T).delete(recordingId);
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

function dbLoadAllA2T(db) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_A2T, "readonly");
    const req = tx.objectStore(STORE_A2T).getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ── organizer_items (DB-2) ── */

/** Save an array of item objects in one transaction */
export function dbSaveItems(db, items) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    items.forEach((item) => store.put(item));
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

/** Delete a single item by its id */
export function dbDeleteItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    tx.objectStore(STORE_ITEMS).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

/** Delete all items whose sourceRecordingId matches */
export function dbDeleteItemsBySource(db, sourceRecordingId) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_ITEMS, "readwrite");
    const index = tx.objectStore(STORE_ITEMS).index("bySource");
    const req   = index.openCursor(IDBKeyRange.only(sourceRecordingId));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

function dbLoadAllItems(db) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_ITEMS, "readonly");
    const req = tx.objectStore(STORE_ITEMS).getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export function dbSaveSetting(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, "readwrite");
    tx.objectStore(STORE_SETTINGS).put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

function dbLoadAllSettings(db) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_SETTINGS, "readonly");
    const req = tx.objectStore(STORE_SETTINGS).getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ─── Helper: extract flat items from A2T JSON ────── */
export function extractItems(a2tData, sourceRecordingId, recordingDate) {
  const a     = a2tData?.analysis;
  if (!a) return [];
  const items = [];
  const now   = new Date().toISOString();
  const base  = { sourceRecordingId, recordingDate, isEdited: false, createdAt: now, updatedAt: now };

  (a.tasks || []).forEach((t, i) => items.push({
    ...base,
    id:            `${sourceRecordingId}_task_${i}`,
    type:          "task",
    title:         t.title,
    priority:      t.priority     || "low",
    time:          t.time         || null,
    context:       t.context      || null,
    related:       t.related_to   || null,
    sourceSegment: t.source_segment || null,
    isDeadline:    !!t.is_deadline,
    recurrence:    t.recurrence   || null,
    status:        "inprogress",
  }));

  (a.events || []).forEach((t, i) => items.push({
    ...base,
    id:            `${sourceRecordingId}_event_${i}`,
    type:          "event",
    title:         t.title,
    priority:      t.priority     || "low",
    time:          t.time         || null,
    context:       t.context      || null,
    related:       t.related_to   || null,
    sourceSegment: t.source_segment || null,
    isDeadline:    false,
    recurrence:    t.recurrence   || null,
    status:        "inprogress",
  }));

  (a.reminders || []).forEach((t, i) => items.push({
    ...base,
    id:            `${sourceRecordingId}_reminder_${i}`,
    type:          "reminder",
    title:         t.title,
    priority:      t.priority     || "low",
    time:          t.time         || null,
    context:       t.context      || null,
    related:       t.related_to   || null,
    sourceSegment: t.source_segment || null,
    isDeadline:    false,
    recurrence:    t.recurrence   || null,
    status:        "inprogress",
  }));

  (a.notes || []).forEach((t, i) => items.push({
    ...base,
    id:       `${sourceRecordingId}_note_${i}`,
    type:     "note",
    title:    t.title,
    priority: "low",
    time:     null,
    context:  t.context || null,
    related:  t.related_to || null,
    isDeadline: false,
    status:   "inprogress",
  }));

  return items;
}

/* ─── Hook ────────────────────────────────────────── */
export default function useOrganizerDB() {
  const dbRef = useRef(null);

  const [recordings,  setRecordings]  = useState([]);
  const [a2tResults,  setA2tResults]  = useState({}); // { [recordingId]: jsonData }
  const [a2tStatuses, setA2tStatuses] = useState({}); // { [recordingId]: "pending"|"done"|"failed" }
  const [items,      setItems]      = useState([]); // DB-2 flat items
  const [settings,   setSettings]   = useState({
    showCompletedItems: false,
    autoPause: true,
    autoA2T: false,
    silenceSec: 2,
    userName: "SunilK",
    dbCreatedAt:     "",       // set once on first boot, never overwritten
    exportedAt:      "",       // updated on every sync/export
    storageBackend:  "drive",  // "drive" | "supabase"
  });
  const [dbWarning,  setDbWarning]  = useState(null);

  /* DB size warning (based on blob sizes) */
  const computeDBWarning = useCallback((recs) => {
    const bytes = recs.reduce((s, r) => s + r.size, 0);
    const mb    = bytes / (1024 * 1024);
    if (bytes === 0) { setDbWarning(null); return; }
    const sizeStr = mb < 1
      ? (bytes / 1024).toFixed(1) + " KB"
      : mb.toFixed(1) + " MB";
    if (mb >= CRITICAL_MB)
      setDbWarning({ level: "critical", text: `⚠️ Storage critical — ${sizeStr} used. Delete old recordings.` });
    else if (mb >= WARN_MB)
      setDbWarning({ level: "warn", text: `⚠️ Storage warning — ${sizeStr} used.` });
    else
      setDbWarning({ level: "normal", text: `🗄️ Storage used: ${sizeStr}` });
  }, []);

  /* Boot — load all three stores */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const db = await openDB();
        dbRef.current = db;

        const [saved, savedA2T, savedItems, savedSettings] = await Promise.all([
          dbLoadAllRecordings(db),
          dbLoadAllA2T(db),
          dbLoadAllItems(db),
          dbLoadAllSettings(db),
        ]);

        saved.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        const restored = saved.map((e) => ({
          id: e.id,
          name: e.name,
          blob: e.blob || null,
          url: e.blob ? URL.createObjectURL(e.blob) : null,
          size: e.size,
          duration: e.duration,
          createdAt: new Date(e.createdAt),
          kind: e.kind || "audio",
          text: e.text || null,
        }));

        const a2tMap      = {};
        const a2tStatusMap = {};
        savedA2T.forEach((r) => {
          if (r.data)   a2tMap[r.recordingId]       = r.data;
          if (r.status) a2tStatusMap[r.recordingId] = r.status;
        });

        // Initialise dbCreatedAt once — write to DB only if it doesn't exist yet
        const settingsMap = Object.fromEntries(savedSettings.map((e) => [e.key, e.value]));
        if (!settingsMap.dbCreatedAt) {
          const firstBoot = new Date().toISOString();
          settingsMap.dbCreatedAt = firstBoot;
          await dbSaveSetting(db, "dbCreatedAt", firstBoot);
        }
        // Ensure exportedAt key exists in DB (blank string if never synced)
        if (!("exportedAt" in settingsMap)) {
          settingsMap.exportedAt = "";
          await dbSaveSetting(db, "exportedAt", "");
        }

        if (mounted) {
          setRecordings(restored);
          setA2tResults(a2tMap);
          setA2tStatuses(a2tStatusMap);
          setItems(savedItems.map((item) => ({
            ...item,
            status:    item.status    || "inprogress",
            createdAt: item.createdAt || null,
            updatedAt: item.updatedAt || null,
          })));
          setSettings((prev) => ({ ...prev, ...settingsMap }));
          computeDBWarning(restored);
        }
      } catch (err) {
        console.error("IndexedDB boot failed:", err);
      }
    })();
    return () => { mounted = false; };
  }, [computeDBWarning]);

  /* Add a recording (DB-1) */
  const addRecording = useCallback(async (rec) => {
    setRecordings((prev) => {
      const next = [...prev, rec];
      computeDBWarning(next);
      return next;
    });
    if (dbRef.current) {
      try { await dbSaveRecording(dbRef.current, rec); }
      catch (err) { console.error("Failed to save recording:", err); }
    }
  }, [computeDBWarning]);

  /**
   * Delete a recording + its raw A2T JSON (DB-1).
   * alsoDeleteItems = true  → also wipe matching rows from DB-2
   * alsoDeleteItems = false → leave DB-2 items untouched
   */
  const deleteRecording = useCallback(async (id, alsoDeleteItems) => {
    setRecordings((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      if (i === -1) return prev;
      if (prev[i].url) URL.revokeObjectURL(prev[i].url);
      const next = [...prev.slice(0, i), ...prev.slice(i + 1)];
      computeDBWarning(next);
      return next;
    });
    setA2tResults( (prev) => { const n = { ...prev }; delete n[id]; return n; });
    setA2tStatuses((prev) => { const n = { ...prev }; delete n[id]; return n; });

    if (alsoDeleteItems) {
      setItems((prev) => prev.filter((item) => item.sourceRecordingId !== id));
    }

    if (dbRef.current) {
      try {
        await dbDeleteRecording(dbRef.current, id);
        await dbDeleteA2T(dbRef.current, id);
        if (alsoDeleteItems)
          await dbDeleteItemsBySource(dbRef.current, id);
      } catch (err) { console.error("Failed to delete:", err); }
    }
  }, [computeDBWarning]);

  /* Mark a recording's A2T as pending (write to DB immediately) — Tier 2 */
  const markA2TPending = useCallback(async (recordingId) => {
    setA2tStatuses((prev) => ({ ...prev, [recordingId]: "pending" }));
    if (dbRef.current) {
      try { await dbSaveA2T(dbRef.current, recordingId, "pending", null); }
      catch (err) { console.error("Failed to mark A2T pending:", err); }
    }
  }, []);

  /* Mark a recording's A2T as failed — Tier 1 + 2 */
  const markA2TFailed = useCallback(async (recordingId) => {
    setA2tStatuses((prev) => ({ ...prev, [recordingId]: "failed" }));
    if (dbRef.current) {
      try { await dbSaveA2T(dbRef.current, recordingId, "failed", null); }
      catch (err) { console.error("Failed to mark A2T failed:", err); }
    }
  }, []);

  /* Save raw A2T result + extracted items into both stores */
  const saveA2TResult = useCallback(async (recordingId, data, recordingDate) => {
    setA2tResults( (prev) => ({ ...prev, [recordingId]: data }));
    setA2tStatuses((prev) => ({ ...prev, [recordingId]: "done"  }));

    let mergedItems = [];
    setItems((prev) => {
      const existingById = new Map(
        prev
          .filter((item) => item.sourceRecordingId === recordingId)
          .map((item) => [item.id, item])
      );
      const newItems = extractItems(data, recordingId, recordingDate).map((item) => {
        const existingItem = existingById.get(item.id);
        if (existingItem?.isEdited) {
          return {
            ...item,
            ...existingItem,
            sourceRecordingId: item.sourceRecordingId,
            recordingDate: item.recordingDate,
            createdAt: existingItem.createdAt || item.createdAt,
            updatedAt: item.updatedAt,
          };
        }
        return {
          ...item,
          status:    existingItem?.status    || item.status,
          isEdited:  existingItem?.isEdited  || item.isEdited,
          createdAt: existingItem?.createdAt || item.createdAt,
        };
      });
      const filtered = prev.filter((i) => i.sourceRecordingId !== recordingId);
      mergedItems = newItems;
      return [...filtered, ...newItems];
    });

    if (dbRef.current) {
      try {
        await dbSaveA2T(dbRef.current, recordingId, "done", data);
        if (mergedItems.length > 0)
          await dbSaveItems(dbRef.current, mergedItems);
      } catch (err) { console.error("Failed to save A2T result:", err); }
    }
  }, []);

  /* Soft-delete a single item from DB-2 — marks status "deleted" so sync can propagate it */
  const deleteItem = useCallback(async (itemId) => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) =>
      i.id === itemId ? { ...i, status: "deleted", updatedAt: now } : i
    ));
    if (dbRef.current) {
      try {
        const all = await dbLoadAllItems(dbRef.current);
        const item = all.find((i) => i.id === itemId);
        if (item) await dbSaveItems(dbRef.current, [{ ...item, status: "deleted", updatedAt: now }]);
      }
      catch (err) { console.error("Failed to soft-delete item:", err); }
    }
  }, []);

  const updateItemStatus = useCallback(async (itemId, status) => {
    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) return;

    const updatedItem = { ...currentItem, status, updatedAt: new Date().toISOString() };
    setItems((prev) => prev.map((item) => (
      item.id === itemId ? updatedItem : item
    )));

    if (dbRef.current) {
      try { await dbSaveItems(dbRef.current, [updatedItem]); }
      catch (err) { console.error("Failed to update item status:", err); }
    }
  }, [items]);

  const updateItem = useCallback(async (itemId, changes) => {
    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) return;

    const updatedItem = { ...currentItem, ...changes, isEdited: true, updatedAt: new Date().toISOString() };
    setItems((prev) => prev.map((item) => (
      item.id === itemId ? updatedItem : item
    )));

    if (dbRef.current) {
      try { await dbSaveItems(dbRef.current, [updatedItem]); }
      catch (err) { console.error("Failed to update item:", err); }
    }
  }, [items]);

  const saveSetting = useCallback(async (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (dbRef.current) {
      try { await dbSaveSetting(dbRef.current, key, value); }
      catch (err) { console.error("Failed to save setting:", err); }
    }
  }, []);

  /** Return a plain JSON-serialisable snapshot of the three sync-able stores.
   *  Also stamps exportedAt in the settings store so it persists. */
  const getSyncSnapshot = useCallback(async () => {
    if (!dbRef.current) return null;
    const [savedA2T, savedItems, savedSettings] = await Promise.all([
      dbLoadAllA2T(dbRef.current),
      dbLoadAllItems(dbRef.current),
      dbLoadAllSettings(dbRef.current),
    ]);
    const settingsMap = Object.fromEntries(savedSettings.map((s) => [s.key, s.value]));
    const now = new Date().toISOString();

    // Stamp exportedAt — persist to DB and update in-memory settings
    settingsMap.exportedAt = now;
    await dbSaveSetting(dbRef.current, "exportedAt", now);
    setSettings((prev) => ({ ...prev, exportedAt: now }));

    return {
      dbCreatedAt:     settingsMap.dbCreatedAt || "",
      exportedAt:      now,
      a2t_results:     savedA2T,
      organizer_items: savedItems,
      settings:        settingsMap,
    };
  }, []);

  /**
   * Merge a remote snapshot into local data using last-write-wins by `updatedAt`.
   * Returns merged organizer_items count for UI feedback.
   */
  const mergeSyncData = useCallback(async (remote) => {
    if (!dbRef.current || !remote) return { itemsUpdated: 0 };

    /* ── organizer_items merge ────────────────────────── */
    const localItems   = await dbLoadAllItems(dbRef.current);
    const localById    = new Map(localItems.map((i) => [i.id, i]));
    const remoteItems  = remote.organizer_items || [];
    let itemsUpdated   = 0;

    const toWrite = [];
    remoteItems.forEach((remoteItem) => {
      const local = localById.get(remoteItem.id);
      if (!local) {
        // Item doesn't exist locally at all — always take remote
        toWrite.push(remoteItem);
        itemsUpdated++;
        return;
      }
      // Use updatedAt, fall back to createdAt, fall back to 0
      const remoteTs = new Date(remoteItem.updatedAt || remoteItem.createdAt || 0).getTime();
      const localTs  = new Date(local.updatedAt      || local.createdAt      || 0).getTime();
      if (remoteTs > localTs) {
        toWrite.push(remoteItem);
        itemsUpdated++;
      }
    });

    if (toWrite.length > 0) {
      await dbSaveItems(dbRef.current, toWrite);
      // Rebuild in-memory items: start from local, overlay remote wins
      const merged = new Map(localItems.map((i) => [i.id, i]));
      toWrite.forEach((i) => merged.set(i.id, { ...i, status: i.status || "inprogress" }));
      setItems(Array.from(merged.values()));
    }

    /* ── a2t_results merge (status + data, by createdAt) ── */
    const localA2T   = await dbLoadAllA2T(dbRef.current);
    const localA2TById = new Map(localA2T.map((r) => [r.recordingId, r]));
    const remoteA2T  = remote.a2t_results || [];

    const a2tToWrite = [];
    remoteA2T.forEach((remoteR) => {
      const local   = localA2TById.get(remoteR.recordingId);
      const remoteTs = remoteR.createdAt ? new Date(remoteR.createdAt).getTime() : 0;
      const localTs  = local?.createdAt  ? new Date(local.createdAt).getTime()  : 0;
      if (!local || remoteTs > localTs) {
        a2tToWrite.push(remoteR);
      }
    });

    for (const r of a2tToWrite) {
      await dbSaveA2T(dbRef.current, r.recordingId, r.status, r.data || null, r.createdAt);
    }

    if (a2tToWrite.length > 0) {
      const newMap     = {};
      const newStatMap = {};
      [...localA2T, ...a2tToWrite].forEach((r) => {
        if (r.data)   newMap[r.recordingId]     = r.data;
        if (r.status) newStatMap[r.recordingId] = r.status;
      });
      // Remote wins already written; rebuild from updated DB for accuracy
      const updated = await dbLoadAllA2T(dbRef.current);
      updated.forEach((r) => {
        if (r.data)   newMap[r.recordingId]     = r.data;
        if (r.status) newStatMap[r.recordingId] = r.status;
      });
      setA2tResults(newMap);
      setA2tStatuses(newStatMap);
    }

    return { itemsUpdated };
  }, []);

  /**
   * Clears all local data (recordings, A2T results, organizer items).
   * Settings are intentionally preserved.
   */
  const clearLocalDB = useCallback(async () => {
    // Revoke all blob URLs to free memory
    setRecordings((prev) => {
      prev.forEach((r) => { if (r.url) URL.revokeObjectURL(r.url); });
      return [];
    });
    setA2tResults({});
    setA2tStatuses({});
    setItems([]);
    computeDBWarning([]);

    if (dbRef.current) {
      const db = dbRef.current;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(
          [STORE_RECORDINGS, STORE_A2T, STORE_ITEMS],
          "readwrite"
        );
        tx.objectStore(STORE_RECORDINGS).clear();
        tx.objectStore(STORE_A2T).clear();
        tx.objectStore(STORE_ITEMS).clear();
        tx.oncomplete = resolve;
        tx.onerror    = (e) => reject(e.target.error);
      });
    }
  }, [computeDBWarning]);

  return {
    dbRef,
    recordings, a2tResults, a2tStatuses, items, settings, dbWarning,
    addRecording, deleteRecording,
    markA2TPending, markA2TFailed, saveA2TResult,
    deleteItem, updateItemStatus, updateItem, saveSetting,
    getSyncSnapshot, mergeSyncData,
    clearLocalDB,
  };
}
