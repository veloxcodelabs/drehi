import PDFDocument from 'pdfkit';

export interface LetterParticipantData {
  companyName: string;
  uic: string;
  website: string;
  contactName: string;
  role: string;
  email: string;
  needs: string[];
  motivation?: string;
  consentAccepted: boolean;
  accessCode?: string;
  lastImageUrl?: string;
}

const NEED_TRANSLATIONS: Record<string, string> = {
  'Клиентите не могат да си представят как дрехата ще им стои':
    'Shoppers struggle to visualize how garments look on their body',
  'Връщания заради размер, кройка или разлика спрямо снимката':
    'High returns due to size, fit, or discrepancy from catalog photos',
  'Много цветове и размери на един модел':
    'Complex management of multiple color and size variations per model',
  'По-висока конверсия в онлайн магазина':
    'Driving higher visitor engagement and purchase conversion rates in the web shop',
};

// Formats timestamp in Europe/Sofia timezone: "03.10.2026 г., 14:18 ч." (no double "г.")
function formatSofiaDateTime(date: Date): { bgDateStr: string; enDateStr: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const p: Record<string, string> = {};
  parts.forEach((item) => {
    p[item.type] = item.value;
  });

  const bgDateStr = `${p.day}.${p.month}.${p.year} г., ${p.hour}:${p.minute} ч.`;
  const enDateStr = `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute} (Sofia time)`;

  return { bgDateStr, enDateStr };
}

export async function generateSupportLetterPdf(
  data: LetterParticipantData,
  refNumber: string,
  timestamp: Date = new Date()
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 32, bottom: 0, left: 36, right: 36 },
        autoFirstPage: false,
        bufferPages: true,
        info: {
          Title: `Letter of Intent / Support - ${refNumber}`,
          Author: 'Martitony Style Lab (Space Code EOOD)',
          Subject: 'AI Virtual Try-On Pilot Program Letter of Intent',
          Keywords: 'AI, Fashion Tech, Letter of Intent, Virtual Try-on, EIT Culture & Creativity',
        },
      });

      const regularFont = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf';
      const boldFont = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf';
      const italicFont = '/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf';

      doc.registerFont('LiberationSans', regularFont);
      doc.registerFont('LiberationSans-Bold', boldFont);
      doc.registerFont('LiberationSans-Italic', italicFont);

      const pageWidth = 595.28;
      const contentWidth = pageWidth - 72; // margins left 36 + right 36 = 72

      const { bgDateStr, enDateStr } = formatSofiaDateTime(timestamp);

      const hasNeeds = Array.isArray(data.needs) && data.needs.length > 0;
      const hasMotivation = Boolean(data.motivation && data.motivation.trim().length > 0);

      // ==========================================
      // PAGE 1: БЪЛГАРСКИ ЕЗИК (EXACTLY PAGE 1)
      // ==========================================
      doc.addPage({ size: 'A4', margins: { top: 32, bottom: 0, left: 36, right: 36 } });

      // Title BG: "ПИСМО ЗА НАМЕРЕНИЕ" (without "И ПОДКРЕПА")
      doc.font('LiberationSans-Bold').fontSize(13.5).fillColor('#0F172A').text(
        'ПИСМО ЗА НАМЕРЕНИЕ',
        { align: 'center' }
      );
      doc.font('LiberationSans').fontSize(8.5).fillColor('#475569').text(
        'За безплатен пилотен проект за виртуална AI проба в електронен магазин',
        { align: 'center' }
      );
      doc.moveDown(0.25);

      // Accent divider line
      doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(36, doc.y).lineTo(pageWidth - 36, doc.y).stroke();
      doc.moveDown(0.3);

      // Metadata Parties Box
      const metaY1 = doc.y;
      doc.rect(36, metaY1, contentWidth, 54).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.fillColor('#0F172A');

      doc.font('LiberationSans-Bold').fontSize(7.5).text('ОТ (Партньорски електронен магазин):', 44, metaY1 + 5);
      doc.font('LiberationSans').fontSize(7.5).text(
        `${data.companyName} (ЕИК: ${data.uic})  ·  Уебсайт: ${data.website}`,
        44,
        metaY1 + 15
      );
      doc.text(
        `Лице за контакт: ${data.contactName}  ·  Длъжност: ${data.role}  ·  Имейл: ${data.email}`,
        44,
        metaY1 + 26
      );

      doc.font('LiberationSans-Bold').fontSize(7.5).text('ДО (Разработчик на решението):', 44, metaY1 + 36);
      doc.font('LiberationSans').fontSize(7.5).text(
        '„Спейс Коуд“ ЕООД / Space Code EOOD – Martitony Style Lab  ·  Имейл: info@martitony.com',
        44,
        metaY1 + 45
      );

      doc.y = metaY1 + 60;

      let secBg = 1;

      // 1. Предмет и параметри на пилотния проект
      doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
        `${secBg++}. Предмет и параметри на безплатния пилотен проект`
      );
      doc.moveDown(0.15);
      doc.font('LiberationSans').fontSize(7.5).fillColor('#334155').text(
        'С настоящото писмо за намерение изразяваме готовност и съгласие за провеждане на безплатен пилотен проект за внедряване и тестване на иновативната услуга за виртуална AI проба (Virtual AI Try-On) в нашия електронен магазин при следните параметри:',
        { align: 'justify' }
      );
      doc.moveDown(0.15);

      const bulletsBg = [
        '• Продължителност на пилота: 1–3 месеца тестови период;',
        '• Обхват: 10–20 селектирани модела/артикула от нашия онлайн каталог;',
        '• Интеграция: интерактивен бутон за AI проба директно на продуктовите страници;',
        '• Обратна връзка: предоставяне на отзиви относно потребителското преживяване и търговските резултати.',
      ];
      bulletsBg.forEach((b) => {
        doc.font('LiberationSans').fontSize(7.5).text(b, { indent: 8 });
      });
      doc.moveDown(0.25);

      // Needs section: list only ticked items with "✓"; omit if none
      if (hasNeeds) {
        doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
          `${secBg++}. Идентифицирани актуални потребности на магазина`
        );
        doc.moveDown(0.15);
        data.needs.forEach((need) => {
          doc.font('LiberationSans-Bold').fontSize(7.5).fillColor('#0284C7').text(
            '  ✓  ',
            { continued: true }
          );
          doc.font('LiberationSans').fillColor('#1E293B').text(need);
        });
        doc.moveDown(0.25);
      }

      // "Защо ни е интересно" section: with user's text; omit if empty
      if (hasMotivation) {
        doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
          `${secBg++}. Защо ни е интересно`
        );
        doc.moveDown(0.15);
        doc.font('LiberationSans-Italic').fontSize(7.5).fillColor('#334155').text(
          `„${data.motivation!.trim()}“`,
          { indent: 8, align: 'justify' }
        );
        doc.moveDown(0.25);
      }

      // Funding consent section
      doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
        `${secBg++}. Съгласие за използване в кандидатури за финансиране`
      );
      doc.moveDown(0.15);
      doc.font('LiberationSans').fontSize(7.5).fillColor('#334155').text(
        'Потвърждаваме, че подкрепяме безплатен пилот на AI пробата в нашия уебшоп и сме съгласни това писмо да бъде използвано като доказателство за интерес и пазарна валидация в кандидатури за финансиране и грантови схеми (напр. EIT Culture & Creativity и свързани програми).',
        { align: 'justify' }
      );
      doc.moveDown(0.25);

      // Non-binding notice section
      doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
        `${secBg++}. Необвързващ характер`
      );
      doc.moveDown(0.15);
      doc.font('LiberationSans').fontSize(7.5).fillColor('#334155').text(
        'Писмото е изцяло необвързващо – то не създава финансови или търговски задължения за покупка, лицензиране или плащане между страните.',
        { align: 'justify' }
      );
      doc.moveDown(0.3);

      // Confirmation Sign-off Box BG
      const signY1 = doc.y;
      doc.rect(36, signY1, contentWidth, 38).fillAndStroke('#F1F5F9', '#CBD5E1');
      doc.fillColor('#0F172A');
      doc.font('LiberationSans-Bold').fontSize(7.5).text('Електронно потвърдено съгласие:', 44, signY1 + 5);
      doc.font('LiberationSans').fontSize(7.5).text(
        `Представител: ${data.contactName}  ·  Длъжност: ${data.role}  ·  Имейл: ${data.email}`,
        44,
        signY1 + 15
      );
      doc.font('LiberationSans').fontSize(6.5).fillColor('#64748B').text(
        `Референтен номер: ${refNumber}  ·  Дата и час на електронно генериране: ${bgDateStr}`,
        44,
        signY1 + 26
      );

      // Footer Page 1 inside fixed page footer area (never creates an extra page)
      doc.font('LiberationSans').fontSize(7).fillColor('#94A3B8').text(
        `Потвърдено електронно на ${bgDateStr} · Реф. № ${refNumber}`,
        36,
        816,
        { align: 'center', width: contentWidth, lineBreak: false }
      );

      // ==========================================
      // PAGE 2: ENGLISH (LETTER OF INTENT / SUPPORT)
      // ==========================================
      doc.addPage({ size: 'A4', margins: { top: 32, bottom: 0, left: 36, right: 36 } });

      doc.font('LiberationSans-Bold').fontSize(13.5).fillColor('#0F172A').text(
        'LETTER OF INTENT / SUPPORT',
        { align: 'center' }
      );
      doc.font('LiberationSans').fontSize(8.5).fillColor('#475569').text(
        'Non-binding Expression of Support for AI Virtual Try-On Pilot in E-commerce Store',
        { align: 'center' }
      );
      doc.moveDown(0.25);

      doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(36, doc.y).lineTo(pageWidth - 36, doc.y).stroke();
      doc.moveDown(0.3);

      // Metadata Parties Box EN
      const metaY2 = doc.y;
      doc.rect(36, metaY2, contentWidth, 54).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.fillColor('#0F172A');

      doc.font('LiberationSans-Bold').fontSize(7.5).text('FROM (Partner E-commerce Shop):', 44, metaY2 + 5);
      doc.font('LiberationSans').fontSize(7.5).text(
        `${data.companyName} (UIC / Tax ID: ${data.uic})  ·  Website: ${data.website}`,
        44,
        metaY2 + 15
      );
      doc.text(
        `Contact Person: ${data.contactName}  ·  Position: ${data.role}  ·  Email: ${data.email}`,
        44,
        metaY2 + 26
      );

      doc.font('LiberationSans-Bold').fontSize(7.5).text('TO (Solution Provider):', 44, metaY2 + 36);
      doc.font('LiberationSans').fontSize(7.5).text(
        'Space Code EOOD – Martitony Style Lab  ·  Email: info@martitony.com',
        44,
        metaY2 + 45
      );

      doc.y = metaY2 + 60;

      let secEn = 1;

      // 1. Purpose & Pilot Parameters EN: replaced "strong interest" with "interest"
      doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
        `${secEn++}. Purpose & Parameters of the Free Pilot Project`
      );
      doc.moveDown(0.15);
      doc.font('LiberationSans').fontSize(7.5).fillColor('#334155').text(
        'With this Letter of Support, we express our interest in partnering for a free pilot deployment of the generative AI Virtual Try-On solution in our online apparel storefront under the following parameters:',
        { align: 'justify' }
      );
      doc.moveDown(0.15);

      const bulletsEn = [
        '• Pilot Duration: 1–3 months evaluation period;',
        '• Pilot Scope: 10–20 selected models/items from our live catalog;',
        '• Storefront Integration: interactive try-on button directly on product pages;',
        '• Feedback: providing practical feedback regarding customer reception, returns, and conversion.',
      ];
      bulletsEn.forEach((b) => {
        doc.font('LiberationSans').fontSize(7.5).text(b, { indent: 8 });
      });
      doc.moveDown(0.25);

      // Needs EN: list only ticked items with "✓"; omit if none
      if (hasNeeds) {
        doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
          `${secEn++}. Relevant Store Business Needs Addressed`
        );
        doc.moveDown(0.15);
        data.needs.forEach((needBg) => {
          const needEn = NEED_TRANSLATIONS[needBg] || needBg;
          doc.font('LiberationSans-Bold').fontSize(7.5).fillColor('#0284C7').text(
            '  ✓  ',
            { continued: true }
          );
          doc.font('LiberationSans').fillColor('#1E293B').text(needEn);
        });
        doc.moveDown(0.25);
      }

      // "Why this interests us" EN: with user's text; omit if empty
      if (hasMotivation) {
        doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
          `${secEn++}. Why this interests us`
        );
        doc.moveDown(0.15);
        doc.font('LiberationSans-Italic').fontSize(7.5).fillColor('#334155').text(
          `"${data.motivation!.trim()}"`,
          { indent: 8, align: 'justify' }
        );
        doc.moveDown(0.25);
      }

      // Funding consent EN
      doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
        `${secEn++}. Consent for Grant & Innovation Funding Applications`
      );
      doc.moveDown(0.15);
      doc.font('LiberationSans').fontSize(7.5).fillColor('#334155').text(
        'We confirm our support for a free pilot of the AI try-on in our web shop and agree that this letter may be used as proof of market interest in funding applications (such as EIT Culture & Creativity and related innovation grants).',
        { align: 'justify' }
      );
      doc.moveDown(0.25);

      // Non-binding notice EN
      doc.font('LiberationSans-Bold').fontSize(8.5).fillColor('#1E293B').text(
        `${secEn++}. Non-Binding Status`
      );
      doc.moveDown(0.15);
      doc.font('LiberationSans').fontSize(7.5).fillColor('#334155').text(
        'This letter is strictly non-binding – it creates no obligation or commitment for purchase, licensing, or payment between the parties.',
        { align: 'justify' }
      );
      doc.moveDown(0.3);

      // Confirmation Sign-off Box EN
      const signY2 = doc.y;
      doc.rect(36, signY2, contentWidth, 38).fillAndStroke('#F1F5F9', '#CBD5E1');
      doc.fillColor('#0F172A');
      doc.font('LiberationSans-Bold').fontSize(7.5).text('Electronic Confirmation & Endorsement:', 44, signY2 + 5);
      doc.font('LiberationSans').fontSize(7.5).text(
        `Signatory: ${data.contactName}  ·  Position: ${data.role}  ·  Email: ${data.email}`,
        44,
        signY2 + 15
      );
      doc.font('LiberationSans').fontSize(6.5).fillColor('#64748B').text(
        `Reference Number: ${refNumber}  ·  Electronic verification timestamp: ${enDateStr}`,
        44,
        signY2 + 26
      );

      // Footer Page 2 inside fixed page footer area (never creates an extra page)
      doc.font('LiberationSans').fontSize(7).fillColor('#94A3B8').text(
        `Confirmed electronically on ${enDateStr} · Ref. No. ${refNumber}`,
        36,
        816,
        { align: 'center', width: contentWidth, lineBreak: false }
      );

      doc.end();

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
