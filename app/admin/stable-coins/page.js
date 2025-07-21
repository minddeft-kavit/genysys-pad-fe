'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { 
  PROGRAM_ID, 
  CONFIG_SEED, 
  USDC_DEVNET,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
} from '@/lib/constants';
import IDL from '@/lib/idl/solana_launchpad.json';
import { sendTransaction } from '@/lib/program/transaction-helper';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';

export default function StableCoinsPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [stableCoins, setStableCoins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newCoinAddress, setNewCoinAddress] = useState('');
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      fetchStableCoins();
    }
  }, [wallet.connected, wallet.publicKey]);

  const fetchStableCoins = async () => {
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
      setIsOwner(config.owner.equals(wallet.publicKey));
      
      const coins = config.stableCoins.map((coin) => ({
        mint: coin.mint,
        decimals: coin.decimals
      }));
      setStableCoins(coins);
    } catch (error) {
      console.error('Error fetching stable coins:', error);
      toast.error('Failed to fetch stable coins');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStableCoin = async () => {
    if (!wallet.publicKey || !newCoinAddress) {
      toast.error('Please enter a stable coin address');
      return;
    }

    try {
      setLoading(true);
      
      let coinPubkey;
      try {
        coinPubkey = new PublicKey(newCoinAddress);
      } catch {
        throw new Error('Invalid mint address');
      }

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

      const ix = await program.methods
        .addStableCoins([coinPubkey])
        .accounts({
          configAcc: configPda,
          signer: wallet.publicKey,
        })
        .instruction();

      const txSig = await sendTransaction(connection, wallet, [ix]);
      
      toast.success(SUCCESS_MESSAGES.TRANSACTION_CONFIRMED);
      console.log('Add stable coin transaction:', txSig);
      
      setNewCoinAddress('');
      await fetchStableCoins();
    } catch (error) {
      handleTransactionError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUSDCDevnet = () => {
    setNewCoinAddress(USDC_DEVNET.toBase58());
  };

  if (!wallet.connected) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h1 className="text-3xl font-bold mb-4">Manage Stable Coins</h1>
        <p className="text-gray-400">{ERROR_MESSAGES.WALLET_NOT_CONNECTED}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Admin
        </Link>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
        <h1 className="text-3xl font-bold mb-6">Stable Coins Configuration</h1>
        
        <div className="space-y-6">
          {/* Current Stable Coins */}
          <div>
            <h3 className="text-lg font-medium text-gray-300 mb-3">Current Stable Coins</h3>
            {loading && stableCoins.length === 0 ? (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
              </div>
            ) : stableCoins.length > 0 ? (
              <div className="space-y-2">
                {stableCoins.map((coin, index) => (
                  <div key={index} className="bg-gray-700 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-mono text-sm text-gray-300">{coin.mint.toString()}</p>
                        <p className="text-xs text-gray-500">Decimals: {coin.decimals}</p>
                      </div>
                      {coin.mint.equals(USDC_DEVNET) && (
                        <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">USDC Devnet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No stable coins added yet</p>
            )}
          </div>

          {/* Add New Stable Coin */}
          {isOwner ? (
            <div className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-300 mb-3">Add New Stable Coin</h3>
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={newCoinAddress}
                    onChange={(e) => setNewCoinAddress(e.target.value)}
                    placeholder="Enter stable coin mint address"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  />
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={handleAddUSDCDevnet}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all duration-200"
                  >
                    Use USDC Devnet
                  </button>
                  
                  <button
                    onClick={handleAddStableCoin}
                    disabled={loading || !newCoinAddress}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-200"
                  >
                    {loading ? 'Adding...' : 'Add Stable Coin'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t border-gray-700 pt-6">
              <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4">
                <p className="text-yellow-400 text-sm">
                  {ERROR_MESSAGES.UNAUTHORIZED}: Only the config owner can add stable coins
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}