import Head from "next/head";
import { useState } from "react";
import useOrganizerDB from "../hooks/useOrganizerDB";
import TabBar         from "../components/TabBar";
import Dashboard      from "../components/Dashboard";
import OnboardingPanel from "../components/OnboardingPanel";
import VoiceRecorder  from "../components/VoiceRecorder";
import HistoryList    from "../components/HistoryList";
import Profile        from "../components/Profile";
import Settings       from "../components/Settings";
import pageStyles     from "../styles/page.module.css";

const API_URL = "/api/transcribe";
const TEXT_API_URL = "/api/transcribe-text";

function getFormattedDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Home() {
  const [activeTab,       setActiveTab]       = useState("record"); // default: record screen
  const [autoA2TStatus,   setAutoA2TStatus]   = useState(null); // null | "processing" | "done" | "error"
  const [showOnboarding,  setShowOnboarding]  = useState(false);

  const {
    recordings, a2tResults, a2tStatuses, items, settings, dbWarning,
    addRecording, deleteRecording,
    markA2TPending, markA2TFailed, saveA2TResult,
    deleteItem, updateItemStatus, updateItem, saveSetting,
  } = useOrganizerDB();

  async function handleRecordingSaved(rec) {
    await addRecording(rec);
  }

  async function handleAutoA2T(rec) {
    setAutoA2TStatus("processing");
    await markA2TPending(rec.id); // Tier 2: persisted immediately

    const controller    = new AbortController();
    const timeoutId     = setTimeout(() => controller.abort(), 60000); // 60 s timeout
    const formattedDate = getFormattedDate();

    const formData = new FormData();
    formData.append("user_name", "SunilK");
    formData.append("client_time", formattedDate);
    formData.append("file", rec.blob, "recording.webm");
    try {
      const res = await fetch(API_URL, { method: "POST", body: formData, signal: controller.signal });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      await saveA2TResult(rec.id, data, rec.createdAt.toDateString()); // sets status "done"
      setAutoA2TStatus("done");
      // Don't force tab switch — user may have navigated elsewhere
      setTimeout(() => setAutoA2TStatus(null), 3000);
    } catch (err) {
      console.error("Auto-A2T failed:", err);
      await markA2TFailed(rec.id); // Tier 1+2: persisted as failed
      setAutoA2TStatus("error");
      setTimeout(() => setAutoA2TStatus(null), 4000);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function handleTextSubmit(text) {
    const createdAt = new Date();
    const rec = {
      id: Date.now(),
      name: "Text " + createdAt.toLocaleString("en-US", {
        month: "short", day: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
      }),
      blob: null,
      url: null,
      size: new Blob([text]).size,
      duration: 0,
      createdAt,
      kind: "text",
      text,
    };

    await addRecording(rec);

    try {
      const formData = new FormData();
      formData.append("user_name", "SunilK");
      formData.append("client_time", getFormattedDate());
      formData.append("text", text);

      const res = await fetch(TEXT_API_URL, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      await saveA2TResult(rec.id, data, rec.createdAt.toDateString());
      setAutoA2TStatus("done");
      setActiveTab("today");
      setTimeout(() => setAutoA2TStatus(null), 3000);
    } catch (err) {
      await deleteRecording(rec.id, false);
      console.error("Text submission failed:", err);
      throw new Error("Text submission failed. Please try again.");
    }
  }

  return (
    <>
      <Head>
        <title>Kahija</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
      </Head>

      <div className={pageStyles.shell}>
        {/* Onboarding overlay — used from Settings "How Voxie Works" */}
        {showOnboarding && activeTab !== "record" && (
          <div className={pageStyles.overlay}>
            <OnboardingPanel
              showClose
              onClose={() => setShowOnboarding(false)}
              onAction={() => setShowOnboarding(false)}
            />
          </div>
        )}
        <div className={pageStyles.content}>
          {activeTab === "today" && (
            <Dashboard
              items={items}
              a2tResults={a2tResults}
              onRecordPress={() => setActiveTab("record")}
              onDeleteItem={deleteItem}
              onStatusChange={updateItemStatus}
              onEditItem={updateItem}
              showCompletedItems={settings.showCompletedItems}
            />
          )}
          {activeTab === "record" && !showOnboarding && (
            <VoiceRecorder
              onRecordingSaved={handleRecordingSaved}
              onAutoA2T={handleAutoA2T}
              onTextSubmit={handleTextSubmit}
              autoA2TStatus={autoA2TStatus}
              onLearnMore={() => setShowOnboarding(true)}
            />
          )}
          {activeTab === "record" && showOnboarding && (
            <OnboardingPanel
              showClose
              onClose={() => setShowOnboarding(false)}
              onAction={() => setShowOnboarding(false)}
            />
          )}
          {activeTab === "history" && (
            <HistoryList
              recordings={recordings}
              a2tResults={a2tResults}
              a2tStatuses={a2tStatuses}
              items={items}
              dbWarning={dbWarning}
              onDelete={deleteRecording}
              onSaveA2T={saveA2TResult}
              onMarkFailed={markA2TFailed}
            />
          )}
          {activeTab === "profile" && (
            <Profile />
          )}
          {activeTab === "settings" && (
            <Settings
              dbWarning={dbWarning}
              recordingsCount={recordings.length}
              settings={settings}
              onSettingChange={saveSetting}
              onShowOnboarding={() => setShowOnboarding(true)}
            />
          )}
        </div>

        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>
    </>
  );
}
