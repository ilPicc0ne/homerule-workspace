import type { Metadata, Viewport } from "next";
import { Overpass, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Overpass descends from Highway Gothic, the lettering on US street signs.
const overpass = Overpass({
  variable: "--font-overpass",
  subsets: ["latin"],
});

// Law text is quoted in a book serif, so a quote never reads as our own words.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const title = "HomeRule: your rights as a renter, for your exact address";

export const metadata: Metadata = {
  title,
  description:
    "Enter a US apartment address and see which housing rules apply there today and what is about to change: quoted from the law, dated, with an honest unknown where the data can't decide. Coming soon for California, New Jersey and Massachusetts. Not legal advice.",
  applicationName: "HomeRule",
  openGraph: {
    title,
    description:
      "A model has a training cutoff. A law has an effective date. Housing rules for your address, quoted from the law and dated. Coming soon. Not legal advice.",
    siteName: "HomeRule",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title,
    description: "Housing rules for your address, quoted from the law and dated. Coming soon. Not legal advice.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a16" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${overpass.variable} ${sourceSerif.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
