import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// One friendly, rounded sans for everything.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const description =
  "Your rights as a renter, for your exact address. See which housing rules apply to your home, today and next. Coming soon. Not legal advice.";

const shareText = "See which housing rules apply to your home, quoted from the law and dated. Coming soon.";

export const metadata: Metadata = {
  title: "HomeRule",
  description,
  applicationName: "HomeRule",
  openGraph: {
    title: "HomeRule",
    description: shareText,
    siteName: "HomeRule",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "HomeRule",
    description: shareText,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfcfa" },
    { media: "(prefers-color-scheme: dark)", color: "#10181a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
