import { SessionProvider } from "next-auth/react";
import Head from "next/head";
import { useEffect } from "react";
import "../styles/globals.css";

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  /* Register service worker once on mount */
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.error("SW registration failed:", err));
    }
  }, []);

  return (
    <SessionProvider session={session}>
      <Head>
        {/* ── PWA manifest ── */}
        <link rel="manifest" href="/manifest.json" />

        {/* ── Theme colour — browser chrome on Android ── */}
        <meta name="theme-color" content="#0284c7" />

        {/* ── iOS Safari PWA ── */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kahija" />
        <link rel="apple-touch-icon" href="/K_Logo.png" />

        {/* ── MS Tiles (Windows / Edge) ── */}
        <meta name="msapplication-TileImage" content="/K_Logo.png" />
        <meta name="msapplication-TileColor" content="#0284c7" />
      </Head>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
