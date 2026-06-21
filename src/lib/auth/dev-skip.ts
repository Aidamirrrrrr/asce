/**
 * Dev-обход авторизации. Включается ТОЛЬКО вне production и при DEV_AUTH_SKIP=true.
 * Даёт вход одной кнопкой под фиксированным dev-пользователем — удобно для локалки.
 */
export const DEV_USER_EMAIL = "dev@asce.local";

export function isDevAuthSkip(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_SKIP === "true";
}
