import Head from "next/head";
import { useEffect, useState } from "react";
import useOrganizerDB from "../hooks/useOrganizerDB";
import TabBar         from "../components/TabBar";
import Dashboard      from "../components/Dashboard";
import VoiceRecorder  from "../components/VoiceRecorder";
import HistoryList    from "../components/HistoryList";
import Settings       from "../components/Settings";
import pageStyles     from "../styles/page.module.css";

const API_URL = "https://decode-cri.vercel.app/a2t/transcribe";
const SHOW_COMPLETED_KEY = "voxie_show_completed_items";

export default function Home() {
  const [activeTab,          setActiveTab]          = useState("today");
  const [autoA2TStatus,      setAutoA2TStatus]      = useState(null); // null | "processing" | "done" | "error"
  const [showCompletedItems, setShowCompletedItems] = useState(false);

  const {
    recordings, a2tResults, items, dbWarning,
    addRecording, deleteRecording, saveA2TResult, deleteItem, updateItemStatus,
  } = useOrganizerDB();

  useEffect(() => {
    const savedValue = window.localStorage.getItem(SHOW_COMPLETED_KEY);
    if (savedValue === "true") setShowCompletedItems(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SHOW_COMPLETED_KEY, String(showCompletedItems));
  }, [showCompletedItems]);

  /* When a recording is saved, persist it then stay on Record tab
     (auto-A2T will navigate to Today when done; manual stays in History) */
  async function handleRecordingSaved(rec) {
    await addRecording(rec);
  }

  /* Auto-A2T — called by VoiceRecorder when recording qualifies */
  async function handleAutoA2T(rec) {
    setAutoA2TStatus("processing");

    // Get current date in local time
    const today = new Date();

    const year = today.getFullYear();
    // Months are 0-indexed, so add 1 and pad with a leading zero if needed
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const formattedDate = `${year}-${month}-${day}`;

    const formData = new FormData();
    formData.append("user_name", "SunilK");
    formData.append("client_time", formattedDate);
    formData.append("file", rec.blob, "recording.webm");
    try {
      const res = await fetch(API_URL, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      await saveA2TResult(rec.id, data, rec.createdAt.toDateString());
      setAutoA2TStatus("done");
      // Navigate to Today tab so user sees the extracted items
      setActiveTab("today");
      // Clear status after 3 seconds
      setTimeout(() => setAutoA2TStatus(null), 3000);
    } catch (err) {
      console.error("Auto-A2T failed:", err);
      setAutoA2TStatus("error");
      setTimeout(() => setAutoA2TStatus(null), 4000);
    }
  }

  return (
    <>
      <Head>
        <title>Voxie</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
      </Head>

      <div className={pageStyles.shell}>
        {/* ── Tab content ── */}
        <div className={pageStyles.content}>
          {activeTab === "today" && (
            <Dashboard
              items={items}
              onRecordPress={() => setActiveTab("record")}
              onDeleteItem={deleteItem}
              onStatusChange={updateItemStatus}
              showCompletedItems={showCompletedItems}
            />
          )}
          {activeTab === "record" && (
            <VoiceRecorder
              onRecordingSaved={handleRecordingSaved}
              onAutoA2T={handleAutoA2T}
              autoA2TStatus={autoA2TStatus}
            />
          )}
          {activeTab === "history" && (
            <HistoryList
              recordings={recordings}
              a2tResults={a2tResults}
              items={items}
              dbWarning={dbWarning}
              onDelete={deleteRecording}
              onSaveA2T={saveA2TResult}
            />
          )}
          {activeTab === "settings" && (
            <Settings
              dbWarning={dbWarning}
              recordingsCount={recordings.length}
              showCompletedItems={showCompletedItems}
              onToggleShowCompleted={() => setShowCompletedItems((prev) => !prev)}
            />
          )}
        </div>

        {/* ── Bottom tab bar ── */}
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>
    </>
  );
}
