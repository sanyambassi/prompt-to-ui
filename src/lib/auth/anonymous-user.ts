export const ANONYMOUS_USER_ID = "00000000-0000-0000-0000-000000000000";

const ANONYMOUS_USER = {
  id: ANONYMOUS_USER_ID,
  email: "local@localhost",
} as const;

export function getUser() {
  return ANONYMOUS_USER;
}
