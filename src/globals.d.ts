declare namespace YT {
  interface PlayerOptions {
    videoId: string;
    playerVars?: Record<string, string | number>;
    events?: { onReady?: () => void; onStateChange?: () => void };
  }
  class Player {
    constructor(element: HTMLElement, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    cueVideoById(videoId: string): void;
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
  google?: {
    accounts: {
      id: {
        initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
        renderButton(element: HTMLElement, options: Record<string, string>): void;
      };
    };
  };
}
