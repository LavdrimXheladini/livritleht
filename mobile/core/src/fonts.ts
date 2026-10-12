/// <reference path="./assets.d.ts" />
// Per-weight subpaths: the package index would bundle all 36 weights.
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { useFonts } from 'expo-font';

import { tokens } from '@movershub/ui';
// Static Archivo instances at the token width/weight (React Native can't stretch a variable font).
import archivoDisplay from '@movershub/ui/assets/fonts/Archivo-Display.ttf';
import archivoWordmark from '@movershub/ui/assets/fonts/Archivo-Wordmark.ttf';

const nf = tokens.nativeFonts;

/** Loads every font family named in tokens.json `nativeFonts`. Returns true once ready. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [nf.display]: archivoDisplay,
    [nf.wordmark]: archivoWordmark,
    [nf.body]: Geist_400Regular,
    [nf.bodyMedium]: Geist_500Medium,
    [nf.bodySemibold]: Geist_600SemiBold,
    [nf.mono]: GeistMono_400Regular,
    [nf.monoMedium]: GeistMono_500Medium,
  });
  // On a load error, render with system fonts rather than blocking the app.
  return loaded || error !== null;
}
