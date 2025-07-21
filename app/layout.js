import { Inter } from 'next/font/google';
import './globals.css';
import { WalletContextProvider } from '@/components/wallet/WalletProvider';
import { ProgramProvider } from '@/contexts/ProgramContext';
import { Navbar } from '@/components/layout/Navbar';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Genysys Pad - Solana Launchpad',
  description: 'Launch your token on Solana with advanced features',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletContextProvider>
          <ProgramProvider>
            <div className="min-h-screen bg-gray-900 text-white">
              <Navbar />
              <main className="container mx-auto px-4 py-8">
                {children}
              </main>
            </div>
            <Toaster
              position="bottom-right"
              toastOptions={{
                duration: 5000,
                style: {
                  background: '#1F2937',
                  color: '#fff',
                  border: '1px solid #374151',
                },
              }}
            />
          </ProgramProvider>
        </WalletContextProvider>
      </body>
    </html>
  );
}