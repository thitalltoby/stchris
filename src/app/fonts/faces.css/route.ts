import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Activates licensed brand fonts without a code change. Drop files named <Family>-<Weight>.woff2 into public/fonts/
 * (for example TTFirsNeue-Regular.woff2, UniSans-Heavy.woff2, Gotham-Medium.woff2,
 * Noah-Bold.woff2) and this stylesheet declares them. Only files that exist are declared, so there are no failed
 * requests. Until then the bundled open-source stand-ins (Montserrat and Plus Jakarta Sans) are used.
 */
export const dynamic = 'force-dynamic';

const FAMILIES: Record<string, string> = { ttfirsneue: 'TT Firs Neue', unisans: 'Uni Sans', gotham: 'Gotham', noah: 'Noah' };
const WEIGHTS: Record<string, number> = { thin: 100, extralight: 200, light: 300, book: 400, regular: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, heavy: 800, black: 900, ultra: 900 };
const FORMAT: Record<string, string> = { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' };

export function GET() {
  let files: string[] = [];
  try { files = readdirSync(join(process.cwd(), 'public', 'fonts')); } catch { /* no folder: nothing to declare */ }
  const rules: string[] = [];
  for (const f of files.sort()) {
    const m = /^([A-Za-z]+)-([A-Za-z]+?)(Italic)?\.(woff2|woff|otf|ttf)$/.exec(f);
    if (!m) continue;
    const family = FAMILIES[m[1]!.toLowerCase()];
    const weight = WEIGHTS[m[2]!.toLowerCase()];
    if (!family || !weight) continue;
    rules.push(`@font-face{font-family:'${family}';font-weight:${weight};font-style:${m[3] ? 'italic' : 'normal'};font-display:swap;src:url('/fonts/${encodeURIComponent(f)}') format('${FORMAT[m[4]!]}');}`);
  }
  return new Response(rules.join('\n') + '\n', { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
