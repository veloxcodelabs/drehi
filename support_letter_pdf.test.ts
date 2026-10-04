import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLetterPdfFromSubmission } from './support_letter_service.ts';

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
