// Type declarations for YouTube IFrame API globals
// This file makes the TS compiler aware of the callback and YT global used in Laptop.vue

export {};

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }

  const YT: any;
}
