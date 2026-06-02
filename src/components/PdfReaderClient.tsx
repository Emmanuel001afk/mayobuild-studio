import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { FileText, ChevronLeft, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { callRouter } from "@/lib/router.functions";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

export default function PdfReaderClient() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const route = useServerFn(callRouter);

  const onFile = useCallback((f: File | null) => {
    setFile(f); setPage(1); setSummary("");
  }, []);

  async function summarize() {
    if (!file) return;
    setBusy(true);
    try {
      // extract text in browser
      const ab = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: ab }).promise;
      let text = "";
      for (let i = 1; i <= Math.min(pdf.numPages, 25); i++) {
        const p = await pdf.getPage(i);
        const c = await p.getTextContent();
        text += c.items.map((it: any) => it.str).join(" ") + "\n";
      }
      const res = await route({
        data: {
          task: "website", // cheap chain for summaries
          prompt: `Summarize this document in 6 concise bullet points:\n\n${text.slice(0, 12000)}`,
        },
      });
      if (res.kind === "text") setSummary(res.text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-card p-4">
      <div className="flex items-center gap-3 mb-3">
        <FileText className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">PDF Reader</h3>
      </div>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="mb-input mb-3"
      />
      {file && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="mb-btn-ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-muted-foreground">Page {page} / {numPages}</span>
              <button className="mb-btn-ghost" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button className="mb-btn" onClick={summarize} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Summarize
            </button>
          </div>
          <div className="bg-background rounded-md border border-border overflow-auto max-h-[60vh] flex justify-center">
            <Document file={file} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page pageNumber={page} width={Math.min(720, window.innerWidth - 80)} />
            </Document>
          </div>
          {summary && (
            <div className="mb-card p-3 whitespace-pre-wrap text-sm">{summary}</div>
          )}
        </div>
      )}
    </div>
  );
}
