import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// IBM Plex Sans = UI/body. IBM Plex Mono = all figures (box numbers, SSNs/EINs,
// money). Wired as CSS variables consumed by globals.css (--font-plex-*).
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://trueform-w2.vercel.app"),
  title: "TrueForm · W-2 Review",
  description:
    "Upload a client's W-2s and get clean, structured data you can check and trust before it goes into your tax software.",
  openGraph: {
    title: "TrueForm: W-2 extraction you can trust",
    description:
      "Verify and correct extracted W-2 data fast: verifiable tax math, an independent second read, and source-linking.",
    url: "https://trueform-w2.vercel.app",
    siteName: "TrueForm",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
