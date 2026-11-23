// PDF.js version required by pdfx 2.11. Loaded only when a PDF widget opens.
// This external file works with a strict CSP and does not block Flutter startup.
(() => {
  const base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/';
  let pending;
  globalThis.spaceLoadPdfJs = () => pending ||= import(`${base}build/pdf.min.mjs`).then(pdfjs => {
    globalThis.pdfjsLib = pdfjs;
    pdfjs.GlobalWorkerOptions.workerSrc = `${base}build/pdf.worker.min.mjs`;
    globalThis.pdfRenderOptions = {cMapUrl: `${base}cmaps/`, cMapPacked: true, isEvalSupported: false};
  }).catch(error => { pending = undefined; throw error; });
})();
