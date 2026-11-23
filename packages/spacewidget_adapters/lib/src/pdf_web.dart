import 'dart:js_interop';

@JS('pdfjsLib')
external JSObject? get _pdfjs;
@JS('spaceLoadPdfJs')
external JSFunction? get _loader;
@JS('spaceLoadPdfJs')
external JSPromise<JSAny?> _load();

/// A host may install PDF.js itself, or supply the CSP-compatible lazy loader
/// included in the example and Studio web hosts. No PDF code loads for a shop.
Future<void> ensureSpacePdfEngine() async {
  if (_pdfjs != null) {
    return;
  }
  if (_loader != null) {
    await _load().toDart;
  }
  if (_pdfjs == null) {
    throw StateError(
      'PDF viewer is not configured. Install the PDF.js web loader or open the document in your browser.',
    );
  }
}
