import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { FundOSProvider } from "@/providers/FundOSProvider";
import { DisplayPreferencesProvider } from "@/providers/DisplayPreferencesProvider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FundOS — All In Capital",
  description:
    "Venture capital operating system — funds, portfolio, valuations and deployment.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className={`${jakarta.className} font-sans antialiased`}>
        <FundOSProvider>
          <DisplayPreferencesProvider>{children}</DisplayPreferencesProvider>
        </FundOSProvider>
      </body>
    </html>
  );
}
