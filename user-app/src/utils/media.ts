/**
 * Camera and gallery photos for the sell flow. Photos are resized on the
 * phone (1600 px, quality 0.8) so uploads stay small on mobile data.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker';

export type Photo = { uri: string; type?: string; name?: string };

const OPTS = { mediaType: 'photo' as const, maxWidth: 1600, maxHeight: 1600, quality: 0.8 as const, includeBase64: false };
const MAX_BYTES = 8 * 1024 * 1024;

const toPhoto = (a: Asset): Photo | null => (a.uri && (a.fileSize ?? 0) <= MAX_BYTES ? { uri: a.uri, type: a.type, name: a.fileName } : null);

export async function takePhoto(): Promise<Photo | null> {
  if (Platform.OS === 'android') {
    const g = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    if (g !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Camera permission is off. Turn it on in Settings to take photos.');
  }
  const r = await launchCamera({ ...OPTS, saveToPhotos: false });
  if (r.didCancel || !r.assets?.[0]) return null;
  if (r.errorMessage) throw new Error(r.errorMessage);
  return toPhoto(r.assets[0]);
}

export async function pickPhotos(limit: number): Promise<Photo[]> {
  const r = await launchImageLibrary({ ...OPTS, selectionLimit: Math.max(1, limit) });
  if (r.didCancel || !r.assets) return [];
  if (r.errorMessage) throw new Error(r.errorMessage);
  return r.assets.map(toPhoto).filter(Boolean) as Photo[];
}
