let apiReady: Promise<void> | null = null;

/** Loads YouTube's player script once, however many players the page ends up using. */
export function loadYouTubeApi(): Promise<void> {
  apiReady ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      apiReady = null;
      reject(new Error("YouTube player failed to load"));
    };
    document.head.append(script);
  });
  return apiReady;
}
