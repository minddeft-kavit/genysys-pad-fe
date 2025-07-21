'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress
} from '@solana/spl-token';
import { 
  PROGRAM_ID,
  USDC_DEVNET,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  TOKEN_STANDARDS
} from '@/lib/constants';
import IDL from '@/lib/idl/solana_launchpad.json';
import { 
  ModalBase, 
  ModalSection, 
  ModalInfoBox, 
  ModalButtonGroup, 
  ModalButton 
} from '@/components/modals/shared/ModalBase';
import { createPoolTransactionBuilder } from '@/components/modals/shared/TransactionBuilder';
import { 
  derivePoolPDAs, 
  deriveUserPoolPDAs,
  getPoolTokenAccounts
} from '@/lib/program/pool-helpers';
import { numberToBN, bnToNumber } from '@/lib/utils/calculations';
import { formatUSD } from '@/lib/utils/formatters';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import { Info } from 'lucide-react';

export function BundleModal({ pool, isOpen, onClose, onSuccess }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // State
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [bundleInfo, setBundleInfo] = useState(null);
  const [userDeposit, setUserDeposit] = useState(null);
  const [activeTab, setActiveTab] = useState('deposit');
  const [loadingInfo, setLoadingInfo] = useState(true);

  // Get program instance
  const getProgram = useCallback(() => {
    if (!wallet.publicKey) return null;
    const provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed' }
    );
    setProvider(provider);
    return new Program(IDL, provider);
  }, [connection, wallet.publicKey]);

  // Fetch bundle information
  useEffect(() => {
    const fetchBundleInfo = async () => {
      if (!wallet.publicKey || !isOpen) return;
      
      setLoadingInfo(true);
      try {
        const program = getProgram();
        if (!program) return;

        // Get bundle pool PDA
        const { bundlePool: bundlePoolPda } = await derivePoolPDAs(pool.projectMint);

        // Try to fetch bundle pool
        let bundlePoolData = null;
        try {
          bundlePoolData = await program.account.bundleBuyPool.fetch(bundlePoolPda);
          setBundleInfo({
            totalDeposits: bnToNumber(bundlePoolData.totalDeposits, TOKEN_STANDARDS.USDC_DECIMALS),
            isExecuted: bundlePoolData.isExecuted
          });
        } catch (e) {
          setBundleInfo({ totalDeposits: 0, isExecuted: false });
        }

        // Check user deposit
        const { bundleDeposit: bundleDepositPda } = await deriveUserPoolPDAs(
          pool.address, 
          wallet.publicKey
        );

        try {
          const deposit = await program.account.bundleDeposit.fetch(bundleDepositPda);
          setUserDeposit(bnToNumber(deposit.amount, TOKEN_STANDARDS.USDC_DECIMALS));
        } catch (e) {
          setUserDeposit(0);
        }
      } catch (error) {
        console.error('Error fetching bundle info:', error);
      } finally {
        setLoadingInfo(false);
      }
    };

    fetchBundleInfo();
  }, [wallet.publicKey, isOpen, pool, getProgram]);

  // Handle deposit
  const handleDeposit = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error(ERROR_MESSAGES.INVALID_AMOUNT);
      return;
    }

    try {
      setLoading(true);

      const program = getProgram();
      if (!program) throw new Error('Failed to initialize program');

      const depositAmount = numberToBN(parseFloat(amount), TOKEN_STANDARDS.USDC_DECIMALS);

      // Derive PDAs
      const { pool: poolPda, poolAuthority: poolAuthorityPda, bundlePool: bundlePoolPda } = 
        await derivePoolPDAs(pool.projectMint);
      const { bundleDeposit: bundleDepositPda } = 
        await deriveUserPoolPDAs(pool.address, wallet.publicKey);
      const { poolStableAta } = 
        await getPoolTokenAccounts(pool.projectMint, poolAuthorityPda, USDC_DEVNET);

      const depositorStableAta = await getAssociatedTokenAddress(USDC_DEVNET, wallet.publicKey);

      // Build transaction
      const builder = createPoolTransactionBuilder(connection, wallet);

      // Add ATA creation if needed
      await builder.addCreateATAIfNeeded(
        depositorStableAta, 
        wallet.publicKey, 
        USDC_DEVNET
      );

      // Create deposit instruction
      const depositIx = await program.methods
        .depositToBundle(depositAmount)
        .accounts({
          poolAcc: pool.address,
          projectMint: pool.projectMint,
          stableMint: USDC_DEVNET,
          poolStableAta: poolStableAta,
          poolAuthority: poolAuthorityPda,
          bundleDeposit: bundleDepositPda,
          bundlePool: bundlePoolPda,
          depositor: wallet.publicKey,
          depositorStableAta: depositorStableAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      builder.addInstruction(depositIx);

      // Send transaction
      const txSig = await builder.buildAndSend();
      
      toast.success(SUCCESS_MESSAGES.BUNDLE_DEPOSITED);
      console.log('Bundle deposit transaction:', txSig);
      
      // Reset and refresh
      setAmount('');
      await fetchBundleInfo();
      onSuccess();
    } catch (error) {
      handleTransactionError(error);
    } finally {
      setLoading(false);
    }
  };

  // Handle withdraw
  const handleWithdraw = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    if (!userDeposit || userDeposit <= 0) {
      toast.error('No deposit to withdraw');
      return;
    }

    try {
      setLoading(true);

      const program = getProgram();
      if (!program) throw new Error('Failed to initialize program');

      // Derive PDAs
      const { pool: poolPda, poolAuthority: poolAuthorityPda, bundlePool: bundlePoolPda } = 
        await derivePoolPDAs(pool.projectMint);
      const { bundleDeposit: bundleDepositPda } = 
        await deriveUserPoolPDAs(pool.address, wallet.publicKey);
      const { poolStableAta } = 
        await getPoolTokenAccounts(pool.projectMint, poolAuthorityPda, USDC_DEVNET);

      const withdrawerStableAta = await getAssociatedTokenAddress(USDC_DEVNET, wallet.publicKey);

      // Build transaction
      const builder = createPoolTransactionBuilder(connection, wallet);

      // Create withdraw instruction
      const withdrawIx = await program.methods
        .withdrawFromBundle()
        .accounts({
          pool: pool.address,
          projectMint: pool.projectMint,
          stableMint: USDC_DEVNET,
          depositRec: bundleDepositPda,
          bundlePool: bundlePoolPda,
          withdrawer: wallet.publicKey,
          poolStableAta: poolStableAta,
          withdrawerStableAta: withdrawerStableAta,
          poolAuthority: poolAuthorityPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .instruction();

      builder.addInstruction(withdrawIx);

      // Send transaction
      const txSig = await builder.buildAndSend();
      
      toast.success(SUCCESS_MESSAGES.BUNDLE_WITHDRAWN);
      console.log('Bundle withdrawal transaction:', txSig);
      
      // Refresh
      await fetchBundleInfo();
      onSuccess();
    } catch (error) {
      handleTransactionError(error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to fetch bundle info
  const fetchBundleInfo = async () => {
    const program = getProgram();
    if (!program) return;

    const { bundlePool: bundlePoolPda } = await derivePoolPDAs(pool.projectMint);
    const { bundleDeposit: bundleDepositPda } = await deriveUserPoolPDAs(
      pool.address, 
      wallet.publicKey
    );

    try {
      const bundlePoolData = await program.account.bundleBuyPool.fetch(bundlePoolPda);
      setBundleInfo({
        totalDeposits: bnToNumber(bundlePoolData.totalDeposits, TOKEN_STANDARDS.USDC_DECIMALS),
        isExecuted: bundlePoolData.isExecuted
      });
    } catch (e) {
      setBundleInfo({ totalDeposits: 0, isExecuted: false });
    }

    try {
      const deposit = await program.account.bundleDeposit.fetch(bundleDepositPda);
      setUserDeposit(bnToNumber(deposit.amount, TOKEN_STANDARDS.USDC_DECIMALS));
    } catch (e) {
      setUserDeposit(0);
    }
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Bundle Buy"
    >
      <div className="space-y-4">
        {/* Info Box */}
        <ModalInfoBox variant="info">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <span className="text-sm">
              Bundle buys allow users to deposit USDC that will be used to buy tokens 
              when the pool completes. All bundle participants get tokens at the same final price.
            </span>
          </div>
        </ModalInfoBox>

        {/* Bundle Stats */}
        {!loadingInfo && bundleInfo && (
          <div className="bg-gray-700 rounded p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Bundle Deposits:</span>
              <span>{formatUSD(bundleInfo.totalDeposits)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Your Deposit:</span>
              <span>{formatUSD(userDeposit || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className={bundleInfo.isExecuted ? 'text-green-400' : 'text-yellow-400'}>
                {bundleInfo.isExecuted ? 'Executed' : 'Pending'}
              </span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('deposit')}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'deposit'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => setActiveTab('withdraw')}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'withdraw'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            disabled={!userDeposit || userDeposit <= 0}
          >
            Withdraw
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'deposit' ? (
          <>
            <ModalSection title="Deposit Amount (USDC)">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min={pool.params?.minDeposit ? pool.params.minDeposit / 1e6 : 0}
                max={pool.params?.maxDeposit ? pool.params.maxDeposit / 1e6 : undefined}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                disabled={loading}
              />
              {pool.params?.minDeposit > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Min: {formatUSD(pool.params.minDeposit / 1e6)}
                  {pool.params.maxDeposit > 0 && ` | Max: ${formatUSD(pool.params.maxDeposit / 1e6)}`}
                </p>
              )}
            </ModalSection>

            <ModalButtonGroup>
              <ModalButton
                variant="secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </ModalButton>
              <ModalButton
                variant="primary"
                onClick={handleDeposit}
                disabled={!amount || parseFloat(amount) <= 0}
                loading={loading}
              >
                {loading ? 'Depositing...' : 'Deposit to Bundle'}
              </ModalButton>
            </ModalButtonGroup>
          </>
        ) : (
          <>
            <div className="text-center py-4">
              <p className="text-gray-400 mb-2">Your current deposit:</p>
              <p className="text-2xl font-bold">{formatUSD(userDeposit || 0)}</p>
            </div>

            <ModalButtonGroup>
              <ModalButton
                variant="secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </ModalButton>
              <ModalButton
                variant="danger"
                onClick={handleWithdraw}
                disabled={!userDeposit || userDeposit <= 0}
                loading={loading}
              >
                {loading ? 'Withdrawing...' : 'Withdraw All'}
              </ModalButton>
            </ModalButtonGroup>
          </>
        )}
      </div>
    </ModalBase>
  );
}