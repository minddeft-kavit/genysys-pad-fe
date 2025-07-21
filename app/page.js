'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useProgram } from '@/contexts/ProgramContext';
import Link from 'next/link';
import { ArrowRight, Rocket, Shield, Zap } from 'lucide-react';

export default function HomePage() {
  const { connected } = useWallet();
  const { programStatus } = useProgram();

  const features = [
    {
      icon: Rocket,
      title: 'Fair Launch',
      description: 'Launch your token with bonding curve mechanics',
    },
    {
      icon: Shield,
      title: 'Secure & Audited',
      description: 'Built on Solana with security best practices',
    },
    {
      icon: Zap,
      title: 'Raydium Integration',
      description: 'Seamless transition to Raydium DEX when complete',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-20">
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
          Launch Your Token on Solana
        </h1>
        <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
          The most advanced token launchpad with bonding curves, bundle buys, and automatic Raydium integration
        </p>
        
        {!connected ? (
          <p className="text-gray-500">Connect your wallet to get started</p>
        ) : !programStatus.isInitialized ? (
          <Link
            href="/admin/initialize"
            className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg transition-colors"
          >
            Initialize Program
            <ArrowRight size={20} />
          </Link>
        ) : (
          <div className="flex gap-4 justify-center">
            <Link
              href="/pools"
              className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              View Pools
              <ArrowRight size={20} />
            </Link>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
            >
              Create Pool
              <ArrowRight size={20} />
            </Link>
          </div>
        )}
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6 mt-20">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <div
              key={index}
              className="bg-gray-800 rounded-lg p-6 hover:bg-gray-750 transition-colors"
            >
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                <Icon size={24} />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-400">{feature.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}