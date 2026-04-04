import './globals.css';
import Providers from '../components/Providers';

export const metadata = {
  title: {
    default: 'AutoAgenda',
    template: '%s | AutoAgenda',
  },
  description: 'Confirmación automática de citas por WhatsApp para profesionales y negocios.',
  applicationName: 'AutoAgenda',
  metadataBase: new URL('https://autoagenda.online'), // ACORDATE DE USAR EL .ONLINE QUE COMPRASTE
  icons: {
    icon: '/icon.png', // Usa el nuevo PNG sin fondo
    apple: '/icon.png',
  },
  openGraph: {
  openGraph: {
    title: 'AutoAgenda',
    description:
      'Confirmación automática de citas por WhatsApp para clínicas y negocios.',
    type: 'website',
    locale: 'es_ES',
    siteName: 'AutoAgenda',
    images: [
      {
        url: '/logo-landing.jpeg',
        width: 1200,
        height: 630,
        alt: 'AutoAgenda',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AutoAgenda',
    description:
      'Confirmación automática de citas por WhatsApp para clínicas y negocios.',
    images: ['/logo-landing.jpeg'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
