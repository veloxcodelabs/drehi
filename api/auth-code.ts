import { checkAccessCode } from '../access_control.js';

export default function handler(req: any, res: any) {
  const code = (req.query?.k as string) || (req.headers?.['x-access-code'] as string) || '';
  const result = checkAccessCode(code);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
}
