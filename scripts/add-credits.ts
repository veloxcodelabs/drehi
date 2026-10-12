/**
 * Add credits to an invite code.
 *
 * Usage:
 *   npx tsx scripts/add-credits.ts <code> <credits>
 * Example:
 *   npx tsx scripts/add-credits.ts marikris 100
 */
import { addCreditsToCode, checkAccessCode } from '../access_control.js';

const code = process.argv[2] || 'test';
const credits = Number(process.argv[3]) || 3;

const result = await addCreditsToCode(code, credits);
const current = await checkAccessCode(code);
console.log(
  `Added ${credits} credits to "${result.code}". Total allowed: ${result.totalAllowed}, used: ${result.used}, remaining: ${current.remaining}.`
);
