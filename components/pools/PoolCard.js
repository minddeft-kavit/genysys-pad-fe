'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Lock,
  ExternalLink,
  Zap,
  Package,
  Settings,
  Gift,
  Unlock,
  PlayCircle
} from 'lucide-react';
import { BuyTokenModal } from '@/components/modals/BuyTokenModal';
import { SellTokenModal } from '@/components/modals/SellTokenModal';
import { InitialBuyModal } from '@/components/modals/InitialBuyModal';
import { BundleModal } from '@/components/modals/BundleModal';
import { FinalizePoolModal } from '@/components/modals/FinalizePoolModal';
import { CreateRaydiumPoolModal } from '@/components/modals/CreateRaydiumPoolModal';
import { ClaimTokenModal } from '@/components/modals/ClaimTokenModal';
import { ClaimLockedTokensModal } from '@/components/modals/ClaimLockedTokensModal';
import { ExecuteBundleBuyModal } from '@/components/modals/ExecuteBundleBuyModal';
import { 
  formatTokenAmount, 
  formatUSD, 
  formatPercentage, 
  shortenAddress,
  formatPoolStatus 
} from '@/lib/utils/formatters';
import { 
  canPerformInitialBuy, 
  getPoolPhase,
  deriveUserPoolPDAs,
  derivePoolPDAs
} from '@/lib/program/pool-helpers';
import { RAYDIUM_FEE_OPTIONS, EXTERNAL_LINKS, USDC_DEVNET, PROGRAM_ID, CONFIG_SEED } from '@/lib/constants';
import IDL from '@/lib/idl/solana_launchpad.json';

export function PoolCard({ pool, onUpdate }) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [selectedModal, setSelectedModal] = useState(null);
  
  // User-specific state
  const [userBundleDeposit, setUserBundleDeposit] = useState(false);
  const [userLockedTokens, setUserLockedTokens] = useState(false);
  const [bundleExecuted, setBundleExecuted] = useState(false);
  const [bundleExists, setBundleExists] = useState(false);
  const [canExecuteBundle, setCanExecuteBundle] = useState(false);
  const [loadingUserData, setLoadingUserData] = useState(false);

  const isCreator = wallet.publicKey && pool.creator.equals(wallet.publicKey);
  const canInitialBuy = canPerformInitialBuy(pool.poolAccount || pool, wallet.publicKey);
  const poolPhase = getPoolPhase(pool.poolAccount || pool);
  const status = formatPoolStatus(pool);

  // Fetch user-specific data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!wallet.publicKey || !wallet.connected) return;
      
      setLoadingUserData(true);
      try {
        const provider = new AnchorProvider(
          connection,
          wallet,
          { commitment: 'confirmed' }
        );
        setProvider(provider);
        
        const program = new Program(IDL, provider);

        // Check for bundle deposit
        const { bundleDeposit: bundleDepositPda } = await deriveUserPoolPDAs(
          pool.address, 
          wallet.publicKey
        );
        
        try {
          const deposit = await program.account.bundleDeposit.fetch(bundleDepositPda);
          setUserBundleDeposit(deposit.amount.toNumber() > 0);
        } catch (e) {
          setUserBundleDeposit(false);
        }

        // Check for locked tokens if pool has wallet limits
        if (pool.hasWalletLimits) {
          const { lockedTokens: lockedTokensPda } = await deriveUserPoolPDAs(
            pool.address, 
            wallet.publicKey
          );
          
          try {
            const locked = await program.account.lockedTokens.fetch(lockedTokensPda);
            setUserLockedTokens(locked.amount.toNumber() > 0);
          } catch (e) {
            setUserLockedTokens(false);
          }
        }

        // Check bundle pool status
        const { bundlePool: bundlePoolPda } = await derivePoolPDAs(pool.projectMint);
        try {
          const bundlePool = await program.account.bundleBuyPool.fetch(bundlePoolPda);
          setBundleExecuted(bundlePool.isExecuted);
          setBundleExists(bundlePool.totalDeposits.toNumber() > 0);
        } catch (e) {
          setBundleExecuted(false);
          setBundleExists(false);
        }

      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoadingUserData(false);
      }
    };

    fetchUserData();
  }, [wallet.publicKey?.toString(), wallet.connected, pool.address?.toString(), connection]);

  const getStatusBadge = () => {
    return (
      <div className={`flex items-center gap-1 bg-${status.color}-900/20 border border-${status.color}-600/30 rounded-full px-3 py-1`}>
        <div className={`w-2 h-2 bg-${status.color}-400 rounded-full ${pool.isRaydiumInitialized ? 'animate-pulse' : ''}`}></div>
        <span className={`text-xs text-${status.color}-400`}>{status.text}</span>
      </div>
    );
  };

  const getFeeText = () => {
    const option = RAYDIUM_FEE_OPTIONS.find(opt => opt.value === pool.raydiumFeeTier?.toString());
    return option?.label || 'N/A';
  };

  const handleModalClose = () => {
    setSelectedModal(null);
  };

  const handleModalSuccess = () => {
    setSelectedModal(null);
    onUpdate();
    // Refetch user data
    if (wallet.publicKey) {
      fetchUserData();
    }
  };

  // Helper to refetch user data
  const fetchUserData = async () => {
    // Same logic as in useEffect
    const provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed' }
    );
    setProvider(provider);
    
    const program = new Program(IDL, provider);
    
    // Refetch bundle status
    const { bundlePool: bundlePoolPda } = await derivePoolPDAs(pool.projectMint);
    try {
      const bundlePool = await program.account.bundleBuyPool.fetch(bundlePoolPda);
      setBundleExecuted(bundlePool.isExecuted);
      setBundleExists(bundlePool.totalDeposits.toNumber() > 0);
    } catch (e) {
      setBundleExecuted(false);
      setBundleExists(false);
    }
  };

  return (
    <>
      <div className="bg-gray-800 rounded-lg p-6 hover:bg-gray-750 transition-all duration-200">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-2xl font-bold">{pool.tokenName}</h3>
              <span className="text-gray-400">({pool.tokenSymbol})</span>
              {getStatusBadge()}
            </div>
            <p className="text-sm text-gray-500">
              Created by: {isCreator ? 'You' : shortenAddress(pool.creator.toString())}
            </p>
          </div>
          
          <div className="text-right">
            <p className="text-sm text-gray-400">Current Price</p>
            <p className="text-2xl font-bold text-green-400">
              {formatUSD(pool.currentPrice)}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>Progress</span>
            <span>{pool.progress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${pool.progress}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-700 rounded p-3">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
              <Package size={16} />
              <span>Tokens Left</span>
            </div>
            <p className="font-semibold">{formatTokenAmount(pool.reserveProject)}</p>
          </div>
          
          <div className="bg-gray-700 rounded p-3">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
              <DollarSign size={16} />
              <span>USDC Raised</span>
            </div>
            <p className="font-semibold">{formatUSD(pool.reserveStable)}</p>
          </div>
          
          <div className="bg-gray-700 rounded p-3">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
              <TrendingUp size={16} />
              <span>Buy/Sell Tax</span>
            </div>
            <p className="font-semibold">
              {formatPercentage(pool.buyTax / 100)} / {formatPercentage(pool.sellTax / 100)}
            </p>
          </div>
          
          <div className="bg-gray-700 rounded p-3">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
              <Zap size={16} />
              <span>Raydium Fee</span>
            </div>
            <p className="font-semibold text-xs">{getFeeText()}</p>
          </div>
        </div>

        {/* Features */}
        <div className="flex gap-2 mb-4">
          {pool.hasWalletLimits && (
            <div className="flex items-center gap-1 bg-purple-900/30 border border-purple-600/50 rounded px-2 py-1 text-xs text-purple-400">
              <Lock size={12} />
              Wallet Limits
            </div>
          )}
          {pool.params?.useRaydium && (
            <div className="text-xs bg-blue-900/30 border border-blue-600/50 rounded px-2 py-1 text-blue-400">
              Raydium Ready
            </div>
          )}
          {userBundleDeposit && (
            <div className="flex items-center gap-1 bg-yellow-900/30 border border-yellow-600/50 rounded px-2 py-1 text-xs text-yellow-400">
              <Gift size={12} />
              Bundle Deposit
            </div>
          )}
          {userLockedTokens && (
            <div className="flex items-center gap-1 bg-orange-900/30 border border-orange-600/50 rounded px-2 py-1 text-xs text-orange-400">
              <Lock size={12} />
              Has Locked Tokens
            </div>
          )}
          {bundleExists && !bundleExecuted && (
            <div className="flex items-center gap-1 bg-purple-900/30 border border-purple-600/50 rounded px-2 py-1 text-xs text-purple-400">
              <Users size={12} />
              Bundle Ready
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Initial Buy - Creator only, when pool has no liquidity */}
          {canInitialBuy && (
            <button
              onClick={() => setSelectedModal('initialBuy')}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors"
            >
              Initial Buy
            </button>
          )}

          {/* Buy button - always available unless finalized without Raydium */}
          {(!pool.isFinalized || pool.isRaydiumInitialized) && (
            <button
              onClick={() => setSelectedModal('buy')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
            >
              Buy
            </button>
          )}

          {/* Sell button - always available */}
          <button
            onClick={() => setSelectedModal('sell')}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
          >
            Sell
          </button>

          {/* Bundle button - only during active phase */}
          {!pool.isComplete && (
            <button
              onClick={() => setSelectedModal('bundle')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
            >
              Bundle
            </button>
          )}

          {/* Execute Bundle Buy - for authorized users */}
          {pool.isComplete && pool.isFinalized && 
           pool.isRaydiumInitialized && bundleExists && !bundleExecuted && (
            <button
              onClick={() => setSelectedModal('executeBundle')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 animate-pulse"
              disabled={loadingUserData}
            >
              <PlayCircle size={16} />
              Execute Bundle
            </button>
          )}

          {/* Claim Bundle Tokens - for users with bundle deposits */}
          {userBundleDeposit && pool.isComplete && bundleExecuted && (
            <button
              onClick={() => setSelectedModal('claimToken')}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              disabled={loadingUserData}
            >
              <Gift size={16} />
              Claim Tokens
            </button>
          )}

          {/* Claim Locked Tokens - for users with locked tokens */}
          {userLockedTokens && pool.isComplete && (
            <button
              onClick={() => setSelectedModal('claimLocked')}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              disabled={loadingUserData}
            >
              <Unlock size={16} />
              Claim Locked
            </button>
          )}

          {/* Creator Actions */}
          {isCreator && (
            <div className="flex gap-2 ml-auto">
              {pool.isComplete && !pool.isFinalized && (
                <button
                  onClick={() => setSelectedModal('finalize')}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                >
                  Finalize Pool
                </button>
              )}
              
              {pool.isFinalized && !pool.isRaydiumInitialized && pool.params?.useRaydium && (
                <button
                  onClick={() => setSelectedModal('createRaydium')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors animate-pulse"
                >
                  Create Raydium Pool
                </button>
              )}
            </div>
          )}

          {/* View on Raydium */}
          {pool.isRaydiumInitialized && (
            
              <a href={`${EXTERNAL_LINKS.RAYDIUM_SWAP}?inputMint=${pool.projectMint.toString()}&outputMint=${USDC_DEVNET.toString()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              View on Raydium
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </div>

      {/* Modals */}
      {selectedModal === 'buy' && (
        <BuyTokenModal
          pool={pool}
          isOpen={true}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {selectedModal === 'sell' && (
        <SellTokenModal
          pool={pool}
          isOpen={true}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {selectedModal === 'initialBuy' && (
        <InitialBuyModal
          pool={pool}
          isOpen={true}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {selectedModal === 'bundle' && (
        <BundleModal
          pool={pool}
          isOpen={true}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {selectedModal === 'finalize' && (
        <FinalizePoolModal
          pool={pool}
          isOpen={true}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {selectedModal === 'createRaydium' && (
        <CreateRaydiumPoolModal
          pool={pool}
          isOpen={true}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {selectedModal === 'executeBundle' && (
        <ExecuteBundleBuyModal
          pool={pool}
          isOpen={true}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {selectedModal === 'claimToken' && (
        <ClaimTokenModal
          pool={pool}
          isOpen={true}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {selectedModal === 'claimLocked' && (
        <ClaimLockedTokensModal
          pool={pool}
          isOpen={true}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}
    </>
  );
}