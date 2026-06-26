import { useState, useEffect, useCallback, useRef } from "react";

/* ─── Constants ───────────────────────────────────── */
export const DB_NAME        = "VoiceRecorderDB";
export const DB_VERSION     = 2;
export const STORE_RECORDINGS = "recordings";
export const STORE_A2T      = "a2t_results";
export const WARN_MB        = 50;
export const CRITICAL_MB    = 200;

/* ─── IndexedDB helpers ───────────────────────────── */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_RECORDINGS))
        database.createObjectStore(STORE_RECORDINGS, { keyPath: "id" });
      if (!database.objectStoreNames.contains(STORE_A2T))
        database.createObjectStore(STORE_A2T, { keyPath: "recordingId" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export function dbSaveRecording(db, rec) {
  return new Promise((resolve, reject) => {
    const entry = {
      id: rec.id, name: rec.name, blob: rec.blob,
      size: rec.size, duration: rec.duration,
      createdAt: rec.createdAt.toISOString(),
    };
    const tx = db.transaction(STORE_RECORDINGS, "readwrite");
    tx.objectStore(STORE_RECORDINGS).put(entry);
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

export function dbSaveA2T(db, recordingId, jsonData) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_A2T, "readwrite");
    tx.objectStore(STORE_A2T).put({ recordingId, data: jsonData });
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

/* ─── Hook ────────────────────────────────────────── */
export default function useOrganizerDB() {
  const dbRef        = useRef(null);
  const [recordings,  setRecordings]  = useState([]);
  const [a2tResults,  setA2tResults]  = useState({}); // { [recordingId]: jsonData }
  const [dbWarning,   setDbWarning]   = useState(null);

  /* DB size warning */
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

  /* Boot */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const db = await openDB();
        dbRef.current = db;
        const [saved, savedA2T] = await Promise.all([
          dbLoadAllRecordings(db),
          dbLoadAllA2T(db),
        ]);
        saved.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const restored = saved.map((e) => ({
          id: e.id, name: e.name, blob: e.blob,
          url: URL.createObjectURL(e.blob),
          size: e.size, duration: e.duration,
          createdAt: new Date(e.createdAt),
        }));
        const a2tMap = {};
        savedA2T.forEach((r) => { a2tMap[r.recordingId] = r.data; });
        if (mounted) {
          setRecordings(restored);
          setA2tResults(a2tMap);
          computeDBWarning(restored);
        }
      } catch (err) {
        console.error("IndexedDB boot failed:", err);
      }
    })();
    return () => { mounted = false; };
  }, [computeDBWarning]);

  /* Add a recording */
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

  /* Delete a recording + its A2T result */
  const deleteRecording = useCallback(async (id) => {
    setRecordings((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      if (i === -1) return prev;
      URL.revokeObjectURL(prev[i].url);
      const next = [...prev.slice(0, i), ...prev.slice(i + 1)];
      computeDBWarning(next);
      return next;
    });
    setA2tResults((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (dbRef.current) {
      try {
        await dbDeleteRecording(dbRef.current, id);
        await dbDeleteA2T(dbRef.current, id);
      } catch (err) { console.error("Failed to delete:", err); }
    }
  }, [computeDBWarning]);

  /* Save A2T result */
  const saveA2TResult = useCallback(async (recordingId, data) => {
    setA2tResults((prev) => ({ ...prev, [recordingId]: data }));
    if (dbRef.current) {
      try { await dbSaveA2T(dbRef.current, recordingId, data); }
      catch (err) { console.error("Failed to save A2T result:", err); }
    }
  }, []);

  return {
    dbRef,
    recordings, a2tResults, dbWarning,
    addRecording, deleteRecording, saveA2TResult,
  };
}
