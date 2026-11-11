"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface CpanelThemeContextType {
  theme: "light" | "dark";
  isDark: boolean;
  toggleTheme: () => void;
}

const CpanelThemeContext = createContext<CpanelThemeContextType>({
  theme: "light",
  isDark: false,
  toggleTheme: () => {},
});

export function CpanelThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const syncTheme = () => {
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem("cpanel_theme");
        if (cached === "dark" || cached === "light") {
          setTheme(cached);
        }
      }
    };

    syncTheme();

    const handleThemeChange = () => syncTheme();
    window.addEventListener("cpanel_theme_change", handleThemeChange);
    window.addEventListener("storage", handleThemeChange);

    return () => {
      window.removeEventListener("cpanel_theme_change", handleThemeChange);
      window.removeEventListener("storage", handleThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      if (typeof window !== "undefined") {
        localStorage.setItem("cpanel_theme", next);
        window.dispatchEvent(new Event("cpanel_theme_change"));
      }
      return next;
    });
  };

  return (
    <CpanelThemeContext.Provider value={{ theme, isDark: theme === "dark", toggleTheme }}>
      {children}
    </CpanelThemeContext.Provider>
  );
}

export function useCpanelTheme() {
  return useContext(CpanelThemeContext);
}
