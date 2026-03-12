/**
 * Type declarations for the fragile Instagram DOM integration module.
 * This file (shared.js) is intentionally kept as plain JS to isolate
 * DOM selector brittleness from the TypeScript build.
 */

export interface MediaSource {
  url: string;
  ext?: string;
  type?: string;
}

export interface InstagramMediaContext {
  bestVideo?: MediaSource | null;
  bestImage?: MediaSource | null;
  visibleImage?: MediaSource | null;
  images?: MediaSource[];
  hasVideo?: boolean;
}

export interface InstagramMenuProviderContext {
  reelUrl: string;
  reelTitle: string;
  activeArticle: Element | null;
  media: InstagramMediaContext;
}

export interface InstagramMenuItem {
  label: string;
  action: () => void | Promise<void>;
}

export interface InstagramScopeResult {
  scope: Element | null;
  article: Element | null;
}

export interface InstagramMediaSources {
  bestVideo?: MediaSource | null;
  bestImage?: MediaSource | null;
  visibleImage?: MediaSource | null;
  images?: MediaSource[];
  hasVideo?: boolean;
}

export declare const isInstagram: (url: string) => boolean;
export declare const INSTAGRAM_DOWNLOAD_MENU_ATTR: string;

export declare function registerInstagramMenuProvider(
  id: string,
  provider: (context: InstagramMenuProviderContext) => InstagramMenuItem[]
): () => void;

export declare function safeSendMessage(
  message: Record<string, unknown>
): Promise<{ success: boolean; error?: string } | null>;

export declare function findInstagramMediaSources(
  scope: Element | Document
): InstagramMediaSources;

export declare function detectInstagramScope(): InstagramScopeResult;
