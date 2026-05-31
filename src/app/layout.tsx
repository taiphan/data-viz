import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'FE CREDIT Analytics — Nền tảng phân tích dữ liệu',
  description: 'Nền tảng phân tích tự phục vụ cho FE CREDIT. Tải dữ liệu, xây dựng biểu đồ, tạo bảng điều khiển tương tác.',
  keywords: ['FE CREDIT', 'analytics', 'data visualization', 'consumer finance', 'VPBank'],
  authors: [{ name: 'FE CREDIT Technology' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full bg-background text-foreground overflow-hidden">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
