import { IS_DEVELOPMENT_BUILD } from "~utils/config"

/**
 * Production builds stay HTTPS-only for SitePack matches/bindings.
 * Development builds may use HTTP for local/self-hosted debugging
 * (including local registry source workflows).
 */
export const allowsSitePackHttpOrigins = (): boolean => IS_DEVELOPMENT_BUILD
