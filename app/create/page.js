'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, ComputeBudgetProgram } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getAssociatedTokenAddress,
  MINT_SIZE
} from '@solana/spl-token';
import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { 
  PROGRAM_ID, 
  CONFIG_SEED,
  POOL_SEED,
  AUTHORITY_SEED,
  RAYDIUM_CPMM_PROGRAM,
  USDC_DEVNET,
  METADATA_PROGRAM_ID,
  METADATA_SEED,
  DEFAULT_FORM_VALUES,
  VALIDATION,
  TOKEN_STANDARDS,
  RAYDIUM_FEE_OPTIONS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
} from '@/lib/constants';
import IDL from '@/lib/idl/solana_launchpad.json';
import { sendTransaction } from '@/lib/program/transaction-helper';
import { numberToBN } from '@/lib/utils/calculations';
import { handleTransactionError } from '@/lib/utils/errors';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Info, AlertCircle } from 'lucide-react';

export default function CreatePoolPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [stableCoins, setStableCoins] = useState([]);
  const [dexRouters, setDexRouters] = useState([]);
  
  // Form state
  const [formData, setFormData] = useState({
    // Token Details
    name: '',
    symbol: '',
    url: '',
    
    // Pool Configuration
    dexRouter: '',
    pairToken: '',
    startPrice: '',
    endPrice: '',
    buyTax: DEFAULT_FORM_VALUES.BUY_TAX,
    sellTax: DEFAULT_FORM_VALUES.SELL_TAX,
    taxReceiver: '',
    creatorPercentage: DEFAULT_FORM_VALUES.CREATOR_PERCENTAGE,
    minDeposit: DEFAULT_FORM_VALUES.MIN_DEPOSIT,
    maxDeposit: DEFAULT_FORM_VALUES.MAX_DEPOSIT,
    
    // Raydium Settings
    useRaydium: false,
    raydiumFeeTier: DEFAULT_FORM_VALUES.RAYDIUM_FEE_TIER,
    
    // Limit Parameters
    gLimitPeriod: DEFAULT_FORM_VALUES.G_LIMIT_PERIOD,
    gLimitPercent: DEFAULT_FORM_VALUES.G_LIMIT_PERCENT,
    wLimitPeriod: DEFAULT_FORM_VALUES.W_LIMIT_PERIOD,
    wLimitPercent: DEFAULT_FORM_VALUES.W_LIMIT_PERCENT,
  });

  useEffect(() => {
    if (wallet.publicKey) {
      fetchConfigData();
      // Auto-fill tax receiver with wallet address
      setFormData(prev => ({ ...prev, taxReceiver: wallet.publicKey.toBase58() }));
    }
  }, [wallet.publicKey]);

  const fetchConfigData = async () => {
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

      const config = await program.account.config.fetch(configPda);
      setStableCoins(config.stableCoins);
      setDexRouters(config.dexRouters);
      
      // Set default values
      if (config.stableCoins.length > 0) {
        setFormData(prev => ({ ...prev, pairToken: config.stableCoins[0].mint.toString() }));
      }
      if (config.dexRouters.length > 0) {
        setFormData(prev => ({ ...prev, dexRouter: config.dexRouters[0].toString() }));
      }
    } catch (error) {
      console.error('Error fetching config:', error);
      toast.error('Failed to fetch configuration');
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const validateForm = () => {
    if (!formData.name || formData.name.length > VALIDATION.MAX_NAME_LENGTH) {
      throw new Error(`Token name is required and must be ${VALIDATION.MAX_NAME_LENGTH} characters or less`);
    }
    if (!formData.symbol || formData.symbol.length > VALIDATION.MAX_SYMBOL_LENGTH) {
      throw new Error(`Token symbol is required and must be ${VALIDATION.MAX_SYMBOL_LENGTH} characters or less`);
    }
    if (!formData.url || formData.url.length > VALIDATION.MAX_URL_LENGTH) {
      throw new Error(`Token URL is required and must be ${VALIDATION.MAX_URL_LENGTH} characters or less`);
    }
    
    const startPrice = parseFloat(formData.startPrice);
    const endPrice = parseFloat(formData.endPrice);
    
    if (!startPrice || startPrice < VALIDATION.MIN_PRICE) {
      throw new Error(`Start price must be greater than ${VALIDATION.MIN_PRICE}`);
    }
    if (!endPrice || endPrice <= startPrice) {
      throw new Error('End price must be greater than start price');
    }
    
    const buyTax = parseInt(formData.buyTax);
    const sellTax = parseInt(formData.sellTax);
    
    if (buyTax < 0 || buyTax > VALIDATION.MAX_TAX_BASIS_POINTS) {
      throw new Error('Buy tax must be between 0% and 100%');
    }
    if (sellTax < 0 || sellTax > VALIDATION.MAX_TAX_BASIS_POINTS) {
      throw new Error('Sell tax must be between 0% and 100%');
    }
    
    try {
      new PublicKey(formData.taxReceiver);
    } catch {
      throw new Error('Invalid tax receiver address');
    }
  };

  const handleCreatePool = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    try {
      validateForm();
      setLoading(true);

      const provider = new AnchorProvider(
        connection,
        wallet,
        { commitment: 'confirmed' }
      );
      setProvider(provider);
      
      const program = new Program(IDL, provider);

      // Create mint keypair
      const mintKeypair = Keypair.generate();
      const mintPubkey = mintKeypair.publicKey;

      // Get config
      const [configPda] = PublicKey.findProgramAddressSync(
        [CONFIG_SEED],
        PROGRAM_ID
      );

      // Derive PDAs
      const [poolPda] = PublicKey.findProgramAddressSync(
        [POOL_SEED, mintPubkey.toBuffer()],
        PROGRAM_ID
      );

      const [poolAuthorityPda] = PublicKey.findProgramAddressSync(
        [POOL_SEED, mintPubkey.toBuffer(), AUTHORITY_SEED],
        PROGRAM_ID
      );

      // Check if using Raydium
      const isRaydium = formData.dexRouter === RAYDIUM_CPMM_PROGRAM.toString();
      
      // Create params
      const params = {
        dexRouter: new PublicKey(formData.dexRouter),
        name: formData.name,
        symbol: formData.symbol,
        buyTax: parseInt(formData.buyTax),
        sellTax: parseInt(formData.sellTax),
        taxReceiver: new PublicKey(formData.taxReceiver),
        creator: wallet.publicKey,
        creatorPercentage: parseInt(formData.creatorPercentage),
        pairToken: new PublicKey(formData.pairToken),
        startPrice: numberToBN(parseFloat(formData.startPrice), TOKEN_STANDARDS.USDC_DECIMALS),
        endPrice: numberToBN(parseFloat(formData.endPrice), TOKEN_STANDARDS.USDC_DECIMALS),
        minDeposit: numberToBN(parseFloat(formData.minDeposit), TOKEN_STANDARDS.USDC_DECIMALS),
        maxDeposit: numberToBN(parseFloat(formData.maxDeposit), TOKEN_STANDARDS.USDC_DECIMALS),
        url: formData.url,
        raydiumFeeTier: isRaydium ? parseInt(formData.raydiumFeeTier) : 0,
        useRaydium: isRaydium,
      };

      const limitParams = {
        gLimitPeriod: numberToBN(parseInt(formData.gLimitPeriod), 0),
        gLimitPercent: numberToBN(parseInt(formData.gLimitPercent) * TOKEN_STANDARDS.PERCENTAGE_DECIMALS, 0),
        wLimitPeriod: numberToBN(parseInt(formData.wLimitPeriod), 0),
        wLimitPercent: numberToBN(parseInt(formData.wLimitPercent) * TOKEN_STANDARDS.PERCENTAGE_DECIMALS, 0),
        gTimestamp: numberToBN(0, 0),
        wTimestamp: numberToBN(0, 0),
        gPrice: numberToBN(0, 0),
        wPrice: numberToBN(0, 0),
      };

      // Get rent
      const rentExemptionAmount = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

      // Token accounts
      const poolProjectAta = await getAssociatedTokenAddress(
        mintPubkey,
        poolAuthorityPda,
        true
      );
      const poolStableAta = await getAssociatedTokenAddress(
        new PublicKey(formData.pairToken),
        poolAuthorityPda,
        true
      );
      const creatorStableAta = await getAssociatedTokenAddress(
        new PublicKey(formData.pairToken),
        wallet.publicKey
      );
      const config = await program.account.config.fetch(configPda);
      const feeReceiverAta = await getAssociatedTokenAddress(
        new PublicKey(formData.pairToken),
        config.feeReceiver
      );

      // Get metadata PDA
      const [metadataAccount] = PublicKey.findProgramAddressSync(
        [
          METADATA_SEED,
          METADATA_PROGRAM_ID.toBuffer(),
          mintPubkey.toBuffer()
        ],
        METADATA_PROGRAM_ID
      );

      // Build instructions
      const instructions = [];


//       instructions.push(
//   ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
// );

      // 1. Create mint account
      instructions.push(
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mintPubkey,
          space: MINT_SIZE,
          lamports: rentExemptionAmount,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // 2. Initialize mint
      instructions.push(
        createInitializeMintInstruction(
          mintPubkey,
          TOKEN_STANDARDS.TOKEN_DECIMALS,
          wallet.publicKey, // mint authority (temporary)
          null, // freeze authority
          TOKEN_PROGRAM_ID
        )
      );

      // 3. Create pool prelaunch instruction
      const createPoolIx = await program.methods
        .createPrelaunch(params, limitParams)
        .accounts({
          creator: wallet.publicKey,
          configAcc: configPda,
          poolAcc: poolPda,
          poolAuthority: poolAuthorityPda,
          payer: wallet.publicKey,
          metadataAccount: metadataAccount,
          creatorStableAccount: creatorStableAta,
          feeReceiverAccount: feeReceiverAta,
          mintAccount: mintPubkey,
          poolProjectAta: poolProjectAta,
          poolStableAta: poolStableAta,
          systemProgram: SystemProgram.programId,
          stableMint: new PublicKey(formData.pairToken),
          tokenMetadataProgram: METADATA_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      instructions.push(createPoolIx);

      // Send transaction with mint keypair as additional signer
      const txSig = await sendTransaction(
        connection, 
        wallet, 
        instructions, 
        [mintKeypair]
      );

      toast.success(SUCCESS_MESSAGES.POOL_CREATED);
      console.log('Pool creation transaction:', txSig);
      console.log('Token mint:', mintPubkey.toString());

      // Redirect to pools page
      setTimeout(() => {
        router.push('/pools');
      }, 2000);

    } catch (error) {
      handleTransactionError(error);
    } finally {
      setLoading(false);
    }
  };

  if (!wallet.connected) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <h1 className="text-3xl font-bold mb-4">Create Token Pool</h1>
        <p className="text-gray-400">{ERROR_MESSAGES.WALLET_NOT_CONNECTED}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Create New Token Pool</h1>

      <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
        <form onSubmit={(e) => { e.preventDefault(); handleCreatePool(); }}>
          {/* Token Details Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-purple-400">1.</span> Token Details
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Token Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  maxLength={VALIDATION.MAX_NAME_LENGTH}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="My Awesome Token"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Token Symbol *
                </label>
                <input
                  type="text"
                  name="symbol"
                  value={formData.symbol}
                  onChange={handleInputChange}
                  maxLength={VALIDATION.MAX_SYMBOL_LENGTH}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="TOKEN"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Metadata URL *
                </label>
                <input
                  type="text"
                  name="url"
                  value={formData.url}
                  onChange={handleInputChange}
                  maxLength={VALIDATION.MAX_URL_LENGTH}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="https://your-token-metadata.json"
                />
              </div>
            </div>
          </div>

          {/* Pool Configuration Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-purple-400">2.</span> Pool Configuration
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  DEX Router *
                </label>
                <select
                  name="dexRouter"
                  value={formData.dexRouter}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Select DEX Router</option>
                  {dexRouters.map((router, index) => (
                    <option key={index} value={router.toString()}>
                      {router.equals(RAYDIUM_CPMM_PROGRAM) ? 'Raydium CPMM' : `Router ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Stable Coin Pair *
                </label>
                <select
                  name="pairToken"
                  value={formData.pairToken}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Select Stable Coin</option>
                  {stableCoins.map((coin, index) => (
                    <option key={index} value={coin.mint.toString()}>
                      {coin.mint.equals(USDC_DEVNET) ? 'USDC (Devnet)' : `Stable ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Start Price (USD) *
                </label>
                <input
                  type="number"
                  name="startPrice"
                  value={formData.startPrice}
                  onChange={handleInputChange}
                  step="0.000001"
                  min={VALIDATION.MIN_PRICE}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="0.00001"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  End Price (USD) *
                </label>
                <input
                  type="number"
                  name="endPrice"
                  value={formData.endPrice}
                  onChange={handleInputChange}
                  step="0.000001"
                  min={VALIDATION.MIN_PRICE}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="0.001"
                />
              </div>
            </div>
          </div>

          {/* Tax Configuration */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-purple-400">3.</span> Tax Configuration
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Buy Tax (%)
                </label>
                <input
                  type="number"
                  name="buyTax"
                  value={formData.buyTax}
                  onChange={handleInputChange}
                  min="0"
                  max="100"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sell Tax (%)
                </label>
                <input
                  type="number"
                  name="sellTax"
                  value={formData.sellTax}
                  onChange={handleInputChange}
                  min="0"
                  max="100"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tax Receiver Address *
                </label>
                <input
                  type="text"
                  name="taxReceiver"
                  value={formData.taxReceiver}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="Tax receiver wallet address"
                />
              </div>
            </div>
          </div>

          {/* Bundle Configuration */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-purple-400">4.</span> Bundle Settings
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Min Deposit (USDC)
                </label>
                <input
                  type="number"
                  name="minDeposit"
                  value={formData.minDeposit}
                  onChange={handleInputChange}
                  min={VALIDATION.MIN_DEPOSIT_USD}
                  step="0.01"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Deposit (USDC)
                </label>
                <input
                  type="number"
                  name="maxDeposit"
                  value={formData.maxDeposit}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Raydium Settings - Only show if Raydium is selected */}
          {formData.dexRouter === RAYDIUM_CPMM_PROGRAM.toString() && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="text-purple-400">5.</span> Raydium Settings
              </h2>
              <div className="bg-blue-900/20 border border-blue-600/50 rounded-lg p-4 mb-4">
                <p className="text-blue-400 text-sm flex items-center gap-2">
                  <Info size={16} />
                  Your pool will transition to Raydium CPMM when complete
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Fee Tier
                </label>
                <select
                  name="raydiumFeeTier"
                  value={formData.raydiumFeeTier}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  {RAYDIUM_FEE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Trading Limits */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-purple-400">6.</span> Trading Limits
            </h2>
            <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4 mb-4">
              <p className="text-yellow-400 text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                Set to 0 to disable limits
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Global Limit Period (seconds)
                </label>
                <input
                  type="number"
                  name="gLimitPeriod"
                  value={formData.gLimitPeriod}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Global Limit (%)
                </label>
                <input
                  type="number"
                  name="gLimitPercent"
                  value={formData.gLimitPercent}
                  onChange={handleInputChange}
                  min="0"
                  max="100"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Wallet Limit Period (seconds)
                </label>
                <input
                  type="number"
                  name="wLimitPeriod"
                  value={formData.wLimitPeriod}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Wallet Limit (%)
                </label>
                <input
                  type="number"
                  name="wLimitPercent"
                  value={formData.wLimitPercent}
                  onChange={handleInputChange}
                  min="0"
                  max="100"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-200"
          >
            {loading ? 'Creating Pool...' : 'Create Pool'}
          </button>
        </form>
      </div>
    </div>
  );
}