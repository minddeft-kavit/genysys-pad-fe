'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { 
  PROGRAM_ID, 
  CONFIG_SEED, 
  FEES,
  ALLOWED_DEX_ROUTERS,
  DEFAULT_FORM_VALUES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  TOKEN_STANDARDS
} from '@/lib/constants';
import IDL from '@/lib/idl/solana_launchpad.json';
import { sendTransaction } from '@/lib/program/transaction-helper';
import { numberToBN } from '@/lib/utils/calculations';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function InitializePage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(null);
  
  const [params, setParams] = useState({
    feeReceiver: '',
    fee: FEES.DEFAULT_PROTOCOL_FEE / TOKEN_STANDARDS.PERCENTAGE_DECIMALS,
    tradingFee: FEES.DEFAULT_TRADING_FEE / TOKEN_STANDARDS.PERCENTAGE_DECIMALS,
    bundleFee: FEES.DEFAULT_BUNDLE_FEE / TOKEN_STANDARDS.PERCENTAGE_DECIMALS,
    requireRaiseUsd: DEFAULT_FORM_VALUES.REQUIRE_RAISE_USD,
    dexRouters: ALLOWED_DEX_ROUTERS.map(pk => pk.toBase58()),
  });

  useEffect(() => {
    if (wallet.publicKey && !params.feeReceiver) {
      setParams(prev => ({ ...prev, feeReceiver: wallet.publicKey.toBase58() }));
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    checkInitialized();
  }, [wallet.connected]);

  const checkInitialized = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    
    try {
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

      try {
        await program.account.config.fetch(configPda);
        setIsInitialized(true);
      } catch {
        setIsInitialized(false);
      }
    } catch (error) {
      console.error('Error checking initialization:', error);
    }
  };

  const handleInitialize = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    try {
      setLoading(true);
      
      const provider = new AnchorProvider(
        connection,
        wallet,
        { commitment: 'confirmed' }
      );
      setProvider(provider);
      
      const program = new Program(IDL, provider);

      // Validate inputs
      let feeReceiverPubkey;
      try {
        feeReceiverPubkey = new PublicKey(params.feeReceiver);
      } catch {
        throw new Error('Invalid fee receiver address');
      }

      const dexRouterPubkeys = [];
      for (const router of params.dexRouters) {
        try {
          if (router.trim()) {
            dexRouterPubkeys.push(new PublicKey(router.trim()));
          }
        } catch {
          throw new Error(`Invalid DEX router address: ${router}`);
        }
      }

      if (dexRouterPubkeys.length === 0) {
        throw new Error('At least one DEX router is required');
      }

      const [configPda] = PublicKey.findProgramAddressSync(
        [CONFIG_SEED],
        PROGRAM_ID
      );

      // Build instruction
      const ix = await program.methods
        .initialize(
          feeReceiverPubkey,
          numberToBN(params.fee, 2), // Convert percentage to basis points
          numberToBN(params.tradingFee, 2),
          numberToBN(params.requireRaiseUsd, 0),
          dexRouterPubkeys,
          numberToBN(params.bundleFee, 2)
        )
        .accounts({
          configAcc: configPda,
          signer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Send transaction
      const txSig = await sendTransaction(connection, wallet, [ix]);
      
      toast.success(SUCCESS_MESSAGES.TRANSACTION_CONFIRMED);
      console.log('Initialization transaction:', txSig);
      
      // Redirect to home
      setTimeout(() => {
        router.push('/');
      }, 2000);
      
    } catch (error) {
      handleTransactionError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRouter = () => {
    setParams(prev => ({
      ...prev,
      dexRouters: [...prev.dexRouters, '']
    }));
  };

  const handleRemoveRouter = (index) => {
    setParams(prev => ({
      ...prev,
      dexRouters: prev.dexRouters.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateRouter = (index, value) => {
    setParams(prev => ({
      ...prev,
      dexRouters: prev.dexRouters.map((router, i) => i === index ? value : router)
    }));
  };

  if (!wallet.connected) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h1 className="text-3xl font-bold mb-4">Initialize Program</h1>
        <p className="text-gray-400">{ERROR_MESSAGES.WALLET_NOT_CONNECTED}</p>
      </div>
    );
  }

  if (isInitialized) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-green-900/20 border border-green-600 rounded-lg p-6 text-center">
          <h2 className="text-2xl font-bold text-green-400 mb-2">Program Already Initialized</h2>
          <p className="text-gray-300 mb-4">The program has already been initialized.</p>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
          >
            <ArrowLeft size={16} />
            Go to Admin Dashboard
          </Link>
        </div>
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
        <h1 className="text-3xl font-bold mb-6">Initialize Program</h1>
        
        <div className="space-y-6">
          {/* Fee Receiver */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Fee Receiver Address
            </label>
            <input
              type="text"
              value={params.feeReceiver}
              onChange={(e) => setParams({ ...params, feeReceiver: e.target.value })}
              placeholder="Enter Solana address for fees"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">Address that will receive protocol fees</p>
          </div>

          {/* Fees Section */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Protocol Fee (%)
              </label>
              <input
                type="number"
                value={params.fee}
                onChange={(e) => setParams({ ...params, fee: parseFloat(e.target.value) || 0 })}
                step="0.1"
                min="0"
                max="100"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Trading Fee (%)
              </label>
              <input
                type="number"
                value={params.tradingFee}
                onChange={(e) => setParams({ ...params, tradingFee: parseFloat(e.target.value) || 0 })}
                step="0.01"
                min="0"
                max="100"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Bundle Fee (%)
              </label>
              <input
                type="number"
                value={params.bundleFee}
                onChange={(e) => setParams({ ...params, bundleFee: parseFloat(e.target.value) || 0 })}
                step="0.1"
                min="0"
                max="100"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Required Raise Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Required Raise Amount (USD)
            </label>
            <input
              type="number"
              value={params.requireRaiseUsd}
              onChange={(e) => setParams({ ...params, requireRaiseUsd: parseInt(e.target.value) || 0 })}
              min="0"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">Target amount for each pool to raise</p>
          </div>

          {/* DEX Routers */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Allowed DEX Routers
            </label>
            <div className="space-y-2">
              {params.dexRouters.map((router, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={router}
                    onChange={(e) => handleUpdateRouter(index, e.target.value)}
                    placeholder="DEX Router Address"
                    className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 text-sm"
                  />
                  <button
                    onClick={() => handleRemoveRouter(index)}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddRouter}
                className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                <Plus size={16} />
                Add Router
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Whirlpool, Saber, Raydium CPMM, etc.</p>
          </div>
          
          <button
            onClick={handleInitialize}
            disabled={loading}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-200"
          >
            {loading ? 'Initializing...' : 'Initialize Program'}
          </button>
        </div>
      </div>
    </div>
  );
}