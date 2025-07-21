'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Wallet } from 'lucide-react';
import { shortenAddress } from '@/lib/utils/formatters';

export function WalletButton() {
  const { publicKey, disconnect, connecting, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const handleClick = async () => {
    if (connected) {
      await disconnect();
    } else {
      setVisible(true);
    }
  };

  const getButtonText = () => {
    if (connecting) return 'Connecting...';
    if (connected && publicKey) {
      return shortenAddress(publicKey.toBase58());
    }
    return 'Connect Wallet';
  };

  return (
    <button
      onClick={handleClick}
      disabled={connecting}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200
        ${connected 
          ? 'bg-green-600 hover:bg-green-700 text-white' 
          : 'bg-purple-600 hover:bg-purple-700 text-white'
        }
        ${connecting ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}
        shadow-lg hover:shadow-xl
      `}
    >
      <Wallet size={16} />
      {getButtonText()}
    </button>
  );
}