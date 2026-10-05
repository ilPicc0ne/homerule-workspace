import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import PrototypeBanner from "@/components/prototype-banner";
import SiteHeader from "@/components/site-header";
import { getDataset } from "@/lib/data";
import "./globals.css";

// One friendly, rounded sans for everything.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const description =
  "Your rights as a renter, for your exact address: which housing rules apply to your home, today and next, quoted and dated. Not legal advice.";

export const metadata: Metadata = {
  metadataBase: new URL("https://yourhomerule.com"),
  title: { default: "HomeRule", template: "HomeRule · %s" },
  description,
  applicationName: "HomeRule",
  openGraph: {
    title: "HomeRule",
    description,
    siteName: "HomeRule",
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: "HomeRule", description },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const data = getDataset();
  const dates = data?.meta.as_of_dates.map((d) => d.date) ?? [];
  return (
    <html lang="en" className={`${figtree.variable} antialiased`}>
      <body>
        <PrototypeBanner />
        <SiteHeader dates={dates} fallback={data?.meta.default_as_of ?? null} />
        {children}
        <footer className="wrap site-footer">
          <p>
            Not legal advice. HomeRule shows published housing rules that may apply to an address, with quotes and
            dates. It does not tell anyone what to do and is not a compliance certification.
          </p>
          <p>
            {data?.meta.data_source === "demo"
              ? "Demo data: hand-prepared from the challenge brief; the rule engine will replace it. Quotes are verbatim from the challenge corpus."
              : "Rules read from the law in the challenge corpus and supplemental official sources; results computed by the HomeRule rule engine. Quotes are verbatim."}{" "}
            Built at Hack-Nation 7 for the RealPage challenge.
          </p>
        </footer>
      </body>
    </html>
  );
}
