/**
 * Reset one invite code so its successful generations go back to zero.
 * The practice code "test" is capped at 3, same as every other code.
 *
 * Local development (file counter, no Firebase credentials):
 *   USAGE_STORE=file npx tsx scripts/reset-code.ts test
 *
 * Production — easiest for the site owner:
 *   1. Open https://clothes.martitony.com/admin
 *   2. Enter the admin password
 *   3. In "Проби по код" type test and press "Нулирай пробите"
 *
 * Production from a terminal:
 *   curl -X POST "https://clothes.martitony.com/api/admin/codes/reset" \
 *     -H "content-type: application/json" \
 *     -H "x-admin-password: $ADMIN_PASSWORD" \
 *     -d '{"code":"test"}'
 *
 * Running this script against production Firestore also works if
 * FIREBASE_SERVICE_ACCOUNT is set in the environment (the same JSON as on Vercel).
 */
import { resetCodeUsage } from '../access_control.js';

const code = process.argv[2] || 'test';

const result = await resetCodeUsage(code);
console.log(
  `Reset "${result.code}". Remaining: ${result.remaining} (used ${result.used} of ${result.totalAllowed}).`
);
