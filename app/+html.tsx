import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Custom HTML shell for Expo web.
 * Injects the PWA manifest and service worker registration.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="bg">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme & status bar */}
        <meta name="theme-color" content="#4F46E5" />
        <meta name="background-color" content="#0F0F1A" />

        {/* iOS PWA meta */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GymApp" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        {/* SEO */}
        <meta name="description" content="Твоят личен фитнес партньор — тренировки, прогрес и връзка с треньори." />
        <meta name="keywords" content="фитнес, тренировки, треньор, gym, workout" />
        <meta name="author" content="GymApp" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="GymApp" />
        <meta property="og:description" content="Твоят личен фитнес партньор — тренировки, прогрес и връзка с треньори." />
        <meta property="og:image" content="/icons/icon-512.png" />

        {/* Removes default body styles */}
        <ScrollViewStyleReset />

        {/* Register service worker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker
                    .register('/sw.js')
                    .then(function (reg) {
                      console.log('[GymApp] SW registered:', reg.scope);
                    })
                    .catch(function (err) {
                      console.warn('[GymApp] SW registration failed:', err);
                    });
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
