import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { UploadService } from './upload.service';

jest.mock('cloudinary', () => ({ v2: { config: jest.fn(), uploader: { upload: jest.fn() } } }));

describe('UploadService branding and image retention', () => {
  const config = new ConfigService({ CLOUDINARY_CLOUD_NAME: 'fixture', CLOUDINARY_API_KEY: 'fixture', CLOUDINARY_API_SECRET: 'fixture' });
  beforeEach(() => jest.clearAllMocks());

  it('uses the VP namespace for default uploads and keeps explicit folders', async () => {
    const upload = cloudinary.uploader.upload as jest.Mock;
    upload.mockResolvedValue({ secure_url: 'https://images.example.invalid/asset.webp' });
    const service = new UploadService(config);
    await service.uploadDataUrl('data:image/webp;base64,fixture');
    expect(upload).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ folder: 'vape-and-sounds' }));
    await service.uploadDataUrl('data:image/webp;base64,fixture', 'products');
    expect(upload).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ folder: 'products' }));
  });

  it('preserves existing hosted images and empty image values without re-uploading', async () => {
    const service = new UploadService(config);
    for (const value of ['https://images.example.invalid/old.webp', null, '', undefined]) {
      expect(await service.uploadDataUrl(value)).toBe(value);
    }
    expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
  });
});
