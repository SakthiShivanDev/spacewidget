/// Matches only a configured return destination, including its fixed query
/// parameters. A lookalike host or path never triggers an integration callback.
bool spaceMatchesReturnUri(Uri candidate, Uri expected) {
  if (expected.scheme.isEmpty ||
      expected.host.isEmpty ||
      candidate.userInfo.isNotEmpty ||
      candidate.scheme != expected.scheme ||
      candidate.host != expected.host ||
      candidate.port != expected.port ||
      candidate.path != expected.path ||
      candidate.hasFragment) {
    return false;
  }
  return expected.queryParametersAll.entries.every((entry) {
    final actual = candidate.queryParametersAll[entry.key];
    return actual != null &&
        actual.length == entry.value.length &&
        List.generate(
          actual.length,
          (i) => actual[i] == entry.value[i],
        ).every((v) => v);
  });
}
