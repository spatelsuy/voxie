import Head from "next/head";
import { useState } from "react";
import useOrganizerDB from "../hooks/useOrganizerDB";
import TabBar         from "../components/TabBar";
import Dashboard      from "../components/Dashboard";
import VoiceRecorder  from "../components/VoiceRecorder";
import HistoryList    from "../components/HistoryList";
import Settings       from "../components/Settings";
import pageStyles     from "../styles/page.module.css";

export default function Home() {
  const [activeTab, setActiveTab] = useState("today");

  const {
    recordings, a2tResults, items, dbWarning,
    addRecording, deleteRecording, saveA2TResult, deleteItem,
  } = useOrganizerDB();

  /* When a recording is saved, persist it then jump to History */
  async function handleRecordingSaved(rec) {
    await addRecording(rec);
    setActiveTab("history");
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
            />
          )}
          {activeTab === "record" && (
            <VoiceRecorder onRecordingSaved={handleRecordingSaved} />
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
            />
          )}
        </div>

        {/* ── Bottom tab bar ── */}
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>
    </>
  );
}
