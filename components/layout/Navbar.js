'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from '@/components/wallet/WalletButton';
import { useProgram } from '@/contexts/ProgramContext';
import { Home, Layers, Plus, Settings } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { programStatus } = useProgram();

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/pools', label: 'Pools', icon: Layers },
    { href: '/create', label: 'Create Pool', icon: Plus },
    { href: '/admin', label: 'Admin', icon: Settings },
  ];

  return (
    <nav className="border-b border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Genysys Pad
            </Link>
            
            <div className="hidden md:flex items-center space-x-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                const isDisabled = !programStatus.isInitialized && item.href !== '/' && item.href !== '/admin';
                
                return (
                  <Link
                    key={item.href}
                    href={isDisabled ? '#' : item.href}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${isActive 
                        ? 'bg-purple-600 text-white' 
                        : isDisabled
                        ? 'text-gray-500 cursor-not-allowed'
                        : 'text-gray-300 hover:text-white hover:bg-gray-800'
                      }
                    `}
                    onClick={(e) => isDisabled && e.preventDefault()}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {!programStatus.isInitialized && !programStatus.isLoading && (
              <span className="text-yellow-400 text-sm">⚠️ Program not initialized</span>
            )}
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
}