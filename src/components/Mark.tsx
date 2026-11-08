import { APE_SVG } from "./ape-mark.ts";

export function Mark({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 64" className={className} aria-hidden dangerouslySetInnerHTML={{ __html: APE_SVG }} />;
}
