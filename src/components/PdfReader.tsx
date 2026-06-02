import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";

const PdfReaderClient = lazy(() => import("./PdfReaderClient"));

function Fallback() {
  return (
    <div className="mb-card p-4">
      <div className="flex items-center gap-3 mb-3">
        <FileText className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">PDF Reader</h3>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading reader…
      </div>
    </div>
  );
}

export function PdfReader() {
  return (
    <ClientOnly fallback={<Fallback />}>
      <Suspense fallback={<Fallback />}>
        <PdfReaderClient />
      </Suspense>
    </ClientOnly>
  );
}
