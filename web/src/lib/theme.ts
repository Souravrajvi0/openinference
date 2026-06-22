import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function initial(): Theme {
  const saved = localStorage.getItem("maas_theme");
  if (saved === "light" || saved === "dark") return saved;
  try {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("maas_theme", theme);
  }, [theme]);
  return {
    theme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
