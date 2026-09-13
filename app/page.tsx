'use client';
import Studio from './studio';
import { LocaleProvider } from '@/lib/i18n/provider';
export default function Home() {
  return (
    <LocaleProvider>
      <Studio />
    </LocaleProvider>
  );
}
