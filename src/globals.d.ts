declare namespace YT {
  interface PlayerOptions {
    videoId: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: { onReady?: () => void; onStateChange?: (event: { data: number }) => void; onError?: () => void };
  }
  class Player {
    constructor(element: HTMLElement, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    cueVideoById(videoId: string): void;
    loadVideoById(videoId: string): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    getPlaybackRate(): number;
    setPlaybackRate(rate: number): void;
    setVolume(volume: number): void;
    mute(): void;
    unMute(): void;
    destroy(): void;
  }
}

interface Window {
  YT?: { Player: typeof YT.Player };
  onYouTubeIframeAPIReady?: () => void;
}
