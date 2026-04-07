import type { Metadata } from 'next';
import { Inter, Manrope } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'RestoSmart',
  description:
    'Software inteligente para restaurantes, bares, cafés y take away. Un solo sistema para operar con mesas o en modo retiro.',
  keywords: [
    'restosmart',
    'software gastronomico',
    'menu digital',
    'qr por mesa',
    'take away',
    'restaurante',
    'bar',
    'cafe',
    'pedido digital',
    'software para restaurantes',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${manrope.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}