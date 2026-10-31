export const THEME_STORAGE_KEY = "theme";

// Runs in <head> before the first paint, so a dark page never flashes white.
// Until the user picks a theme, the page follows the system setting.
export const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}document.documentElement.classList.toggle("dark",t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches)})()`;
