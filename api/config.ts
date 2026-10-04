export default function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    hasServerToken: true,
    defaultVersion: 'cce611c44553ba5f061813d75a1e5f93d8c901047528da275f667ebe7d784565',
    models: [
      {
        id: 'gpt-image-2-5',
        name: 'GPT Image 2.5 (High Realism)',
        version: 'cce611c44553ba5f061813d75a1e5f93d8c901047528da275f667ebe7d784565',
        description: 'Advanced photorealistic generation, supports reference images and multi-aspect resolutions.',
        type: 'text-and-image-to-image',
      },
    ],
  });
}
