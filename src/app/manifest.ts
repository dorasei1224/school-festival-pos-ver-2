import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'つぐポス',
    short_name: 'つぐポス',
    description: '文化祭向けPOSレジアプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#F3F4F6',
    theme_color: '#F3F4F6',
    icons: [
      {
        src: '/IMG_3101.jpg',
        sizes: '192x192',
        type: 'image/jpeg',
      },
      {
        src: '/IMG_3101.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
      },
    ],
  };
}


