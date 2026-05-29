import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BuiltProgram } from '../models/robotModels';

const PROGRAMS_KEY = 'local_programs_v1';
const IMAGE_PREFIX = 'local_program_image_';

export const LocalProgramService = {
  async getAll(): Promise<BuiltProgram[]> {
    const raw = await AsyncStorage.getItem(PROGRAMS_KEY);
    return raw ? (JSON.parse(raw) as BuiltProgram[]) : [];
  },

  async save(program: BuiltProgram): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex(p => p.name === program.name);
    if (idx >= 0) all[idx] = program;
    else all.push(program);
    await AsyncStorage.setItem(PROGRAMS_KEY, JSON.stringify(all));
  },

  async delete(name: string): Promise<void> {
    const all = await this.getAll();
    await AsyncStorage.setItem(PROGRAMS_KEY, JSON.stringify(all.filter(p => p.name !== name)));
    await AsyncStorage.removeItem(`${IMAGE_PREFIX}${name}`);
  },

  async getImage(name: string): Promise<string | null> {
    return AsyncStorage.getItem(`${IMAGE_PREFIX}${name}`);
  },

  async saveImage(name: string, base64: string): Promise<void> {
    await AsyncStorage.setItem(`${IMAGE_PREFIX}${name}`, base64);
  },

  async exportAsFile(program: BuiltProgram): Promise<void> {
    const json = JSON.stringify(program, null, 2);
    const safe = program.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `${FileSystem.cacheDirectory ?? ''}${safe}.json`;
    await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: `Export "${program.name}"` });
  },

  async importFromFile(): Promise<BuiltProgram | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const content = await FileSystem.readAsStringAsync(result.assets[0].uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(content);
    if (!parsed?.name || !Array.isArray(parsed?.steps)) {
      throw new Error('File does not look like a robot program');
    }
    return parsed as BuiltProgram;
  },
};
