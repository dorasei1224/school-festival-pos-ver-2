import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '文化祭POSシステム',
    short_name: '文化祭POS',
    description: 'オフライン対応の文化祭向けPOSレジアプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#F3F4F6',
    theme_color: '#111827',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}