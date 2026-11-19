import * as FileSystem from "expo-file-system";
import type { Audio, AVPlaybackStatus } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SoundTone = "subtle" | "ping" | "bell";

const SOUND_TONE_STORAGE_KEY = "@2pescrow/notification_sound_tone";
let cachedTone: SoundTone | null = null;

const soundCache: Partial<Record<SoundTone, Audio.Sound>> = {};
const preparing: Partial<Record<SoundTone, Promise<Audio.Sound>>> = {};

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return out;
}

function generateWavBase64(tone: SoundTone): string {
  const sampleRate = 22050;
  const duration = tone === "ping" ? 0.35 : tone === "bell" ? 0.50 : 0.45;
  const samples = Math.floor(sampleRate * duration);
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); // 16-bit
  write(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    let sample = 0;

    if (tone === "ping") {
      // Gentle single acoustic droplet ping (~1046 Hz C6) with soft harmonic
      const attack = Math.min(1, t / 0.012);
      const decay = Math.exp(-12.5 * Math.max(0, t - 0.012));
      const env = attack * decay;
      sample = (Math.sin(2 * Math.PI * 1046.5 * t) * 0.75 + Math.sin(2 * Math.PI * 2093 * t) * 0.25) * env * 0.22;
    } else if (tone === "bell") {
      // Warm resonant chime (587 Hz D5 -> 880 Hz A5)
      const freq = t < 0.14 ? 587.3 : 880.0;
      const attack = Math.min(1, t / 0.02);
      const decay = Math.exp(-8.5 * Math.max(0, t - 0.02));
      const env = attack * decay;
      sample = (Math.sin(2 * Math.PI * freq * t) * 0.8 + Math.sin(2 * Math.PI * (freq * 2) * t) * 0.2) * env * 0.24;
    } else {
      // Subtle two-tone chime matching website: 880 -> 1175 -> 880 Hz with soft exponential ramp
      const freq = t < 0.08 ? 880 : t < 0.16 ? 1175 : 880;
      const attack = Math.min(1, t / 0.02);
      const decay = Math.exp(-11.0 * Math.max(0, t - 0.02));
      const env = attack * decay;
      sample = Math.sin(2 * Math.PI * freq * t) * env * 0.22;
    }

    const clamped = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
    view.setInt16(44 + i * 2, clamped, true);
  }

  return bytesToBase64(new Uint8Array(buffer));
}

async function getToneFile(tone: SoundTone): Promise<string> {
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("No cache directory");
  const uri = `${directory}2pescrow-sound-${tone}.wav`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(uri, generateWavBase64(tone), {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  return uri;
}

function isLoaded(status: AVPlaybackStatus): boolean {
  return status.isLoaded;
}

async function getOrCreateSound(tone: SoundTone): Promise<Audio.Sound> {
  const existing = soundCache[tone];
  if (existing) return existing;

  if (!preparing[tone]) {
    preparing[tone] = (async () => {
      const { Audio: AudioModule } = await import("expo-av");
      await AudioModule.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const fileUri = await getToneFile(tone);
      const created = await AudioModule.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: false, volume: 0.55 },
      );
      soundCache[tone] = created.sound;
      return created.sound;
    })().finally(() => {
      delete preparing[tone];
    });
  }

  return preparing[tone]!;
}

export async function getSavedSoundTone(): Promise<SoundTone> {
  if (cachedTone) return cachedTone;
  try {
    const saved = await AsyncStorage.getItem(SOUND_TONE_STORAGE_KEY);
    if (saved === "ping" || saved === "bell" || saved === "subtle") {
      cachedTone = saved;
      return saved;
    }
  } catch {
    // Fall back to default
  }
  cachedTone = "subtle";
  return "subtle";
}

export async function saveSoundTone(tone: SoundTone): Promise<void> {
  cachedTone = tone;
  try {
    await AsyncStorage.setItem(SOUND_TONE_STORAGE_KEY, tone);
  } catch {
    // Ignore storage errors
  }
}

/** Plays the alert sound using the user's preferred or passed tone. */
export async function playTradeBell(explicitTone?: SoundTone): Promise<void> {
  try {
    const tone = explicitTone || (await getSavedSoundTone());
    const player = await getOrCreateSound(tone);
    const status = await player.getStatusAsync();
    if (!isLoaded(status)) {
      delete soundCache[tone];
      const fresh = await getOrCreateSound(tone);
      await fresh.replayAsync();
      return;
    }
    await player.replayAsync();
  } catch {
    // Suppress audio failure if system audio is occupied
  }
}
