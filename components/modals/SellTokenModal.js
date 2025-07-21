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
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  UI_CONSTANTS,
  TOKEN_STANDARDS,
  PERCENTAGE_PRESETS,
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
  calculateSellUsdcOut, 
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
import { AlertCircle } from 'lucide-react';

export function SellTokenModal({ pool, isOpen, onClose, onSuccess }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // State
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [estimatedUSDC, setEstimatedUSDC] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [tokenBalance, setTokenBalance] = useState({ available: 0, locked: 0, total: 0 });
  const [loadingBalance, setLoadingBalance] = useState(true);
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

  // Fetch pool data and config
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

  // Fetch token balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!wallet.publicKey || !isOpen || !poolData) return;
      
      setLoadingBalance(true);
      try {
        const program = getProgram();
        if (!program) return;

        let availableBalance = 0;
        let lockedBalance = 0;

        const hasLimits = hasWalletLimits(poolData);

        if (hasLimits && !isRaydium) {
          // Check for locked tokens
          const { lockedTokens: lockedTokensPda } = await deriveUserPoolPDAs(
            pool.address, 
            wallet.publicKey
          );

          try {
            const lockedTokens = await program.account.lockedTokens.fetch(lockedTokensPda);
            lockedBalance = lockedTokens.amount.toNumber() / Math.pow(10, TOKEN_STANDARDS.TOKEN_DECIMALS);
          } catch (e) {
            // No locked tokens
          }
        } else {
          // Check regular token balance
          const tokenAta = await getAssociatedTokenAddress(pool.projectMint, wallet.publicKey);
          try {
            const balance = await connection.getTokenAccountBalance(tokenAta);
            availableBalance = parseFloat(balance.value.uiAmount || '0');
          } catch (e) {
            // No token account
          }
        }

        setTokenBalance({
          available: availableBalance,
          locked: lockedBalance,
          total: availableBalance + lockedBalance
        });

      } catch (err) {
        console.error('Error fetching token balance:', err);
      } finally {
        setLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [wallet.publicKey, pool, isOpen, poolData, connection, isRaydium, getProgram]);

  // Calculate estimated output
  useEffect(() => {
    const calculateEstimate = async () => {
      if (!amount || parseFloat(amount) <= 0 || !poolData || !config) {
        setEstimatedUSDC(null);
        return;
      }

      setCalculating(true);
      try {
        if (isRaydium) {
          // For Raydium, we can't calculate client-side accurately
          setEstimatedUSDC({ 
            usdcOut: 0, 
            priceImpact: 0, 
            fee: 0,
            tax: 0,
            message: 'Final amount calculated on confirmation'
          });
        } else {
          // Bonding curve calculation
          const result = calculateSellUsdcOut(
            poolData, 
            parseFloat(amount), 
            config
          );
          setEstimatedUSDC(result);
        }
      } catch (err) {
        console.error('Error calculating estimate:', err);
        setEstimatedUSDC(null);
      } finally {
        setCalculating(false);
      }
    };

    const debounceTimer = setTimeout(calculateEstimate, UI_CONSTANTS.DEBOUNCE_DELAY);
    return () => clearTimeout(debounceTimer);
  }, [amount, poolData, config, isRaydium]);

  // Handle percentage buttons
  const handlePercentageClick = (percentage) => {
    const newAmount = (tokenBalance.total * percentage / 100).toFixed(4);
    setAmount(newAmount);
  };

  // Handle sell
  const handleSell = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error(ERROR_MESSAGES.INVALID_AMOUNT);
      return;
    }

    if (parseFloat(amount) > tokenBalance.total) {
      toast.error(ERROR_MESSAGES.INSUFFICIENT_BALANCE);
      return;
    }

    try {
      setLoading(true);

      const program = getProgram();
      if (!program) throw new Error('Failed to initialize program');

      const projectAmountIn = numberToBN(parseFloat(amount), TOKEN_STANDARDS.TOKEN_DECIMALS);

      // Derive PDAs
      const { pool: poolPda, poolAuthority: poolAuthorityPda } = await derivePoolPDAs(pool.projectMint);
      const { 
        walletBalance: walletBalancePda,
        lockedTokens: lockedTokensPda 
      } = await deriveUserPoolPDAs(pool.address, wallet.publicKey);
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
      const recipientStableAta = await getAssociatedTokenAddress(USDC_DEVNET, wallet.publicKey);
      const feeReceiverStableAta = await getAssociatedTokenAddress(USDC_DEVNET, configAccount.feeReceiver);
      const taxReceiverAta = await getAssociatedTokenAddress(pool.projectMint, poolAccount.params.taxReceiver);

      let senderProjectAta = null;
      if (!hasLimits || isRaydium) {
        senderProjectAta = await getAssociatedTokenAddress(pool.projectMint, wallet.publicKey);
      }

      // Build transaction
      const builder = createTradingTransactionBuilder(connection, wallet, isRaydium);

      // Add ATA creation instructions
      await builder.addMultipleATAs([
        { ata: recipientStableAta, owner: wallet.publicKey, mint: USDC_DEVNET },
        ...(!isRaydium ? [{ ata: taxReceiverAta, owner: poolAccount.params.taxReceiver, mint: pool.projectMint }] : [])
      ]);

      // Build accounts for instruction
      const accounts = {
        configAcc: configPda,
        poolAcc: pool.address,
        projectMint: pool.projectMint,
        stableMint: USDC_DEVNET,
        sender: wallet.publicKey,
        senderProjectAta: (hasLimits && !isRaydium) ? null : senderProjectAta,
        lockedTokens: (hasLimits && !isRaydium) ? lockedTokensPda : null,
        walletBalance: walletBalancePda,
        recipient: wallet.publicKey,
        recipientStableAta: recipientStableAta,
        poolProjectAta: poolProjectAta,
        poolStableAta: poolStableAta,
        feeReceiverStableAta: feeReceiverStableAta,
        feeReceiver: configAccount.feeReceiver,
        taxReceiver: poolAccount.params.taxReceiver,
        taxReceiverAta: taxReceiverAta,
        poolAuthority: poolAuthorityPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
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

      // Create sell instruction
      const sellIx = await program.methods
        .sellToken(projectAmountIn)
        .accounts(accounts)
        .instruction();

      builder.addInstruction(sellIx);

      // Send transaction
      const txSig = await builder.buildAndSend();

      toast.success(SUCCESS_MESSAGES.TOKENS_SOLD);
      console.log('Sell transaction:', txSig);
      
      // Reset form
      setAmount('');
      setEstimatedUSDC(null);
      
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
      title={`Sell ${pool.tokenSymbol}`}
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
              <span className="text-gray-400">Sell Tax:</span>
              <span>{formatPercentage(poolData.params.sellTax / 100)}</span>
            </div>
          )}
        </div>

        {/* Token Balance */}
        {!loadingBalance && (
          <div className="bg-gray-700 rounded p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Your Balance:</span>
              <span className="font-semibold">
                {formatTokenAmount(tokenBalance.total, pool.tokenSymbol)}
              </span>
            </div>
            {tokenBalance.locked > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Locked:</span>
                <span className="text-yellow-400">{formatTokenAmount(tokenBalance.locked)}</span>
              </div>
            )}
          </div>
        )}

        {/* Amount Input */}
        <ModalSection title={`Amount (${pool.tokenSymbol})`}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.0001"
            min="0"
            max={tokenBalance.total.toString()}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            disabled={loading || loadingBalance}
          />
          
          {/* Quick percentage buttons */}
          <div className="flex gap-2 mt-2">
            {PERCENTAGE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePercentageClick(preset.value)}
                className="flex-1 text-xs py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                disabled={loading || tokenBalance.total === 0}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </ModalSection>

        {/* Estimated Output */}
        {estimatedUSDC && (
          <div className="bg-gray-700 rounded p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">You will receive:</span>
              <span className="text-lg font-semibold">
                {calculating ? (
                  <span className="text-gray-500">Calculating...</span>
                ) : estimatedUSDC.message ? (
                  <span className="text-sm text-gray-400">{estimatedUSDC.message}</span>
                ) : (
                  <>~{formatUSD(estimatedUSDC.usdcOut)}</>
                )}
              </span>
            </div>
            {estimatedUSDC.priceImpact > 1 && (
              <div className="text-xs text-yellow-400">
                Price Impact: {formatPercentage(estimatedUSDC.priceImpact)}
              </div>
            )}
          </div>
        )}

        {/* Wallet Limits Warning */}
        {poolData && hasWalletLimits(poolData) && !isRaydium && (
          <ModalInfoBox variant="warning">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>This pool has wallet limits. You may be restricted in how much you can sell.</span>
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
            variant="danger"
            onClick={handleSell}
            disabled={!amount || parseFloat(amount) <= 0 || tokenBalance.total === 0}
            loading={loading}
          >
            {loading ? 'Selling...' : 'Sell Tokens'}
          </ModalButton>
        </ModalButtonGroup>
      </div>
    </ModalBase>
  );
}