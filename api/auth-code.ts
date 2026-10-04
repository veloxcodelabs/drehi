import { checkAccessCode } from '../access_control.js';
import { STORAGE_PUBLIC_MESSAGE } from '../generation_errors.js';

export default async function handler(req: any, res: any) {
  const code = (req.query?.k as string) || (req.headers?.['x-access-code'] as string) || '';
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await checkAccessCode(code);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Access] auth-code failed:', error);
    return res.status(503).json({
      valid: false,
      code: '',
      remaining: 0,
      totalAllowed: 0,
      used: 0,
      dailyRemaining: 0,
      dailyLimitReached: false,
      message: STORAGE_PUBLIC_MESSAGE,
    });
  }
}
