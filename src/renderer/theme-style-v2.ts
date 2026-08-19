import type { CSSProperties } from "react";
import type { AppSettings } from "../shared/contracts";

export function themeStyleV2(settings: AppSettings | null): CSSProperties {
  if (!settings) return {};
  return {
    "--theme-accent": settings.theme.accent,
    "--theme-font-ui": settings.theme.uiFont,
    "--theme-font-code": settings.theme.codeFont,
    fontFamily: `${settings.theme.uiFont}, "Segoe UI Variable Text", "Segoe UI", sans-serif`
  } as CSSProperties;
}
