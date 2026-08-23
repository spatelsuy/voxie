import Head from "next/head";
import { useState, useEffect } from "react";

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Roboto:wght@400;500;700&family=Lato:wght@400;700&family=Merriweather:wght@400;700&display=swap";

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
  const [activeTab, setActiveTab] = useState("record");

  // Read ?tab= from URL after mount — avoids SSR/hydration mismatch
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    if (["record","today","history","profile","settings"].includes(p)) {
      setActiveTab(p);
    }
  }, []);
  const [autoA2TStatus,   setAutoA2TStatus]   = useState(null); // null | "processing" | "done" | "error"
  const [showOnboarding,  setShowOnboarding]  = useState(false);
  const [liveTranscript,  setLiveTranscript]  = useState("");   // built up from silence-cut segments

  const {
    recordings, a2tResults, a2tStatuses, items, settings, dbWarning,
    addRecording, deleteRecording, renameRecording,
    markA2TPending, markA2TFailed, saveA2TResult,
    deleteItem, updateItemStatus, updateItem, saveSetting,
    getSyncSnapshot, mergeSyncData,
    clearLocalDB,
  } = useOrganizerDB();

  // Apply font whenever settings.fontFamily changes (must be after useOrganizerDB)
  useEffect(() => {
    const DEFAULT_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif";
    const font = settings?.fontFamily || DEFAULT_FONT;
    document.documentElement.style.setProperty("--app-font", font);
  }, [settings?.fontFamily]);

  async function handleRecordingSaved(rec) {
    await addRecording(rec);
  }

  /**
   * Called per silence-cut segment by ContinuousTranscriber (via VoiceRecorder).
   * Appends the already-transcribed text to liveTranscript.
   */
  function handleTranscriptChunk(text) {
    if (!text) return;
    setLiveTranscript((prev) => prev ? prev + " " + text : text);
  }

  /**
   * Called by VoiceRecorder after Stop, once all segments have been flushed.
   * `transcript` is the fully-accumulated liveTranscript; we send it straight
   * to the text-extraction API — no need to re-transcribe the audio blob.
   */
  async function handleAutoA2T(rec, transcript) {
    const fullTranscript = (transcript || liveTranscript || "").trim();

    // Nothing was said — recording already saved by VoiceRecorder, just reset UI
    if (!fullTranscript) {
      setAutoA2TStatus(null);
      setLiveTranscript("");
      return;
    }

    setAutoA2TStatus("processing");
    await markA2TPending(rec.id);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 60000);

    try {

      const formData = new FormData();
      formData.append("user_name",   settings.userName || "SunilK");
      formData.append("client_time", getFormattedDate());
      formData.append("text", fullTranscript);

      const res = await fetch(TEXT_API_URL, { method: "POST", body: formData, signal: controller.signal });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      await saveA2TResult(rec.id, { ...data, transcription_text: fullTranscript }, rec.createdAt.toDateString());
      setAutoA2TStatus("done");
      setTimeout(() => { setAutoA2TStatus(null); setLiveTranscript(""); }, 3000);
    } catch (err) {
      console.error("Auto-A2T failed:", err);
      await markA2TFailed(rec.id);
      setAutoA2TStatus("error");
      setTimeout(() => { setAutoA2TStatus(null); setLiveTranscript(""); }, 4000);
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
        <link rel="icon" type="image/png" href="/K_ico.png" />
        <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
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
              scheduleWindow={settings.scheduleWindow ?? 10}
            />
          )}
          {activeTab === "record" && !showOnboarding && (
            <VoiceRecorder
              onRecordingSaved={handleRecordingSaved}
              onAutoA2T={handleAutoA2T}
              onTextSubmit={handleTextSubmit}
              autoA2TStatus={autoA2TStatus}
              onLearnMore={() => setShowOnboarding(true)}
              liveTranscript={liveTranscript}
              onTranscriptChunk={handleTranscriptChunk}
              silenceSec={settings.silenceSec ?? 2}
              userName={settings.userName || "SunilK"}
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
              onRename={renameRecording}
              onSaveA2T={saveA2TResult}
              onMarkFailed={markA2TFailed}
            />
          )}
          {activeTab === "profile" && (
            <Profile
              onGetSyncData={getSyncSnapshot}
              onMergeSync={mergeSyncData}
              storageBackend={settings.storageBackend}
              onSaveSetting={saveSetting}
              onClearLocalDB={clearLocalDB}
              items={items}
            />
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
