import { referenceOuterProfile, type Profile } from '@patturn/kernel';
export type ProfileMode = 'reference' | 'bucket' | 'vase';

export const PRESETS: Record<ProfileMode, Profile> = {
  reference: referenceOuterProfile(48),
  bucket: [
    { r: 0, y: -4 },
    { r: 72.5, y: -4 },
    { r: 72.5, y: 0 },
    { r: 66, y: 60 },
    { r: 60, y: 120 },
    { r: 58, y: 148 },
    { r: 54, y: 148 },
  ],
  vase: [
    { r: 0, y: -4 },
    { r: 40, y: -4 },
    { r: 40, y: 0 },
    { r: 55, y: 30 },
    { r: 68, y: 70 },
    { r: 52, y: 110 },
    { r: 40, y: 140 },
    { r: 44, y: 148 },
    { r: 40, y: 148 },
  ],
};
