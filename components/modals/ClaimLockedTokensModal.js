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
import { formatTokenAmount } from '@/lib/utils/formatters';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import { Lock, Unlock } from 'lucide-react';

export function ClaimLockedTokensModal({ pool, isOpen, onClose, onSuccess }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // State
  const [loading, setLoading] = useState(false);
  const [lockedInfo, setLockedInfo] = useState(null);
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

  // Fetch locked tokens information
  useEffect(() => {
    const fetchLockedInfo = async () => {
      if (!wallet.publicKey || !isOpen) return;
      
      setLoadingInfo(true);
      try {
        const program = getProgram();
        if (!program) return;

        // Check if pool has wallet limits
        if (!pool.hasWalletLimits) {
          setLockedInfo({ error: 'This pool does not have wallet limits' });
          return;
        }

        // Check if pool is complete
        if (!pool.isComplete) {
          setLockedInfo({ error: 'Pool must be complete before claiming locked tokens' });
          return;
        }

        // Get locked tokens PDA
        const { lockedTokens: lockedTokensPda } = await deriveUserPoolPDAs(
          pool.address, 
          wallet.publicKey
        );

        // Check user's locked tokens
        try {
          const lockedData = await program.account.lockedTokens.fetch(lockedTokensPda);
          const lockedAmount = bnToNumber(lockedData.amount, TOKEN_STANDARDS.TOKEN_DECIMALS);
          const initialAmount = bnToNumber(lockedData.initialAmount, TOKEN_STANDARDS.TOKEN_DECIMALS);

          if (lockedAmount === 0) {
            setLockedInfo({ error: 'No locked tokens to claim' });
            return;
          }

          setLockedInfo({
            lockedAmount,
            initialAmount,
            canClaim: true
          });

        } catch (e) {
          setLockedInfo({ error: 'You have no locked tokens in this pool' });
        }

      } catch (error) {
        console.error('Error fetching locked info:', error);
        setLockedInfo({ error: 'Failed to fetch locked token information' });
      } finally {
        setLoadingInfo(false);
      }
    };

    fetchLockedInfo();
  }, [wallet.publicKey, isOpen, pool, getProgram]);

  // Handle claim
  const handleClaim = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    if (!lockedInfo?.canClaim) {
      toast.error('No locked tokens to claim');
      return;
    }

    try {
      setLoading(true);

      const program = getProgram();
      if (!program) throw new Error('Failed to initialize program');

      // Derive PDAs
      const { pool: poolPda, poolAuthority: poolAuthorityPda } = 
        await derivePoolPDAs(pool.projectMint);
      const { lockedTokens: lockedTokensPda } = 
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
        .claimLockedTokens()
        .accounts({
          pool: pool.address,
          projectMint: pool.projectMint,
          poolAuthority: poolAuthorityPda,
          poolProjectAta: poolProjectAta,
          lockedTokens: lockedTokensPda,
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
      
      toast.success('Locked tokens claimed successfully!');
      console.log('Claim locked tokens transaction:', txSig);
      
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
      title="Claim Locked Tokens"
    >
      <div className="space-y-4">
        {loadingInfo ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            <p className="mt-2 text-gray-400">Loading locked token information...</p>
          </div>
        ) : lockedInfo?.error ? (
          <>
            <ModalInfoBox variant="error">
              <div className="flex items-center gap-2">
                <Lock size={16} />
                <span>{lockedInfo.error}</span>
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
        ) : lockedInfo && (
          <>
            {/* Info Box */}
            <ModalInfoBox variant="info">
              <div className="flex items-start gap-2">
                <Unlock size={16} className="mt-0.5 flex-shrink-0" />
                <span className="text-sm">
                  Your tokens were locked due to wallet limits on this pool. Now that the pool is complete, you can claim them.
                </span>
              </div>
            </ModalInfoBox>

            {/* Locked Token Details */}
            <ModalSection title="Your Locked Tokens">
              <div className="bg-gray-700 rounded p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Initially Locked:</span>
                  <span>{formatTokenAmount(lockedInfo.initialAmount, pool.tokenSymbol)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Currently Locked:</span>
                  <span className="font-semibold text-yellow-400">
                    {formatTokenAmount(lockedInfo.lockedAmount, pool.tokenSymbol)}
                  </span>
                </div>
                {lockedInfo.initialAmount > lockedInfo.lockedAmount && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Already Claimed:</span>
                    <span className="text-gray-500">
                      {formatTokenAmount(lockedInfo.initialAmount - lockedInfo.lockedAmount)}
                    </span>
                  </div>
                )}
                <div className="border-t border-gray-600 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Available to Claim:</span>
                    <span className="text-lg font-bold text-green-400">
                      {formatTokenAmount(lockedInfo.lockedAmount, pool.tokenSymbol)}
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
                disabled={!lockedInfo.canClaim}
                loading={loading}
              >
                {loading ? 'Claiming...' : 'Claim Locked Tokens'}
              </ModalButton>
            </ModalButtonGroup>
          </>
        )}
      </div>
    </ModalBase>
  );
}