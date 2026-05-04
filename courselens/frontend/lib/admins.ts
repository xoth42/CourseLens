export const ADMIN_EMAILS = [
  "bpwhite@umass.edu",
  "ipelenur@umass.edu",
  "llam@umass.edu",
  "rchahid@umass.edu",
  "sreshtapothu@umass.edu",
  "zgibson@umass.edu",
];

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
