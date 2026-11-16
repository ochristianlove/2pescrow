import * as FileSystem from "expo-file-system";
import type { Audio, AVPlaybackStatus } from "expo-av";

let wavBase64: string | null = null;
let fileUri: string | null = null;
let sound: Audio.Sound | null = null;
let preparing: Promise<Audio.Sound> | null = null;

function bytesToBase64(bytes: Uint8Array) {
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

function bellWavBase64() {
  if (wavBase64) return wavBase64;
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * 0.45);
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
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const freq = t < 0.08 ? 880 : t < 0.16 ? 1175 : 880;
    const env = Math.min(1, t / 0.02) * Math.exp(-3.2 * t);
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.9;
    view.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, Math.round(sample * 32767))), true);
  }
  wavBase64 = bytesToBase64(new Uint8Array(buffer));
  return wavBase64;
}

async function bellFile() {
  if (fileUri) return fileUri;
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("No cache directory");
  const uri = `${directory}2pescrow-bell.wav`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(uri, bellWavBase64(), { encoding: FileSystem.EncodingType.Base64 });
  }
  fileUri = uri;
  return uri;
}

function loaded(status: AVPlaybackStatus) {
  return status.isLoaded;
}

async function bellSound() {
  if (sound) return sound;
  if (!preparing) {
    preparing = (async () => {
      const { Audio: AudioModule } = await import("expo-av");
      await AudioModule.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const created = await AudioModule.Sound.createAsync({ uri: await bellFile() }, { shouldPlay: false, volume: 1 });
      sound = created.sound;
      return created.sound;
    })().finally(() => {
      preparing = null;
    });
  }
  return preparing;
}

/** Same two-tone bell the website synthesizes for live trade alerts. */
export async function playTradeBell() {
  const player = await bellSound();
  const status = await player.getStatusAsync();
  if (!loaded(status)) {
    sound = null;
    await (await bellSound()).replayAsync();
    return;
  }
  await player.replayAsync();
}
