'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, setProvider } from '@coral-xyz/anchor';
import { PROGRAM_ID, CONFIG_SEED } from '@/lib/constants';
import IDL from '@/lib/idl/solana_launchpad.json';
import { handleTransactionError } from '@/lib/utils/errors';

const ProgramContext = createContext();

export function ProgramProvider({ children }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [program, setProgram] = useState(null);
  const [programStatus, setProgramStatus] = useState({
    isInitialized: false,
    isLoading: true,
    config: null,
    owner: null,
  });

  useEffect(() => {
    const initializeProgram = async () => {
      if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
        setProgramStatus(prev => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        const provider = new AnchorProvider(
          connection,
          wallet,
          { commitment: 'confirmed' }
        );
        setProvider(provider);
        
        const programInstance = new Program(IDL, provider);
        setProgram(programInstance);

        // Check if program is initialized
        const [configPda] = PublicKey.findProgramAddressSync(
          [CONFIG_SEED],
          PROGRAM_ID
        );

        try {
          const config = await programInstance.account.config.fetch(configPda);
          setProgramStatus({
            isInitialized: true,
            isLoading: false,
            config: config,
            owner: config.owner.toString(),
          });
        } catch (error) {
          // Program not initialized
          setProgramStatus({
            isInitialized: false,
            isLoading: false,
            config: null,
            owner: null,
          });
        }
      } catch (error) {
        console.error('Error initializing program:', error);
        handleTransactionError(error, 'Failed to connect to program');
        setProgramStatus({
          isInitialized: false,
          isLoading: false,
          config: null,
          owner: null,
        });
      }
    };

    initializeProgram();
  }, [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

  return (
    <ProgramContext.Provider value={{ program, programStatus }}>
      {children}
    </ProgramContext.Provider>
  );
}

export function useProgram() {
  const context = useContext(ProgramContext);
  if (!context) {
    throw new Error('useProgram must be used within ProgramProvider');
  }
  return context;
}