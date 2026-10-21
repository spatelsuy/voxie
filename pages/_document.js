import { Html, Head, Main, NextScript } from "next/document";

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Roboto:wght@400;500;700&family=Lato:wght@400;700&family=Merriweather:wght@400;700&display=swap";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
