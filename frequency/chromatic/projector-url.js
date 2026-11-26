export function projectorUrl({ origin, pathname }, language, outputId) {
  const url = new URL(origin);
  url.pathname = pathname;
  url.search = new URLSearchParams({ lang: language, view: 'vj', output: outputId });
  return url.href;
}
