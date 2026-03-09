// Shared helper for building consistent booking titles across Google Calendar events
// Usage: create-admin-booking, update-admin-booking

export function buildBookingTitle(args: {
  serviceLabel: string | null | undefined;
  firstName?: string | null;
  lastName?: string | null;
  isTest?: boolean | null;
}): string | null {
  const serviceLabel = (args.serviceLabel || "").trim();
  if (!serviceLabel) return null;

  const clientName = [args.firstName, args.lastName]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(" ");

  const baseTitle = clientName
    ? `${serviceLabel} (${clientName})`
    : serviceLabel;

  return args.isTest === true
    ? `[TEST] ${baseTitle}`
    : baseTitle;
}
