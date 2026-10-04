import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { dataUrl, filename: originalName } = req.body || {};

    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Липсва валидно изображение (dataUrl).' });
    }

    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let extension = 'png';
    let buffer: Buffer;

    if (matches && matches.length === 3) {
      const mime = matches[1];
      if (mime.includes('jpeg') || mime.includes('jpg')) extension = 'jpg';
      else if (mime.includes('webp')) extension = 'webp';
      else if (mime.includes('gif')) extension = 'gif';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(dataUrl, 'base64');
    }

    const uniqueId = crypto.randomBytes(6).toString('hex');
    const safeBase = originalName
      ? String(originalName).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 25)
      : 'upload';
    const filename = `${safeBase}_${Date.now()}_${uniqueId}.${extension}`;

    // Upload to public image CDN so external AI engines can fetch the image
    let cdnUrl = '';
    try {
      const formData = new FormData();
      const mime = extension === 'png' ? 'image/png' : 'image/jpeg';
      const blob = new Blob([buffer], { type: mime });
      formData.append('source', blob, filename);
      formData.append('key', '6d207e02198a847aa98d0a2a901485a5');
      formData.append('format', 'json');

      const cdnRes = await fetch('https://freeimage.host/api/1/upload', {
        method: 'POST',
        body: formData,
      });
      const cdnData = await cdnRes.json();
      if (cdnData && cdnData.image && cdnData.image.url) {
        cdnUrl = cdnData.image.url;
      }
    } catch (cdnErr) {
      console.warn('CDN upload in api/upload.ts:', cdnErr);
    }

    return res.status(200).json({
      url: cdnUrl || dataUrl,
      localUrl: cdnUrl || dataUrl,
      dataUrl,
      filename,
      size: buffer.length,
      mime: `image/${extension}`,
    });
  } catch (error: any) {
    console.error('Error in api/upload.ts:', error);
    if (req.body?.dataUrl) {
      return res.status(200).json({
        url: req.body.dataUrl,
        localUrl: req.body.dataUrl,
        dataUrl: req.body.dataUrl,
        filename: req.body?.filename || 'upload.png',
        size: 0,
      });
    }
    return res.status(400).json({ error: error.message || 'Upload failed' });
  }
}
