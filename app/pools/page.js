'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { 
  PROGRAM_ID, 
  CONFIG_SEED, 
  POOL_SEED,
  ERROR_MESSAGES
} from '@/lib/constants';
import IDL from '@/lib/idl/solana_launchpad.json';
import { PoolCard } from '@/components/pools/PoolCard';
import { 
  calculateCurrentPrice, 
  calculatePoolProgress, 
  bnToNumber,
  isPoolLiveOnRaydium
} from '@/lib/utils/calculations';
// import { isPoolLiveOnRaydium } from '@/lib/program/pool-helpers';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';

export default function PoolsPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (wallet.publicKey) {
      fetchPools();
    }
  }, [wallet.publicKey?.toString()]);

  const fetchPools = async () => {
    try {
      setLoading(true);
      
      const provider = new AnchorProvider(
        connection,
        wallet,
        { commitment: 'confirmed' }
      );
      setProvider(provider);
      
      const program = new Program(IDL, provider);

      const [configPda] = PublicKey.findProgramAddressSync(
        [CONFIG_SEED],
        PROGRAM_ID
      );

      const config = await program.account.config.fetch(configPda);
      const poolDataList = [];

      for (const tokenMint of config.createdTokens) {
        try {
          const [poolPda] = PublicKey.findProgramAddressSync(
            [POOL_SEED, tokenMint.toBuffer()],
            PROGRAM_ID
          );

          const poolAccount = await program.account.pool.fetch(poolPda);
          
          // Calculate derived values
          const currentPrice = calculateCurrentPrice(poolAccount);
          const progress = calculatePoolProgress(poolAccount);
          const isLiveOnRaydium = isPoolLiveOnRaydium(poolAccount);
          
          poolDataList.push({
            address: poolPda,
            projectMint: poolAccount.projectMint,
            tokenName: poolAccount.params.name,
            tokenSymbol: poolAccount.params.symbol,
            creator: poolAccount.params.creator,
            isComplete: poolAccount.isComplete,
            isFinalized: poolAccount.isFinalized,
            isRaydiumInitialized: poolAccount.isRaydiumInitialized,
            isLiveOnRaydium: isLiveOnRaydium,
            currentPrice: currentPrice,
            startPrice: bnToNumber(poolAccount.params.startPrice, 6),
            endPrice: bnToNumber(poolAccount.params.endPrice, 6),
            progress: progress,
            reserveProject: bnToNumber(poolAccount.reserveProjectMint, 9),
            reserveStable: bnToNumber(poolAccount.reserveStableMint, 6),
            totalSellAmount: bnToNumber(poolAccount.totalSellAmount, 9),
            hasWalletLimits: poolAccount.limits.wLimitPercent.toNumber() > 0,
            buyTax: poolAccount.params.buyTax,
            sellTax: poolAccount.params.sellTax,
            params: poolAccount.params,
            limits: poolAccount.limits,
            raydiumPoolState: poolAccount.raydiumPoolState,
            raydiumFeeTier: poolAccount.params.raydiumFeeTier,
            token0IsProject: poolAccount.token0IsProject,
            poolAccount: poolAccount, // Pass the full account for calculations
              // raydiumPoolState: poolAccount.raydiumPoolState,
            raydiumAmmConfig: poolAccount.raydiumAmmConfig,
            raydiumToken0Vault: poolAccount.raydiumToken0Vault,
            raydiumToken1Vault: poolAccount.raydiumToken1Vault,
            raydiumLpMint: poolAccount.raydiumLpMint,
  // token0IsProject: poolAccount.token0IsProject,
          });
        } catch (err) {
          console.error(`Error fetching pool for token ${tokenMint.toString()}:`, err);
        }
      }

      setPools(poolDataList);
    } catch (error) {
      console.error('Error fetching pools:', error);
      toast.error('Failed to fetch pools');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPools();
  };

  if (!wallet.connected) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <h1 className="text-4xl font-bold mb-4">Token Pools</h1>
        <p className="text-gray-400">{ERROR_MESSAGES.WALLET_NOT_CONNECTED}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Token Pools</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium rounded-lg transition-all duration-200"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          <p className="mt-4 text-gray-400">Loading pools...</p>
        </div>
      ) : pools.length === 0 ? (
        <div className="text-center py-20 bg-gray-800 rounded-lg">
          <p className="text-2xl text-gray-400 mb-4">No pools created yet</p>
          <p className="text-gray-500">Be the first to launch a token!</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {pools.map((pool) => (
            <PoolCard
              key={pool.address.toString()}
              pool={pool}
              onUpdate={fetchPools}
            />
          ))}
        </div>
      )}
    </div>
  );
}