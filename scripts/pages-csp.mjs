import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// GitHub Pages serves these static documents directly. Place the policy ahead
// of asset discovery and leave the development server/HMR configuration alone.
export async function applyPagesCsp(root) {
  let documents = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
        continue;
      }
      if (!entry.name.endsWith('.html')) continue;
      let html = await readFile(file, 'utf8');
      const existing =
        /<meta name="visionoir-build-policy"[^>]*>\s*<meta http-equiv="Content-Security-Policy"[^>]*>\s*<meta name="referrer"[^>]*>\s*/i;
      html = html.replace(existing, '');
      const config = html.match(/<script\b[^>]*id="site-config"[^>]*>([\s\S]*?)<\/script>/i);
      let country = '',
        contact = '',
        deliveryResponse = '';
      if (config) {
        const settings = JSON.parse(config[1]),
          endpoint = settings.geoEndpoint;
        if (endpoint) {
          const provider = new URL(endpoint);
          if (provider.protocol !== 'https:') throw Error('Expected HTTPS country endpoint');
          country = ' ' + provider.origin;
        }
        if (settings.contactEndpoint) {
          const delivery = new URL(settings.contactEndpoint);
          if (
            delivery.protocol !== 'https:' ||
            delivery.username ||
            delivery.password ||
            delivery.hash ||
            /[;,\s'"<>]/.test(delivery.pathname)
          )
            throw Error('Expected HTTPS contact endpoint without credentials, fragment or policy separators');
          contact = ' ' + delivery.origin + delivery.pathname;
          if (
            delivery.origin === 'https://script.google.com' &&
            /^\/macros\/s\/[\w-]+\/exec$/.test(delivery.pathname)
          ) {
            deliveryResponse = ' https://script.googleusercontent.com/macros/echo';
          }
        }
      }
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-src 'none'",
        contact ? 'form-action' + contact : "form-action 'none'",
        "font-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "manifest-src 'self'",
        "worker-src 'self'",
        "connect-src 'self' blob:" + country + contact + deliveryResponse,
      ].join('; ');
      const metadata =
        '<meta name="visionoir-build-policy" content="1">\n<meta http-equiv="Content-Security-Policy" content="' +
        policy +
        '">\n<meta name="referrer" content="no-referrer">\n';
      if (!/<head(?:\s[^>]*)?>/i.test(html)) throw Error('Missing HTML head in ' + file);
      await writeFile(
        file,
        html.replace(
          /<head(?:\s[^>]*)?>(?:\s*<meta\s+charset=[^>]+>)?\s*/i,
          (head) => head.trimEnd() + '\n' + metadata,
        ),
      );
      documents++;
    }
  }
  await walk(root);
  return documents;
}
