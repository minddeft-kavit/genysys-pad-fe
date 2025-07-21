'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Program, AnchorProvider, setProvider, BN } from '@coral-xyz/anchor';
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
  FEES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  UI_CONSTANTS,
  TOKEN_STANDARDS,
  RAYDIUM_CPMM_PROGRAM
} from '@/lib/constants';
import IDL from '@/lib/idl/solana_launchpad.json';
import { 
  ModalBase, 
  ModalSection, 
  ModalInfoBox, 
  ModalButtonGroup, 
  ModalButton 
} from '@/components/modals/shared/ModalBase';
import { createTradingTransactionBuilder } from '@/components/modals/shared/TransactionBuilder';
import { 
  derivePoolPDAs, 
  deriveUserPoolPDAs, 
  getPoolTokenAccounts,
  hasWalletLimits 
} from '@/lib/program/pool-helpers';
import { 
  calculateBuyOutput,
  calculateBuyTokensOut, 
  calculateCurrentPrice,
  numberToBN 
} from '@/lib/utils/calculations';
import { 
  formatTokenAmount, 
  formatUSD, 
  formatPercentage 
} from '@/lib/utils/formatters';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import { Info } from 'lucide-react';

export function BuyTokenModal({ pool, isOpen, onClose, onSuccess }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // State
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [estimatedTokens, setEstimatedTokens] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [poolData, setPoolData] = useState(null);
  const [config, setConfig] = useState(null);

  const isRaydium = pool.isFinalized && pool.raydiumPoolState && pool.raydiumPoolState !== PublicKey.default.toString();

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

  // Fetch pool data
  useEffect(() => {
    const fetchData = async () => {
      if (!wallet.publicKey || !isOpen) return;
      
      try {
        const program = getProgram();
        if (!program) return;
        
        // Fetch pool data
        const poolAccount = await program.account.pool.fetch(pool.address);
        setPoolData(poolAccount);
        
        // Fetch config
        const [configPda] = PublicKey.findProgramAddressSync(
          [CONFIG_SEED],
          PROGRAM_ID
        );
        const configAccount = await program.account.config.fetch(configPda);
        setConfig(configAccount);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [wallet.publicKey, isOpen, pool.address, getProgram]);

  // Calculate estimated tokens
  useEffect(() => {
    const calculateEstimate = async () => {
      if (!amount || parseFloat(amount) <= 0 || !poolData || !config) {
        setEstimatedTokens(null);
        return;
      }

      setCalculating(true);
      try {
        if (isRaydium) {
          // For Raydium pools, we can't calculate client-side accurately
          setEstimatedTokens({ 
            tokensOut: 0, 
            priceImpact: 0, 
            fee: parseFloat(amount) * FEES.TRADING_FEE_DECIMAL,
            tax: 0,
            message: 'Final amount calculated on confirmation'
          });
        } else {
          // Bonding curve calculation
          const result = calculateBuyOutput(
            poolData, 
            parseFloat(amount), 
            
          );
          setEstimatedTokens(result);
        }
      } catch (err) {
        console.error('Error calculating estimate:', err);
        setEstimatedTokens(null);
      } finally {
        setCalculating(false);
      }
    };

    const debounceTimer = setTimeout(calculateEstimate, UI_CONSTANTS.DEBOUNCE_DELAY);
    return () => clearTimeout(debounceTimer);
  }, [amount, poolData, config, isRaydium]);

  // Handle buy
  const handleBuy = async () => {
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

      const stableAmountIn = numberToBN(parseFloat(amount), TOKEN_STANDARDS.USDC_DECIMALS);

      // Derive PDAs
      const { pool: poolPda, poolAuthority: poolAuthorityPda } = await derivePoolPDAs(pool.projectMint);
      const { lockedTokens: lockedTokensPda } = await deriveUserPoolPDAs(pool.address, wallet.publicKey);
      const { poolProjectAta, poolStableAta } = await getPoolTokenAccounts(
        pool.projectMint,
        poolAuthorityPda,
        USDC_DEVNET
      );

      const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);
      
      // Refresh pool data for latest state
      const poolAccount = await program.account.pool.fetch(pool.address);
      const configAccount = await program.account.config.fetch(configPda);
      const hasLimits = hasWalletLimits(poolAccount);

      // Get token accounts
      const senderStableAta = await getAssociatedTokenAddress(USDC_DEVNET, wallet.publicKey);
      const feeReceiverStableAta = await getAssociatedTokenAddress(USDC_DEVNET, configAccount.feeReceiver);
      const taxReceiverAta = await getAssociatedTokenAddress(pool.projectMint, poolAccount.params.taxReceiver);

      let recipientProjectAta = null;
      if (!hasLimits || isRaydium) {
        recipientProjectAta = await getAssociatedTokenAddress(pool.projectMint, wallet.publicKey);
      }

      // Build transaction
      const builder = createTradingTransactionBuilder(connection, wallet, isRaydium);

      // Add ATA creation instructions
      await builder.addMultipleATAs([
        { ata: senderStableAta, owner: wallet.publicKey, mint: USDC_DEVNET },
        ...(recipientProjectAta ? [{ ata: recipientProjectAta, owner: wallet.publicKey, mint: pool.projectMint }] : []),
        { ata: taxReceiverAta, owner: poolAccount.params.taxReceiver, mint: pool.projectMint }
      ]);

      // Build accounts for instruction
      const accounts = {
        configAcc: configPda,
        poolAcc: pool.address,
        projectMint: pool.projectMint,
        stableMint: USDC_DEVNET,
        sender: wallet.publicKey,
        senderStableAta: senderStableAta,
        recipient: wallet.publicKey,
        recipientProjectAta: recipientProjectAta,
        lockedTokens: hasLimits && !isRaydium ? lockedTokensPda : null,
        poolStableAta: poolStableAta,
        poolProjectAta: poolProjectAta,
        feeReceiver: configAccount.feeReceiver,
        feeReceiverStableAta: feeReceiverStableAta,
        taxReceiver: poolAccount.params.taxReceiver,
        taxReceiverAta: taxReceiverAta,
        poolAuthority: poolAuthorityPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      };

      // Add Raydium accounts if needed
      if (isRaydium) {

          const [observationState] = PublicKey.findProgramAddressSync(
            [Buffer.from('observation'), poolData.raydiumPoolState.toBuffer()], // <-- Use poolData.raydiumPoolState directly
            RAYDIUM_CPMM_PROGRAM // <-- Use RAYDIUM_CPMM_PROGRAM, not the pool state
          );

        

        Object.assign(accounts, {
          raydiumProgram: new PublicKey(poolData.params.dexRouter.toString()),
          raydiumPoolState: poolData.raydiumPoolState,
          raydiumAmmConfig: poolData.raydiumAmmConfig,
          raydiumToken0Vault: poolData.raydiumToken0Vault,
          raydiumToken1Vault: poolData.raydiumToken1Vault,
          raydiumObservationState: observationState,
          raydiumAuthority: RAYDIUM_AUTHORITY,
          raydiumTickArray0: null,
          raydiumTickArray1: null,
          raydiumTickArray2: null,
        });
      } else {
        // Set null for non-Raydium
        Object.assign(accounts, {
          raydiumProgram: null,
          raydiumPoolState: null,
          raydiumAmmConfig: null,
          raydiumToken0Vault: null,
          raydiumToken1Vault: null,
          raydiumObservationState: null,
          raydiumAuthority: null,
          raydiumTickArray0: null,
          raydiumTickArray1: null,
          raydiumTickArray2: null,
        });
      }

      // Create buy instruction
      const buyIx = await program.methods
        .buyToken(stableAmountIn)
        .accounts(accounts)
        .instruction();

      builder.addInstruction(buyIx);

      // Send transaction
      const txSig = await builder.buildAndSend();

      toast.success(SUCCESS_MESSAGES.TOKENS_PURCHASED);
      console.log('Buy transaction:', txSig);
      
      // Reset form
      setAmount('');
      setEstimatedTokens(null);
      
      onSuccess();
      onClose();
    } catch (error) {
      handleTransactionError(error);
    } finally {
      setLoading(false);
    }
  };

  const currentPrice = poolData ? calculateCurrentPrice(poolData) : 0;

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title={`Buy ${pool.tokenSymbol}`}
    >
      <div className="space-y-4">
        {/* Pool Info */}
        <div className="bg-gray-700 rounded p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Current Price:</span>
            <span>{formatUSD(currentPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Trading On:</span>
            <span className={isRaydium ? 'text-blue-400' : 'text-purple-400'}>
              {isRaydium ? 'Raydium CPMM' : 'Bonding Curve'}
            </span>
          </div>
          {poolData && (
            <div className="flex justify-between">
              <span className="text-gray-400">Buy Tax:</span>
              <span>{formatPercentage(poolData.params.buyTax / 100)}</span>
            </div>
          )}
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

        {/* Estimated Output */}
        {estimatedTokens && (
          <div className="bg-gray-700 rounded p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">You will receive:</span>
              <span className="text-lg font-semibold">
                {calculating ? (
                  <span className="text-gray-500">Calculating...</span>
                ) : estimatedTokens.message ? (
                  <span className="text-sm text-gray-400">{estimatedTokens.message}</span>
                ) : (
                  <>~{formatTokenAmount(estimatedTokens.tokensOut, pool.tokenSymbol)}</>
                )}
              </span>
            </div>
            {estimatedTokens.priceImpact > 1 && (
              <div className="text-xs text-yellow-400">
                Price Impact: {formatPercentage(estimatedTokens.priceImpact)}
              </div>
            )}
          </div>
        )}

        {/* Wallet Limits Warning */}
        {poolData && hasWalletLimits(poolData) && !isRaydium && (
          <ModalInfoBox variant="warning">
            <div className="flex items-start gap-2">
              <Info size={16} className="mt-0.5 flex-shrink-0" />
              <span>This pool has wallet limits. Your tokens will be locked until you can claim them.</span>
            </div>
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
            variant="primary"
            onClick={handleBuy}
            disabled={!amount || parseFloat(amount) <= 0}
            loading={loading}
          >
            {loading ? 'Buying...' : 'Buy Tokens'}
          </ModalButton>
        </ModalButtonGroup>
      </div>
    </ModalBase>
  );
}