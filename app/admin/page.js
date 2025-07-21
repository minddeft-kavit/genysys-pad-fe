'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useProgram } from '@/contexts/ProgramContext';
import Link from 'next/link';
import { Settings, Plus, Coins, Router, DollarSign } from 'lucide-react';
import { ERROR_MESSAGES } from '@/lib/constants';

export default function AdminPage() {
  const { connected } = useWallet();
  const { programStatus } = useProgram();

  if (!connected) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>
        <p className="text-gray-400">{ERROR_MESSAGES.WALLET_NOT_CONNECTED}</p>
      </div>
    );
  }

  const adminActions = [
    {
      title: 'Initialize Program',
      description: 'Set up the launchpad program for first time use',
      href: '/admin/initialize',
      icon: Settings,
      color: 'purple',
      disabled: programStatus.isInitialized,
    },
    {
      title: 'Add Stable Coins',
      description: 'Configure accepted stable coins for pools',
      href: '/admin/stable-coins',
      icon: Coins,
      color: 'blue',
      disabled: !programStatus.isInitialized,
    },
    {
      title: 'Manage Routers',
      description: 'Add or remove allowed DEX routers',
      href: '/admin/routers',
      icon: Router,
      color: 'green',
      disabled: !programStatus.isInitialized,
    },
    {
      title: 'Update Fees',
      description: 'Modify protocol and trading fees',
      href: '/admin/fees',
      icon: DollarSign,
      color: 'yellow',
      disabled: !programStatus.isInitialized,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      
      {/* Program Status */}
      <div className={`rounded-lg p-6 mb-8 ${
        programStatus.isInitialized 
          ? 'bg-green-900/20 border border-green-600' 
          : 'bg-yellow-900/20 border border-yellow-600'
      }`}>
        <h2 className="text-xl font-semibold mb-2">
          Program Status: {programStatus.isInitialized ? '✅ Initialized' : '⚠️ Not Initialized'}
        </h2>
        {programStatus.isInitialized && programStatus.owner && (
          <p className="text-sm text-gray-400">
            Owner: <span className="font-mono">{programStatus.owner}</span>
          </p>
        )}
      </div>

      {/* Admin Actions Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {adminActions.map((action) => {
          const Icon = action.icon;
          const colorClasses = {
            purple: 'bg-purple-600 hover:bg-purple-700',
            blue: 'bg-blue-600 hover:bg-blue-700',
            green: 'bg-green-600 hover:bg-green-700',
            yellow: 'bg-yellow-600 hover:bg-yellow-700',
          };

          return (
            <Link
              key={action.href}
              href={action.disabled ? '#' : action.href}
              onClick={(e) => action.disabled && e.preventDefault()}
              className={`
                bg-gray-800 rounded-lg p-6 transition-all
                ${action.disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:bg-gray-750 hover:shadow-lg'
                }
              `}
            >
              <div className={`
                w-12 h-12 rounded-lg flex items-center justify-center mb-4
                ${action.disabled ? 'bg-gray-600' : colorClasses[action.color]}
              `}>
                <Icon size={24} />
              </div>
              <h3 className="text-xl font-semibold mb-2">{action.title}</h3>
              <p className="text-gray-400 text-sm">{action.description}</p>
              {action.disabled && programStatus.isInitialized && (
                <p className="text-xs text-gray-500 mt-2">Already configured</p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}