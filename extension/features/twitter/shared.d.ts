/**
 * Type declarations for the fragile Twitter/X DOM integration module.
 * This file (shared.js) is intentionally kept as plain JS to isolate
 * DOM selector brittleness from the TypeScript build.
 */

export interface TwitterMenuProviderContext {
  tweetUrl: string;
  tweetTitle: string;
  hasVideo: boolean;
  article?: Element | null;
  mediaRoot?: Element | null;
  isFullscreen?: boolean;
}

export interface TwitterMenuItem {
  label: string;
  onClick: () => void | Promise<void>;
}

export declare const isTwitter: (url: string) => boolean;
export declare function getTweetUrl(scope?: Element | null): string;
export declare function getTweetTitle(scope?: Element | null): string;
export declare function registerTwitterMenuProvider(
  id: string,
  provider: (context: TwitterMenuProviderContext) => TwitterMenuItem[],
): () => void;
export declare function safeSendMessage(
  message: Record<string, unknown>,
): Promise<{ success: boolean; error?: string } | null>;
