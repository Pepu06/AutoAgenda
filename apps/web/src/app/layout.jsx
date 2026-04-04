import './globals.css';
import Providers from '../components/Providers';

export const metadata = {
  title: 'AutoAgenda',
  description: 'Confirmación de citas por WhatsApp',
  icons: {
    icon: [
      { url: '/logo_autoagenda.png', sizes: 'any' },
      { url: '/logo_autoagenda.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo_autoagenda.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/logo_autoagenda.png',
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
