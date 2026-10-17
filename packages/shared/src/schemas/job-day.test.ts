import { describe, expect, it } from 'vitest';

import { JOB_PHOTO_COLUMNS, MAX_JOB_PHOTO_BYTES, MAX_JOB_PHOTO_SOURCE_BYTES, jobPhotoMimeType, jobPhotoPath, photoStageFor, stopGate } from './job-day';

describe('photos on the move day', () => {
  it("go into the move's folder for the stop, under an id made on the phone", () => {
    expect(jobPhotoPath('00000000-0000-4000-8000-0000000e0e01', 'pickup', 'a1b2c3d4', 'image/jpeg')).toBe('00000000-0000-4000-8000-0000000e0e01/pickup/a1b2c3d4.jpg');
    expect(jobPhotoPath('00000000-0000-4000-8000-0000000e0e01', 'dropoff', 'zz99zz', 'image/webp')).toBe('00000000-0000-4000-8000-0000000e0e01/dropoff/zz99zz.webp');
  });

  it('are photos every browser shows: JPEG, PNG or WebP, at most 10 MB', () => {
    expect(jobPhotoMimeType('image/jpeg')).toBe('image/jpeg');
    expect(jobPhotoMimeType('image/jpg')).toBe('image/jpeg');
    expect(jobPhotoMimeType('IMAGE/PNG')).toBe('image/png');
    expect(jobPhotoMimeType('image/webp')).toBe('image/webp');
    expect(jobPhotoMimeType(null, 'IMG_0001.JPEG')).toBe('image/jpeg');
    expect(jobPhotoMimeType('application/octet-stream', 'photo.png')).toBe('image/png');
    expect(jobPhotoMimeType('image/heic', 'IMG_0001.jpg')).toBeNull();
    expect(jobPhotoMimeType('image/heif')).toBeNull();
    expect(jobPhotoMimeType('application/pdf', 'scan.pdf')).toBeNull();
    expect(jobPhotoMimeType(null, 'IMG_0001.HEIC')).toBeNull();
    expect(MAX_JOB_PHOTO_BYTES).toBe(10_485_760);
    // A phone's full-resolution original may be larger: the app re-saves it small before sending.
    expect(MAX_JOB_PHOTO_SOURCE_BYTES).toBe(52_428_800);
  });

  it('are added at the stop the move is at', () => {
    expect(photoStageFor('AT_PICKUP')).toBe('pickup');
    expect(photoStageFor('AT_DROPOFF')).toBe('dropoff');
    for (const s of ['ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'] as const) expect(photoStageFor(s)).toBeNull();
  });

  it('let the mover leave a stop once one is saved and none is sending or failed', () => {
    expect(stopGate({ saved: 0, pending: 0, failed: 0 })).toBe('need_photo');
    expect(stopGate({ saved: 0, pending: 1, failed: 0 })).toBe('uploading');
    expect(stopGate({ saved: 2, pending: 1, failed: 0 })).toBe('uploading');
    expect(stopGate({ saved: 2, pending: 1, failed: 1 })).toBe('fix_failed');
    expect(stopGate({ saved: 1, pending: 0, failed: 0 })).toBe('ok');
  });

  it('are read without who added them (that stays with MoversHub)', () => {
    expect(JOB_PHOTO_COLUMNS).toBe('id,job_id,stage,path,taken_at');
  });
});
