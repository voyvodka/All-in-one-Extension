/**
 * Type declarations for the fragile YouTube DOM integration module.
 * This file (shared.js) is intentionally kept as plain JS to isolate
 * DOM selector brittleness from the TypeScript build.
 */

export interface YoutubeShareTargetOptions {
  attr: string;
  label: string;
  onClick: (event: MouseEvent) => void | Promise<void>;
}

export declare const isYoutube: (url: string) => boolean;
export declare function getYoutubeVideoId(): string | null;
export declare function getYoutubeVideoTitle(): string | null;
export declare function createYoutubeShareTarget(
  container: HTMLElement,
  options: YoutubeShareTargetOptions,
): HTMLElement | null;
