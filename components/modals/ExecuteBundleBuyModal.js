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
  CONFIG_SEED,
  USDC_DEVNET,
  RAYDIUM_AUTHORITY,
  RAYDIUM_CPMM_PROGRAM,
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
  getPoolTokenAccounts
} from '@/lib/program/pool-helpers';
import { bnToNumber } from '@/lib/utils/calculations';
import { formatTokenAmount, formatUSD, formatPercentage } from '@/lib/utils/formatters';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import { AlertTriangle, Users, Zap, Wallet, TrendingUp } from 'lucide-react';

export function ExecuteBundleBuyModal({ pool, isOpen, onClose, onSuccess }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // State
  const [loading, setLoading] = useState(false);
  const [bundleInfo, setBundleInfo] = useState(null);
  const [configData, setConfigData] = useState(null);
  const [executorBalance, setExecutorBalance] = useState(0);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [confirmStep, setConfirmStep] = useState(false);

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

  // // Check authorization
  // const isAuthorized = useCallback(() => {
  //   if (!wallet.publicKey || !configData) return false;
  //   return wallet.publicKey.equals(configData.owner) || 
  //          wallet.publicKey.equals(configData.bundleBuy);
  // }, [wallet.publicKey, configData]);

  // Fetch bundle and executor info
  useEffect(() => {
    const fetchInfo = async () => {
      if (!wallet.publicKey || !isOpen) return;
      
      setLoadingInfo(true);
      try {
        const program = getProgram();
        if (!program) return;

        // Fetch config
        const [configPda] = PublicKey.findProgramAddressSync(
          [CONFIG_SEED],
          PROGRAM_ID
        );
        const config = await program.account.config.fetch(configPda);
        setConfigData(config);

        // // Check authorization
        // if (!wallet.publicKey.equals(config.owner) && 
        //     !wallet.publicKey.equals(config.bundleBuy)) {
        //   toast.error(ERROR_MESSAGES.UNAUTHORIZED);
        //   onClose();
        //   return;
        // }

        // Get bundle pool PDA
        const { bundlePool: bundlePoolPda } = await derivePoolPDAs(pool.projectMint);

        // Fetch bundle pool data
        try {
          const bundlePoolData = await program.account.bundleBuyPool.fetch(bundlePoolPda);
          
          if (bundlePoolData.isExecuted) {
            toast.error('Bundle already executed');
            onClose();
            return;
          }

          const totalDeposits = bnToNumber(bundlePoolData.totalDeposits, TOKEN_STANDARDS.USDC_DECIMALS);
          const bundleFee = config.bundleFee.toNumber() / TOKEN_STANDARDS.PERCENTAGE_BASIS_POINTS;
          const feeAmount = totalDeposits * bundleFee;
          const swapAmount = totalDeposits - feeAmount;
          
          // Calculate executor bonus (0.2% of swap amount)
          const executorBonus = swapAmount * 0.002; // 0.2%
          const actualReimbursement = swapAmount - executorBonus;

          setBundleInfo({
            totalDeposits,
            bundleFee,
            feeAmount,
            swapAmount,
            executorBonus,
            actualReimbursement,
            isExecuted: false
          });

        } catch (e) {
          toast.error('No bundle pool found');
          onClose();
        }

        // Check executor's USDC balance
        const executorStableAta = await getAssociatedTokenAddress(USDC_DEVNET, wallet.publicKey);
        try {
          const balance = await connection.getTokenAccountBalance(executorStableAta);
          setExecutorBalance(parseFloat(balance.value.uiAmount || '0'));
        } catch (e) {
          setExecutorBalance(0);
        }

      } catch (error) {
        console.error('Error fetching bundle info:', error);
        toast.error('Failed to fetch bundle information');
        onClose();
      } finally {
        setLoadingInfo(false);
      }
    };

    fetchInfo();
  }, [wallet.publicKey, isOpen, pool, getProgram, onClose, connection]);

  // Handle execution
  const handleExecute = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    // if (!isAuthorized()) {
    //   toast.error(ERROR_MESSAGES.UNAUTHORIZED);
    //   return;
    // }

    if (executorBalance < bundleInfo.swapAmount) {
      toast.error(`Insufficient USDC balance. You need ${formatUSD(bundleInfo.swapAmount)} but have ${formatUSD(executorBalance)}`);
      return;
    }

    try {
      setLoading(true);

      const program = getProgram();
      if (!program) throw new Error('Failed to initialize program');

      // Get all PDAs
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

      // Get observation state PDA
      const [observationState] = PublicKey.findProgramAddressSync(
        [Buffer.from('observation'), new PublicKey(pool.raydiumPoolState).toBuffer()],
        RAYDIUM_CPMM_PROGRAM
      );

      // Get executor's token accounts
      const executorStableAta = await getAssociatedTokenAddress(
        USDC_DEVNET,
        wallet.publicKey
      );
      const executorProjectAta = await getAssociatedTokenAddress(
        pool.projectMint,
        wallet.publicKey
      );

      // Get fee receiver ATA
      const feeReceiverStableAta = await getAssociatedTokenAddress(
        USDC_DEVNET,
        configData.feeReceiver
      );

      // Build transaction
      const builder = createPoolTransactionBuilder(connection, wallet);

      // Add ATA creation if needed
      await builder.addMultipleATAs([
        { ata: executorProjectAta, owner: wallet.publicKey, mint: pool.projectMint },
        { ata: feeReceiverStableAta, owner: configData.feeReceiver, mint: USDC_DEVNET }
      ]);

      // Create execute bundle buy instruction
      const executeBundleIx = await program.methods
        .executeBundleBuy()
        .accounts({
          configAcc: configPda,
          pool: pool.address,
          poolAuthority: poolAuthorityPda,
          poolStableAta: poolStableAta,
          poolProjectAta: poolProjectAta,
          bundlePool: bundlePoolPda,
          executor: wallet.publicKey,
          executorStableAta: executorStableAta,
          executorProjectAta: executorProjectAta,
          feeReceiver: configData.feeReceiver,
          feeReceiverStableAta: feeReceiverStableAta,
          raydiumProgram: new PublicKey(pool.params.dexRouter),
          raydiumAuthority: RAYDIUM_AUTHORITY,
          raydiumPoolState: new PublicKey(pool.raydiumPoolState),
          raydiumAmmConfig: new PublicKey(pool.raydiumAmmConfig),
          raydiumToken0Vault: new PublicKey(pool.raydiumToken0Vault),
          raydiumToken1Vault: new PublicKey(pool.raydiumToken1Vault),
          raydiumObservationState: observationState,
          projectMint: pool.projectMint,
          stableMint: USDC_DEVNET,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      builder.addInstruction(executeBundleIx);

      // Send transaction
      const txSig = await builder.buildAndSend();
      
      toast.success('Bundle buy executed successfully! Tokens are now available for users to claim.');
      console.log('Execute bundle buy transaction:', txSig);
      
      onSuccess();
      onClose();
    } catch (error) {
      handleTransactionError(error);
    } finally {
      setLoading(false);
    }
  };

  const hasEnoughBalance = executorBalance >= (bundleInfo?.swapAmount || 0);

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Execute Bundle Buy"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {loadingInfo ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            <p className="mt-2 text-gray-400">Loading bundle information...</p>
          </div>
        ) : bundleInfo && !confirmStep ? (
          <>
            {/* New Executor Model Warning */}
            <ModalInfoBox variant="info">
              <div className="flex items-start gap-2">
                <Zap size={20} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold mb-1">Executor-Fronted Swap Model</p>
                  <p className="text-sm">
                    You will use your own USDC to perform the swap on Raydium. The pool will reimburse you 
                    and provide a 0.2% bonus as incentive for execution.
                  </p>
                </div>
              </div>
            </ModalInfoBox>

            {/* Executor Balance Check */}
            <ModalSection title="Your USDC Balance">
              <div className={`rounded p-4 ${hasEnoughBalance ? 'bg-green-900/20 border border-green-600/50' : 'bg-red-900/20 border border-red-600/50'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Current Balance:</span>
                  <span className={`font-semibold ${hasEnoughBalance ? 'text-green-400' : 'text-red-400'}`}>
                    {formatUSD(executorBalance)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Required for Swap:</span>
                  <span className="font-semibold">{formatUSD(bundleInfo.swapAmount)}</span>
                </div>
                {!hasEnoughBalance && (
                  <p className="text-red-400 text-sm mt-2">
                    ⚠️ Insufficient balance. You need {formatUSD(bundleInfo.swapAmount - executorBalance)} more USDC.
                  </p>
                )}
              </div>
            </ModalSection>

            {/* Bundle Details */}
            <ModalSection title="Bundle Information">
              <div className="bg-gray-700 rounded p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Bundle Deposits:</span>
                  <span className="font-semibold">{formatUSD(bundleInfo.totalDeposits)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bundle Fee ({formatPercentage(bundleInfo.bundleFee * 100)}):</span>
                  <span className="text-yellow-400">-{formatUSD(bundleInfo.feeAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount to Swap:</span>
                  <span className="font-semibold">{formatUSD(bundleInfo.swapAmount)}</span>
                </div>
                <div className="border-t border-gray-600 pt-3">
                  <div className="flex justify-between items-center text-green-400">
                    <span className="flex items-center gap-1">
                      <TrendingUp size={14} />
                      Your Executor Bonus (0.2%):
                    </span>
                    <span className="font-bold">+{formatUSD(bundleInfo.executorBonus)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    You'll be reimbursed {formatUSD(bundleInfo.actualReimbursement)} + keep {formatUSD(bundleInfo.executorBonus)} as bonus
                  </p>
                </div>
              </div>
            </ModalSection>

            {/* Execution Flow */}
            <ModalSection title="Execution Flow">
              <div className="bg-blue-900/20 border border-blue-600/50 rounded p-3 space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-blue-400">1.</span>
                  <span>Transfer {formatUSD(bundleInfo.feeAmount)} to protocol as fee</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400">2.</span>
                  <span>You swap {formatUSD(bundleInfo.swapAmount)} on Raydium</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400">3.</span>
                  <span>Pool reimburses you {formatUSD(bundleInfo.actualReimbursement)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400">4.</span>
                  <span>You transfer all received tokens to pool</span>
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
                variant="primary"
                onClick={() => setConfirmStep(true)}
                disabled={loading || !hasEnoughBalance}
              >
                {hasEnoughBalance ? 'Continue' : 'Insufficient Balance'}
              </ModalButton>
            </ModalButtonGroup>
          </>
        ) : bundleInfo && confirmStep ? (
          <>
            {/* Final Confirmation */}
            <ModalInfoBox variant="error">
              <div className="text-center py-4">
                <AlertTriangle size={48} className="mx-auto mb-4 text-red-400" />
                <h3 className="text-lg font-semibold mb-2">Final Confirmation</h3>
                <p className="text-sm mb-4">
                  You are about to swap <span className="font-bold">{formatUSD(bundleInfo.swapAmount)}</span>  USDC on Raydium for all bundle participants.
                </p>
              </div>
            </ModalInfoBox>

            <ModalButtonGroup>
              <ModalButton
                variant="secondary"
                onClick={() => setConfirmStep(false)}
                disabled={loading}
              >
                Go Back
              </ModalButton>
              <ModalButton
                variant="danger"
                onClick={handleExecute}
                loading={loading}
              >
                {loading ? 'Executing...' : 'Execute Bundle Buy'}
              </ModalButton>
            </ModalButtonGroup>
          </>
        ) : null}
      </div>
    </ModalBase>
  );
}