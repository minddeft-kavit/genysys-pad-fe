'use client';

import { useState } from 'react';
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
  CONFIG_SEED,
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
  getPoolTokenAccounts,
  hasWalletLimits
} from '@/lib/program/pool-helpers';
import { numberToBN } from '@/lib/utils/calculations';
import { formatUSD } from '@/lib/utils/formatters';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import { AlertCircle } from 'lucide-react';

export function InitialBuyModal({ pool, isOpen, onClose, onSuccess }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // State
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');

  // Handle initial buy
  const handleInitialBuy = async () => {
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

      const provider = new AnchorProvider(
        connection,
        wallet,
        { commitment: 'confirmed' }
      );
      setProvider(provider);
      
      const program = new Program(IDL, provider);

      const stableAmountIn = numberToBN(parseFloat(amount), TOKEN_STANDARDS.USDC_DECIMALS);

      // Derive PDAs
      const [configPda] = PublicKey.findProgramAddressSync(
        [CONFIG_SEED],
        PROGRAM_ID
      );

      const { pool: poolPda, poolAuthority: poolAuthorityPda } = 
        await derivePoolPDAs(pool.projectMint);
      const { lockedTokens: creatorLockedTokens } = 
        await deriveUserPoolPDAs(pool.address, wallet.publicKey);
      const { poolProjectAta, poolStableAta } = 
        await getPoolTokenAccounts(pool.projectMint, poolAuthorityPda, USDC_DEVNET);

      // Get pool data to check wallet limits
      const poolAccount = await program.account.pool.fetch(pool.address);
      const hasLimits = hasWalletLimits(poolAccount);

      // Get creator token accounts
      const creatorStableAta = await getAssociatedTokenAddress(USDC_DEVNET, wallet.publicKey);
      let creatorProjectAta = null;
      
      if (!hasLimits) {
        creatorProjectAta = await getAssociatedTokenAddress(pool.projectMint, wallet.publicKey);
      }

      // Build transaction
      const builder = createPoolTransactionBuilder(connection, wallet);

      // Add ATA creation if needed
      if (!hasLimits && creatorProjectAta) {
        await builder.addCreateATAIfNeeded(
          creatorProjectAta,
          wallet.publicKey,
          pool.projectMint
        );
      }

      // Create initial buy instruction
      const initialBuyIx = await program.methods
        .initialBuy(stableAmountIn)
        .accounts({
          configAcc: configPda,
          pool: pool.address,
          creator: wallet.publicKey,
          creatorStableAta: creatorStableAta,
          creatorProjectAta: hasLimits ? null : creatorProjectAta,
          creatorLockedTokens: hasLimits ? creatorLockedTokens : null,
          poolAuthority: poolAuthorityPda,
          poolStableAta: poolStableAta,
          poolProjectAta: poolProjectAta,
          projectMint: pool.projectMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      builder.addInstruction(initialBuyIx);

      // Send transaction
      const txSig = await builder.buildAndSend();
      
      toast.success(SUCCESS_MESSAGES.TOKENS_PURCHASED);
      console.log('Initial buy transaction:', txSig);
      
      // Reset and close
      setAmount('');
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
      title="Initial Buy"
    >
      <div className="space-y-4">
        {/* Info Box */}
        <ModalInfoBox variant="warning">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span className="text-sm">
              As the pool creator, you can make the first purchase to kickstart the pool. 
              This helps establish initial liquidity.
            </span>
          </div>
        </ModalInfoBox>

        {/* Pool Info */}
        <div className="bg-gray-700 rounded p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Start Price:</span>
            <span>{formatUSD((pool.params?.startPrice || 0) / 1e6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Buy Tax:</span>
            <span>{(pool.buyTax / 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* Amount Input */}
        <ModalSection title="Amount (USDC)">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            disabled={loading}
          />
        </ModalSection>

        {/* Locked Tokens Warning */}
        {pool.hasWalletLimits && (
          <ModalInfoBox variant="info">
            <span className="text-sm">
              🔒 Your tokens will be locked due to wallet limits on this pool.
            </span>
          </ModalInfoBox>
        )}

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
            onClick={handleInitialBuy}
            disabled={!amount || parseFloat(amount) <= 0}
            loading={loading}
          >
            {loading ? 'Processing...' : 'Complete Initial Buy'}
          </ModalButton>
        </ModalButtonGroup>
      </div>
    </ModalBase>
  );
}