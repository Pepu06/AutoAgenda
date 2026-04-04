import './globals.css';
import Providers from '../components/Providers';

export const metadata = {
  title: 'AutoAgenda',
  description: 'Confirmación de citas por WhatsApp',
  icons: {
    icon: [
      { url: '/logo-landing.jpeg', sizes: 'any' },
      { url: '/logo-landing.jpeg', sizes: '32x32', type: 'image/png' },
      { url: '/logo-landing.jpeg', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/logo-landing.jpeg',
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
