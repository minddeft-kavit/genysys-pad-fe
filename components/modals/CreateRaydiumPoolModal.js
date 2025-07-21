'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
  PublicKey, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY
} from '@solana/web3.js';
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
  RAYDIUM_CPMM_PROGRAM,
  RAYDIUM_AUTHORITY,
  RAYDIUM_FEE_TIERS,
  RAYDIUM_FEE_OPTIONS,
  CREATOR_POOL_FEE_ATA,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  FEES,
  EXTERNAL_LINKS,
  RAYDIUM_PROTOCOL_FEE_OWNER
} from '@/lib/constants';
import IDL from '@/lib/idl/solana_launchpad.json';
import { 
  ModalBase, 
  ModalSection, 
  ModalInfoBox, 
  ModalButtonGroup, 
  ModalButton 
} from '@/components/modals/shared/ModalBase';
import { createRaydiumPoolTransactionBuilder } from '@/components/modals/shared/TransactionBuilder';
import { 
  derivePoolPDAs,
  getPoolTokenAccounts,
  getTokenOrder,
  deriveRaydiumPDAs,
  checkRaydiumReadiness
} from '@/lib/program/pool-helpers';
import { bnToNumber } from '@/lib/utils/calculations';
import { formatTokenAmount, formatUSD, formatSOL } from '@/lib/utils/formatters';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import { AlertCircle, ExternalLink } from 'lucide-react';

export function CreateRaydiumPoolModal({ pool, isOpen, onClose, onSuccess }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // State
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('confirm'); // confirm, processing, success
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

        // Check readiness
        const readiness = checkRaydiumReadiness(poolAccount);
        if (!readiness.ready) {
          toast.error(readiness.reason);
          onClose();
          return;
        }

        // Get pool authority for balance check
        const { poolAuthority: poolAuthorityPda } = await derivePoolPDAs(pool.projectMint);
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

        // Verify available balance
        if (availableProjectBalance <= 0) {
          toast.error('No tokens available for liquidity (all tokens are locked for users)');
          onClose();
          return;
        }

        // Check SOL balance
        const solBalance = await connection.getBalance(wallet.publicKey);
        const requiredSol = FEES.CREATE_POOL_BUFFER_LAMPORTS;

        // Get fee tier info
        const feeTierOption = RAYDIUM_FEE_OPTIONS.find(
          opt => opt.value === poolAccount.params.raydiumFeeTier.toString()
        );

        setPoolInfo({
          projectBalance,
          stableBalance,
          lockedTokens,
          availableProjectBalance,
          hasWalletLimits,
          feeTier: poolAccount.params.raydiumFeeTier,
          feeTierText: feeTierOption?.label || 'Unknown',
          solBalance: solBalance / 1e9,
          hasEnoughSol: solBalance >= requiredSol,
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

  // Handle pool creation
  const handleCreatePool = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    if (!poolInfo.hasEnoughSol) {
      toast.error('Insufficient SOL for pool creation fee');
      return;
    }

    try {
      setLoading(true);
      setStep('processing');

      const provider = new AnchorProvider(
        connection,
        wallet,
        { commitment: 'confirmed' }
      );
      setProvider(provider);
      
      const program = new Program(IDL, provider);

      // Derive all PDAs
      const [configPda] = PublicKey.findProgramAddressSync(
        [CONFIG_SEED],
        PROGRAM_ID
      );

      const { poolAuthority: poolAuthorityPda,bundlePool: bundlePoolPda } = await derivePoolPDAs(pool.projectMint);
      const { poolProjectAta, poolStableAta } = await getPoolTokenAccounts(
        pool.projectMint,
        poolAuthorityPda,
        USDC_DEVNET
      );

      // Token ordering
      const tokenOrder = getTokenOrder(pool.projectMint, USDC_DEVNET);
      const { token0, token1, isFirstToken0 } = tokenOrder;

      console.log('Token ordering:', {
        token0: token0.toBase58(),
        token1: token1.toBase58(),
        isProjectToken0: isFirstToken0
      });

      // Get AMM config and derive Raydium PDAs
      const ammConfig = RAYDIUM_FEE_TIERS[0];
      const raydiumPDAs = await deriveRaydiumPDAs(ammConfig, token0, token1);

      // Get creator's token accounts
      const creatorProjectAta = await getAssociatedTokenAddress(pool.projectMint, wallet.publicKey);
      const creatorStableAta = await getAssociatedTokenAddress(USDC_DEVNET, wallet.publicKey);
      const creatorLpToken = await getAssociatedTokenAddress(raydiumPDAs.lpMint, wallet.publicKey, true);

      // Determine creator's token accounts based on ordering
      const raydiumCreatorToken0 = isFirstToken0 ? creatorProjectAta : creatorStableAta;
      const raydiumCreatorToken1 = isFirstToken0 ? creatorStableAta : creatorProjectAta;

      // Build transaction
      const builder = createRaydiumPoolTransactionBuilder(connection, wallet);

      // Create all necessary ATAs
      await builder.addMultipleATAs([
        { ata: CREATOR_POOL_FEE_ATA, owner: RAYDIUM_PROTOCOL_FEE_OWNER, mint: USDC_DEVNET },
        { ata: creatorProjectAta, owner: wallet.publicKey, mint: pool.projectMint },
        { ata: creatorStableAta, owner: wallet.publicKey, mint: USDC_DEVNET }
      ]);

      // Create Raydium pool instruction
      const createPoolIx = await program.methods
        .createRaydiumPool()
        .accounts({
          configAcc: configPda,
          poolAcc: pool.address,
          poolAuthority: poolAuthorityPda,
          poolProjectAta: poolProjectAta,
          poolStableAta: poolStableAta,
          bundlePool: bundlePoolPda,
          creator: wallet.publicKey,
          mintAccount: pool.projectMint,
          stableMint: USDC_DEVNET,
          raydiumProgram: RAYDIUM_CPMM_PROGRAM,
          raydiumAmmConfig: ammConfig,
          raydiumAuthority: RAYDIUM_AUTHORITY,
          raydiumPoolState: raydiumPDAs.poolState,
          raydiumToken0Mint: token0,
          raydiumToken1Mint: token1,
          raydiumLpMint: raydiumPDAs.lpMint,
          raydiumCreatorToken0: raydiumCreatorToken0,
          raydiumCreatorToken1: raydiumCreatorToken1,
          raydiumCreatorLpToken: creatorLpToken,
          raydiumToken0Vault: raydiumPDAs.token0Vault,
          raydiumToken1Vault: raydiumPDAs.token1Vault,
          raydiumCreatePoolFee: CREATOR_POOL_FEE_ATA,
          raydiumObservationState: raydiumPDAs.observationState,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      builder.addInstruction(createPoolIx);

      // Send transaction
      const txSig = await builder.buildAndSend();
      
      console.log('Raydium pool created:', txSig);
      toast.success(SUCCESS_MESSAGES.RAYDIUM_POOL_CREATED);
      setStep('success');
      
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 3000);

    } catch (error) {
      handleTransactionError(error);
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Create Raydium Pool"
      showCloseButton={step !== 'processing'}
    >
      <div className="space-y-4">
        {loadingInfo ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            <p className="mt-2 text-gray-400">Loading pool information...</p>
          </div>
        ) : step === 'success' ? (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-semibold text-green-400 mb-2">Pool Created!</h3>
            <p className="text-gray-400 mb-4">Your token is now trading on Raydium!</p>
            <button
              onClick={() => window.open(`${EXTERNAL_LINKS.RAYDIUM_SWAP}?inputMint=${pool.projectMint.toString()}&outputMint=${USDC_DEVNET.toString()}`, '_blank')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              View on Raydium
              <ExternalLink size={16} />
            </button>
          </div>
        ) : step === 'processing' ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">Creating Raydium Pool...</h3>
            <p className="text-gray-400 text-sm">Transferring liquidity and initializing pool...</p>
            <div className="mt-4 bg-gray-700 rounded p-2">
              <p className="text-xs text-gray-400">This may take a few moments</p>
            </div>
          </div>
        ) : poolInfo && (
          <>
            {/* Liquidity Info */}
            <ModalSection title="Liquidity to Add">
              <div className="bg-gray-700 rounded p-4 space-y-3 text-sm">
                {poolInfo.hasWalletLimits ? (
                  <>
                    <div className="bg-yellow-900/20 border border-yellow-600/50 rounded p-2 mb-3">
                      <div className="flex items-center gap-2 text-yellow-400 text-xs mb-1">
                        <AlertCircle size={14} />
                        <span className="font-medium">Wallet Limits Active</span>
                      </div>
                      <p className="text-xs text-yellow-300">
                        {formatTokenAmount(poolInfo.lockedTokens, pool.tokenSymbol)} are locked for users
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Available Token Amount:</span>
                        <span className="font-semibold">{formatTokenAmount(poolInfo.availableProjectBalance, pool.tokenSymbol)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">USDC Amount:</span>
                        <span className="font-semibold">{formatUSD(poolInfo.stableBalance)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">From pool reserves</p>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Token Amount:</span>
                      <span>{formatTokenAmount(poolInfo.projectBalance, pool.tokenSymbol)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">USDC Amount:</span>
                      <span>{formatUSD(poolInfo.stableBalance)}</span>
                    </div>
                  </>
                )}
              </div>
            </ModalSection>

            {/* Pool Configuration */}
            <ModalSection title="Pool Configuration">
              <div className="bg-blue-900/20 border border-blue-600/50 rounded p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Fee Tier:</span>
                  <span className="text-blue-300">{poolInfo.feeTierText}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Pool Type:</span>
                  <span className="text-blue-300">Concentrated Liquidity (CPMM)</span>
                </div>
              </div>
            </ModalSection>

            {/* Fee Warning */}
            <ModalInfoBox variant="warning">
              <div className="flex items-start gap-2">
                <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Pool Creation Fee: {formatSOL(FEES.CREATE_POOL_FEE_LAMPORTS)}</p>
                  <p className="text-xs mt-1">
                    Your balance: {poolInfo.solBalance.toFixed(2)} SOL
                    {!poolInfo.hasEnoughSol && ' (Insufficient)'}
                  </p>
                  <p className="text-xs mt-1 text-yellow-300">
                    Note: Liquidity will be temporarily transferred to your wallet for Raydium initialization
                  </p>
                  {poolInfo.hasWalletLimits && (
                    <p className="text-xs mt-1 text-yellow-300">
                      Locked tokens ({formatTokenAmount(poolInfo.lockedTokens, pool.tokenSymbol)}) will remain for users to claim
                    </p>
                  )}
                </div>
              </div>
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
                variant="primary"
                onClick={handleCreatePool}
                disabled={!poolInfo.hasEnoughSol || poolInfo.availableProjectBalance <= 0}
                loading={loading}
              >
                {loading ? 'Creating...' : `Create Pool (${FEES.CREATE_POOL_FEE_SOL} SOL)`}
              </ModalButton>
            </ModalButtonGroup>
          </>
        )}
      </div>
    </ModalBase>
  );
}