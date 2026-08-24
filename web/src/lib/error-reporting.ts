/**
 * Runtime error reporting.
 *
 * Previously this forwarded errors to an external editor's telemetry;
 * standalone it records to the console only, so nothing about the app's
 * runtime errors ever leaves the machine it runs on.
 */
export function reportDiagnostic(error: unknown, context?: Record<string, unknown>): void {
  const label = context ? ` (${JSON.stringify(context)})` : "";
  console.error(`[diagnostic]${label}`, error);
}
