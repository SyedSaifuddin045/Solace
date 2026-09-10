import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serifPreset = Playfair_Display({ variable: "--font-serif-preset", subsets: ["latin"] });
const monoPreset = JetBrains_Mono({ variable: "--font-mono-preset", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Solace",
  description: "a quiet room for the same evening",
};

const THEME_SCRIPT = `try{var p=JSON.parse(localStorage.getItem('solace.prefs')||'{}');var t=p.theme||{};var c={amber:['#E0A458','#9B7BB8','#C98A8A'],violet:['#9B7BB8','#7E5F9E','#C98A8A'],rose:['#C98A8A','#9B7BB8','#B96E6E'],info:['#8FA6C9','#9B7BB8','#C98A8A'],success:['#7FAE8B','#9B7BB8','#C98A8A']}[t.accent]||['#E0A458','#9B7BB8','#C98A8A'];var s=document.documentElement.style;s.setProperty('--accent-amber',c[0]);s.setProperty('--accent-violet',c[1]);s.setProperty('--accent-rose',c[2]);s.setProperty('--glow',(Math.min(100,Math.max(0,t.glow??100)))+'%');s.setProperty('--dim',(Math.min(100,Math.max(0,t.dim??55)))+'%');s.setProperty('--blur',(Math.min(20,Math.max(8,t.blur??14)))+'px');}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${serifPreset.variable} ${monoPreset.variable} h-full antialiased`}
    >
    <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}