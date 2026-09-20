import './globals.css';

export const metadata = {
  title: 'Sell My Home Fast For Cash | No Fees, No Repairs',
  description:
    'Get a fair, no-obligation cash offer on your home. Sell as-is with no repairs, no showings, and no agent fees. Close on your timeline.',
  openGraph: {
    title: 'Sell My Home Fast For Cash',
    description:
      'A fair cash offer with no fees, no repairs, and no showings. Close on your schedule.',
    type: 'website',
    url: 'https://www.sellmyhomesforcash.com/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sell My Home Fast For Cash',
    description:
      'A fair cash offer with no fees, no repairs, and no showings.',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
