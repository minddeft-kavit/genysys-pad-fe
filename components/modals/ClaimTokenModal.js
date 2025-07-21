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
import { bnToNumber } from '@/lib/utils/calculations';
import { formatTokenAmount, formatUSD } from '@/lib/utils/formatters';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import { Package, AlertCircle } from 'lucide-react';

export function ClaimTokenModal({ pool, isOpen, onClose, onSuccess }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // State
  const [loading, setLoading] = useState(false);
  const [claimInfo, setClaimInfo] = useState(null);
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

  // Fetch claim information
  useEffect(() => {
    const fetchClaimInfo = async () => {
      if (!wallet.publicKey || !isOpen) return;
      
      setLoadingInfo(true);
      try {
        const program = getProgram();
        if (!program) return;

        // Get PDAs
        const { bundlePool: bundlePoolPda } = await derivePoolPDAs(pool.projectMint);
        const { bundleDeposit: bundleDepositPda } = await deriveUserPoolPDAs(
          pool.address, 
          wallet.publicKey
        );

        // Check if bundle pool exists and is executed
        let bundlePoolData = null;
        let isExecuted = false;
        let totalDeposits = 0;

        try {
          bundlePoolData = await program.account.bundleBuyPool.fetch(bundlePoolPda);
          isExecuted = bundlePoolData.isExecuted;
          totalDeposits = bnToNumber(bundlePoolData.totalDeposits, TOKEN_STANDARDS.USDC_DECIMALS);
        } catch (e) {
          // Bundle pool doesn't exist
          setClaimInfo({ error: 'No bundle pool found for this token' });
          return;
        }

        if (!isExecuted) {
          setClaimInfo({ error: 'Bundle buy has not been executed yet' });
          return;
        }

        // Check user's deposit
        let userDeposit = 0;
        try {
          const depositData = await program.account.bundleDeposit.fetch(bundleDepositPda);
          userDeposit = bnToNumber(depositData.amount, TOKEN_STANDARDS.USDC_DECIMALS);
        } catch (e) {
          setClaimInfo({ error: 'You have no bundle deposit to claim' });
          return;
        }

        if (userDeposit === 0) {
          setClaimInfo({ error: 'No deposit amount to claim' });
          return;
        }

        // Get pool token balance to calculate share
        const { poolAuthority: poolAuthorityPda } = await derivePoolPDAs(pool.projectMint);
        const { poolProjectAta } = await getPoolTokenAccounts(
          pool.projectMint,
          poolAuthorityPda
        );

        let poolTokenBalance = 0;
        try {
          const tokenBalance = await connection.getTokenAccountBalance(poolProjectAta);
          poolTokenBalance = parseFloat(tokenBalance.value.uiAmount || '0');
        } catch (e) {
          console.error('Error fetching pool token balance:', e);
        }

        // Calculate user's share
        const userShare = totalDeposits > 0 
          ? (userDeposit / totalDeposits) * poolTokenBalance 
          : 0;

        setClaimInfo({
          userDeposit,
          totalDeposits,
          poolTokenBalance,
          userShare,
          isExecuted,
          canClaim: userShare > 0
        });

      } catch (error) {
        console.error('Error fetching claim info:', error);
        setClaimInfo({ error: 'Failed to fetch claim information' });
      } finally {
        setLoadingInfo(false);
      }
    };

    fetchClaimInfo();
  }, [wallet.publicKey, isOpen, pool, getProgram, connection]);

  // Handle claim
  const handleClaim = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    if (!claimInfo?.canClaim) {
      toast.error('Nothing to claim');
      return;
    }

    try {
      setLoading(true);

      const program = getProgram();
      if (!program) throw new Error('Failed to initialize program');

      // Derive PDAs
      const { pool: poolPda, poolAuthority: poolAuthorityPda, bundlePool: bundlePoolPda } = 
        await derivePoolPDAs(pool.projectMint);
      const { bundleDeposit: depositRecPda } = 
        await deriveUserPoolPDAs(pool.address, wallet.publicKey);
      const { poolProjectAta } = 
        await getPoolTokenAccounts(pool.projectMint, poolAuthorityPda);

      const claimerProjectAta = await getAssociatedTokenAddress(
        pool.projectMint, 
        wallet.publicKey
      );

      // Build transaction
      const builder = createPoolTransactionBuilder(connection, wallet);

      // Add ATA creation if needed
      await builder.addCreateATAIfNeeded(
        claimerProjectAta,
        wallet.publicKey,
        pool.projectMint
      );

      // Create claim instruction
      const claimIx = await program.methods
        .claimToken()
        .accounts({
          pool: pool.address,
          projectMint: pool.projectMint,
          poolAuthority: poolAuthorityPda,
          poolProjectAta: poolProjectAta,
          depositRec: depositRecPda,
          bundlePool: bundlePoolPda,
          claimer: wallet.publicKey,
          claimerProjectAta: claimerProjectAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      builder.addInstruction(claimIx);

      // Send transaction
      const txSig = await builder.buildAndSend();
      
      toast.success(SUCCESS_MESSAGES.TOKENS_CLAIMED || 'Tokens claimed successfully!');
      console.log('Claim transaction:', txSig);
      
      onSuccess();
      onClose();
    } catch (error) {
      handleTransactionError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Claim Bundle Tokens"
    >
      <div className="space-y-4">
        {loadingInfo ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            <p className="mt-2 text-gray-400">Loading claim information...</p>
          </div>
        ) : claimInfo?.error ? (
          <>
            <ModalInfoBox variant="error">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{claimInfo.error}</span>
              </div>
            </ModalInfoBox>
            <ModalButtonGroup>
              <ModalButton
                variant="secondary"
                onClick={onClose}
                fullWidth
              >
                Close
              </ModalButton>
            </ModalButtonGroup>
          </>
        ) : claimInfo && (
          <>
            {/* Info Box */}
            <ModalInfoBox variant="info">
              <div className="flex items-start gap-2">
                <Package size={16} className="mt-0.5 flex-shrink-0" />
                <span className="text-sm">
                  The bundle buy has been executed. You can now claim your proportional share of tokens based on your deposit.
                </span>
              </div>
            </ModalInfoBox>

            {/* Claim Details */}
            <ModalSection title="Your Claim Details">
              <div className="bg-gray-700 rounded p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Your Bundle Deposit:</span>
                  <span className="font-semibold">{formatUSD(claimInfo.userDeposit)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Bundle Pool:</span>
                  <span>{formatUSD(claimInfo.totalDeposits)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Your Share:</span>
                  <span>{((claimInfo.userDeposit / claimInfo.totalDeposits) * 100).toFixed(2)}%</span>
                </div>
                <div className="border-t border-gray-600 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Tokens to Claim:</span>
                    <span className="text-lg font-bold text-green-400">
                      {formatTokenAmount(claimInfo.userShare, pool.tokenSymbol)}
                    </span>
                  </div>
                </div>
              </div>
            </ModalSection>

            {/* Action Buttons */}
            <ModalButtonGroup>
              <ModalButton
                variant="secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </ModalButton>
              <ModalButton
                variant="success"
                onClick={handleClaim}
                disabled={!claimInfo.canClaim}
                loading={loading}
              >
                {loading ? 'Claiming...' : 'Claim Tokens'}
              </ModalButton>
            </ModalButtonGroup>
          </>
        )}
      </div>
    </ModalBase>
  );
}