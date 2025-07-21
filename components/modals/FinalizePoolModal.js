'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
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
  TOKEN_STANDARDS,
  FEES
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
  getPoolTokenAccounts
} from '@/lib/program/pool-helpers';
import { bnToNumber } from '@/lib/utils/calculations';
import { formatTokenAmount, formatUSD } from '@/lib/utils/formatters';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';

export function FinalizePoolModal({ pool, isOpen, onClose, onSuccess }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // State
  const [loading, setLoading] = useState(false);
  const [poolInfo, setPoolInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  // Fetch pool information
  useEffect(() => {
    const fetchPoolInfo = async () => {
      if (!wallet.publicKey || !isOpen) return;
      
      setLoadingInfo(true);
      try {
        const provider = new AnchorProvider(
          connection,
          wallet,
          { commitment: 'confirmed' }
        );
        setProvider(provider);
        
        const program = new Program(IDL, provider);
        const poolAccount = await program.account.pool.fetch(pool.address);
        
        // Verify creator
        if (!poolAccount.params.creator.equals(wallet.publicKey)) {
          toast.error(ERROR_MESSAGES.UNAUTHORIZED);
          onClose();
          return;
        }

        // Check status
        if (!poolAccount.isComplete) {
          toast.error('Pool must be complete before finalization');
          onClose();
          return;
        }

        if (poolAccount.isFinalized) {
          toast.error('Pool is already finalized');
          onClose();
          return;
        }

        // Get config
        const [configPda] = PublicKey.findProgramAddressSync(
          [CONFIG_SEED],
          PROGRAM_ID
        );
        const config = await program.account.config.fetch(configPda);

        // Get pool authority
        const { poolAuthority: poolAuthorityPda } = await derivePoolPDAs(pool.projectMint);

        // Get token balances
        const { poolProjectAta, poolStableAta } = await getPoolTokenAccounts(
          pool.projectMint,
          poolAuthorityPda,
          USDC_DEVNET
        );

        let projectBalance = 0;
        let stableBalance = 0;

        try {
          const projectTokenBalance = await connection.getTokenAccountBalance(poolProjectAta);
          projectBalance = projectTokenBalance.value.uiAmount || 0;
        } catch (e) {}

        try {
          const stableTokenBalance = await connection.getTokenAccountBalance(poolStableAta);
          stableBalance = stableTokenBalance.value.uiAmount || 0;
        } catch (e) {}

        // Calculate locked tokens if wallet limits are active
        const hasWalletLimits = poolAccount.limits.wLimitPercent > 0;
        const lockedTokens = hasWalletLimits ? poolAccount.totalSellAmount.toNumber()/1e9 : 0;
        const availableProjectBalance = projectBalance - lockedTokens;

        // Calculate fees based on available balance
        const fee = config.fee.toNumber() / TOKEN_STANDARDS.PERCENTAGE_BASIS_POINTS;
        const creatorFeeProject = availableProjectBalance * fee / 2;
        const creatorFeeStable = stableBalance * fee / 2;
        const protocolFeeProject = availableProjectBalance * fee / 2;
        const protocolFeeStable = stableBalance * fee / 2;

        // Remaining for liquidity
        const remainingProject = availableProjectBalance * (1 - fee);
        const remainingStable = stableBalance * (1 - fee);

        setPoolInfo({
          projectBalance,
          stableBalance,
          lockedTokens,
          availableProjectBalance,
          hasWalletLimits,
          creatorFeeProject,
          creatorFeeStable,
          protocolFeeProject,
          protocolFeeStable,
          remainingProject,
          remainingStable,
          config,
          poolAccount
        });

      } catch (error) {
        console.error('Error fetching pool info:', error);
        toast.error('Failed to fetch pool information');
        onClose();
      } finally {
        setLoadingInfo(false);
      }
    };

    fetchPoolInfo();
  }, [wallet.publicKey, isOpen, pool, connection, onClose]);

  // Handle finalization
  const handleFinalize = async () => {
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

      // Derive PDAs
      const [configPda] = PublicKey.findProgramAddressSync(
        [CONFIG_SEED],
        PROGRAM_ID
      );

      const { 
        pool: poolPda, 
        poolAuthority: poolAuthorityPda,
        bundlePool: bundlePoolPda 
      } = await derivePoolPDAs(pool.projectMint);

      const { poolProjectAta, poolStableAta } = await getPoolTokenAccounts(
        pool.projectMint,
        poolAuthorityPda,
        USDC_DEVNET
      );

      // Get all token accounts
      const creatorProjectAta = await getAssociatedTokenAddress(pool.projectMint, wallet.publicKey);
      const creatorStableAta = await getAssociatedTokenAddress(USDC_DEVNET, wallet.publicKey);
      const feeReceiverProjectAta = await getAssociatedTokenAddress(pool.projectMint, poolInfo.config.feeReceiver);
      const feeReceiverStableAta = await getAssociatedTokenAddress(USDC_DEVNET, poolInfo.config.feeReceiver);

      // Build transaction
      const builder = createPoolTransactionBuilder(connection, wallet);

      // Add ATA creation instructions
      await builder.addMultipleATAs([
        { ata: creatorProjectAta, owner: wallet.publicKey, mint: pool.projectMint },
        { ata: creatorStableAta, owner: wallet.publicKey, mint: USDC_DEVNET },
        { ata: feeReceiverProjectAta, owner: poolInfo.config.feeReceiver, mint: pool.projectMint },
        { ata: feeReceiverStableAta, owner: poolInfo.config.feeReceiver, mint: USDC_DEVNET }
      ]);

      // Check if bundle pool exists
      let bundlePoolExists = false;
      try {
        await program.account.bundleBuyPool.fetch(bundlePoolPda);
        bundlePoolExists = true;
      } catch (e) {}

      // Create finalize instruction
      const finalizeIx = await program.methods
        .finalizePoolRaydium()
        .accounts({
          configAcc: configPda,
          poolAcc: pool.address,
          poolAuthority: poolAuthorityPda,
          poolProjectAta: poolProjectAta,
          poolStableAta: poolStableAta,
          bundlePool: bundlePoolExists ? bundlePoolPda : null,
          bundlePool: bundlePoolPda,
          creator: wallet.publicKey,
          mintAccount: pool.projectMint,
          stableMint: USDC_DEVNET,
          creatorProjectAta: creatorProjectAta,
          creatorStableAta: creatorStableAta,
          feeReceiver: poolInfo.config.feeReceiver,
          feeReceiverProjectAta: feeReceiverProjectAta,
          feeReceiverStableAta: feeReceiverStableAta,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      builder.addInstruction(finalizeIx);

      // Send transaction
      const txSig = await builder.buildAndSend();
      
      toast.success(SUCCESS_MESSAGES.POOL_FINALIZED);
      console.log('Finalize transaction:', txSig);
      
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
      title="Finalize Pool"
    >
      <div className="space-y-4">
        {loadingInfo ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            <p className="mt-2 text-gray-400">Loading pool information...</p>
          </div>
        ) : poolInfo && (
          <>
            {/* Pool Balance */}
            <ModalSection title="Current Pool Balance">
              <div className="bg-gray-700 rounded p-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-400 block">Total Token Balance:</span>
                    <span className="font-semibold">{formatTokenAmount(poolInfo.projectBalance, pool.tokenSymbol)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">USDC Balance:</span>
                    <span className="font-semibold">{formatUSD(poolInfo.stableBalance)}</span>
                  </div>
                </div>
                
                {poolInfo.hasWalletLimits && (
                  <div className="border-t border-gray-600 pt-3 mt-3">
                    <div className="bg-yellow-900/20 border border-yellow-600/50 rounded p-3">
                      <div className="flex items-center gap-2 text-yellow-400 mb-2">
                        <span>⚠️</span>
                        <span className="font-semibold">Wallet Limits Active</span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-yellow-300">Locked Tokens (for users):</span>
                          <span className="text-yellow-200">{formatTokenAmount(poolInfo.lockedTokens, pool.tokenSymbol)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-yellow-300">Available for Liquidity:</span>
                          <span className="text-yellow-200 font-semibold">{formatTokenAmount(poolInfo.availableProjectBalance, pool.tokenSymbol)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ModalSection>

            {/* Fee Distribution */}
            <ModalSection title={`Fee Distribution (10% of ${poolInfo.hasWalletLimits ? 'available' : 'total'} balance)`}>
              <div className="bg-blue-900/20 border border-blue-600/50 rounded p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-300">Creator (5%):</span>
                  <span className="text-blue-200">
                    {formatTokenAmount(poolInfo.creatorFeeProject, pool.tokenSymbol)} + {formatUSD(poolInfo.creatorFeeStable)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-300">Protocol (5%):</span>
                  <span className="text-blue-200">
                    {formatTokenAmount(poolInfo.protocolFeeProject, pool.tokenSymbol)} + {formatUSD(poolInfo.protocolFeeStable)}
                  </span>
                </div>
              </div>
            </ModalSection>

            {/* Remaining Liquidity */}
            <ModalSection title="Remaining for Raydium (90%)">
              <div className="bg-green-900/20 border border-green-600/50 rounded p-3 space-y-1 text-sm">
                <p className="text-green-300">{formatTokenAmount(poolInfo.remainingProject, pool.tokenSymbol)}</p>
                <p className="text-green-300">{formatUSD(poolInfo.remainingStable)}</p>
              </div>
            </ModalSection>

            {/* Warning */}
            <ModalInfoBox variant="warning">
              <span className="text-sm">
                ⚠️ After finalization, you'll need to create the Raydium pool in a separate transaction.
                {poolInfo.hasWalletLimits && (
                  <>
                    <br />
                    <strong>Note:</strong> {formatTokenAmount(poolInfo.lockedTokens, pool.tokenSymbol)} are reserved for users to claim.
                  </>
                )}
              </span>
            </ModalInfoBox>

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
                onClick={handleFinalize}
                loading={loading}
              >
                {loading ? 'Finalizing...' : 'Finalize Pool'}
              </ModalButton>
            </ModalButtonGroup>
          </>
        )}
      </div>
    </ModalBase>
  );
}