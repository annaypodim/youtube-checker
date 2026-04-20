import './globals.css';

export const metadata = {
  title: 'ChannelDigest',
  description: 'Subscribe for email summaries of the latest videos from the YouTube channels you follow.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
