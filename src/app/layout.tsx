import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { ConfigProvider } from "@/lib/ConfigContext";
import { Toaster } from "sonner";
import { RouteGuard } from "@/components/RouteGuard";
import { OfflineDrawer } from "@/components/layout/OfflineDrawer";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { BiometricPromptModal } from "@/components/BiometricPromptModal";

const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni-moda",
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "E-Global Pay | Secure Digital Wallet",
  description: "Next-generation financial technology and secure digital banking.",
  icons: {
    icon: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="preload"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
          as="style"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if ('fonts' in document) {
                  var timeout = setTimeout(function() {
                    document.documentElement.classList.add('material-symbols-loaded');
                  }, 2000);
                  document.fonts.load('1em "Material Symbols Outlined"').then(function() {
                    clearTimeout(timeout);
                    document.documentElement.classList.add('material-symbols-loaded');
                  }).catch(function() {
                    clearTimeout(timeout);
                    document.documentElement.classList.add('material-symbols-loaded');
                  });
                } else {
                  document.documentElement.classList.add('material-symbols-loaded');
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${bodoniModa.variable} ${hankenGrotesk.variable} antialiased custom-scrollbar flex flex-col min-h-screen`}
      >
        <ConfigProvider>
          <AuthProvider>
            <RouteGuard>
              {children}
            </RouteGuard>
            <OfflineDrawer />
            <ServiceWorkerRegister />
            <BiometricPromptModal />
          <Toaster
            position="top-center"
            style={{ top: "32px" }}
            toastOptions={{
              style: {
                background: "linear-gradient(135deg, #0c1324 0%, #141d30 100%)",
                border: "1px solid rgba(252, 122, 0, 0.25)",
                color: "#FFFFFF",
                fontFamily: "var(--font-hanken-grotesk), sans-serif",
                borderRadius: "16px",
                boxShadow: "none",
                marginTop: "16px",
              },
              classNames: {
                toast: "shadow-none border border-[#FC7A00]/20",
                title: "text-[#FFFFFF] font-bold text-[14px] font-hanken",
                description: "text-[#FFFFFF]/80 text-[12px] font-hanken",
              },
            }}
            icons={{
              success: (
                <span className="material-symbols-outlined text-[#95d3ba] text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                  check_circle
                </span>
              ),
              error: (
                <span className="material-symbols-outlined text-[#dc3545] text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                  error
                </span>
              ),
              info: (
                <span className="material-symbols-outlined text-[#FC7A00] text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                  info
                </span>
              ),
              warning: (
                <span className="material-symbols-outlined text-[#FC7A00] text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                  warning
                </span>
              ),
            }}
          />
          </AuthProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
