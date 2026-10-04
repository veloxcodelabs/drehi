import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { bundledFontPath } from './fonts/load.ts';
import { buildLetterPdfFromSubmission } from './support_letter_service.ts';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit') as {
  openSync: (src: string) => { hasGlyphForCodePoint: (codePoint: number) => boolean };
};

function pdfStreams(pdf: Buffer): Map<number, Buffer> {
  const src = pdf.toString('latin1');
  const streams = new Map<number, Buffer>();
  let pos = 0;
  while (pos < src.length) {
    const objAt = src.indexOf(' 0 obj\n', pos);
    if (objAt < 0) break;
    const idStart = src.lastIndexOf('\n', objAt);
    const id = Number(src.slice(idStart + 1, objAt));
    const streamAt = src.indexOf('\nstream\n', objAt);
    const endobjAt = src.indexOf('\nendobj', objAt);
    if (streamAt !== -1 && (endobjAt === -1 || streamAt < endobjAt)) {
      const start = streamAt + '\nstream\n'.length;
      const end = src.indexOf('\nendstream', start);
      try {
        streams.set(id, zlib.inflateSync(Buffer.from(src.slice(start, end), 'latin1')));
      } catch {
        // not a flate stream
      }
      const next = src.indexOf('\nendobj', end);
      pos = next === -1 ? src.length : next + '\nendobj'.length;
    } else {
      pos = endobjAt === -1 ? src.length : endobjAt + '\nendobj'.length;
    }
  }
  return streams;
}

function parseCmap(body: string): Map<number, string> {
  const map = new Map<number, string>();
  const range = body.match(/beginbfrange\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/);
  if (!range) return map;
  let code = parseInt(range[1], 16);
  for (const part of range[3].match(/<([0-9A-Fa-f]+)>/g) || []) {
    map.set(code, String.fromCodePoint(parseInt(part.slice(1, -1), 16)));
    code += 1;
  }
  return map;
}

function pdfText(pdf: Buffer): string {
  const src = pdf.toString('latin1');
  const streams = pdfStreams(pdf);
  const fontToUnicode = new Map<number, number>();
  for (const chunk of src.split('endobj')) {
    const uni = chunk.match(/\/ToUnicode (\d+) 0 R/);
    const ids = chunk.match(/(\d+) 0 obj/g);
    if (!uni || !ids) continue;
    fontToUnicode.set(Number(ids[ids.length - 1].split(' ')[0]), Number(uni[1]));
  }
  const cmaps = new Map<string, Map<number, string>>();
  for (const resource of src.matchAll(/\/Font <<([\s\S]*?)>>/g)) {
    for (const match of resource[1].matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const uni = fontToUnicode.get(Number(match[2]));
      const stream = uni ? streams.get(uni) : undefined;
      if (stream) cmaps.set(match[1], parseCmap(stream.toString('latin1')));
    }
  }
  let text = '';
  for (const stream of streams.values()) {
    const content = stream.toString('latin1');
    if (!content.includes('TJ')) continue;
    let font = '';
    const op = /\/(F\d+)\s+[\d.]+\s+Tf|\[((?:<[^>]+>|\s|-?[\d.]+)*)\]\s*TJ/g;
    let match: RegExpExecArray | null;
    while ((match = op.exec(content))) {
      if (match[1]) {
        font = match[1];
        continue;
      }
      const cmap = cmaps.get(font);
      if (!cmap) continue;
      for (const hex of match[2].match(/<([0-9A-Fa-f]+)>/g) || []) {
        const digits = hex.slice(1, -1);
        for (let i = 0; i < digits.length; i += 4) {
          text += cmap.get(parseInt(digits.slice(i, i + 4), 16)) ?? '';
        }
      }
      text += '\n';
    }
  }
  return text;
}

test('a letter PDF can be rebuilt from saved submission fields without a file on disk', async () => {
  const buffer = await buildLetterPdfFromSubmission({
    id: 'existing-id',
    refNumber: 'MSL-LOI-2026-ABC123',
    companyName: 'Тест ЕООД',
    uic: '123456789',
    website: 'https://shop.example',
    contactName: 'Иван Иванов',
    role: 'Управител',
    email: 'ivan@shop.example',
    needs: ['По-висока конверсия в онлайн магазина'],
    motivation: 'Искаме пилот.',
    consentAccepted: true,
    createdAt: '2026-10-01T10:00:00.000Z',
  });
  assert.ok(buffer.length > 1000);
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
});

test('letter PDFs use the bundled Cyrillic fonts and draw Bulgarian text', async () => {
  for (const name of ['regular', 'bold', 'italic'] as const) {
    const fontPath = bundledFontPath(name);
    assert.equal(fontPath.includes('/usr/share'), false);
    assert.match(fontPath, /fonts\/LiberationSans-/);
    const font = fontkit.openSync(fontPath);
    for (const ch of 'ЗдравецХМБлагодаримдрехата„“') {
      assert.equal(font.hasGlyphForCodePoint(ch.codePointAt(0)!), true, `${name} missing ${ch}`);
    }
  }

  const buffer = await buildLetterPdfFromSubmission({
    id: 'font-check',
    refNumber: 'MSL-LOI-2026-FONT',
    companyName: '„Здравец ХМ“ ЕООД',
    uic: '206412964',
    website: 'https://shop.example',
    contactName: 'Здравко Лесичков',
    role: 'Управител',
    email: 'ivan@shop.example',
    needs: ['Клиентите не могат да си представят как дрехата ще им стои'],
    motivation: 'Искаме пилот за по-дълга дреха.',
    consentAccepted: true,
    createdAt: '2026-10-01T10:00:00.000Z',
  });

  const text = pdfText(buffer);
  assert.match(text, /ПИСМО ЗА НАМЕРЕНИЕ/);
  assert.match(text, /„Здравец ХМ“ ЕООД/);
  assert.match(text, /гр\. София 1505, ул\. „Царичина“ № 11/);
  assert.match(text, /Здравко Лесичков/);
  assert.match(text, /как дрехата ще им стои/);
  assert.match(text, /Искаме пилот за по-дълга дреха/);
  assert.match(buffer.toString('latin1'), /LiberationSans/);
});
