import { SplashScreen } from '@capacitor/splash-screen';
import { createPasskey, authenticate } from './passkey-demo';
import { createSmartWallet, signIn, addFixedFundForSignedInContract, reset } from './capacitor-passkey-demo';

window.addEventListener('DOMContentLoaded', function () {
  SplashScreen.hide();
  
  const createPasskeyBtn = document.getElementById('create-passkey-btn');
  const authenticateBtn = document.getElementById('authenticate-btn');
  const createSmartWalletBtn = document.getElementById('create-smart-wallet-btn');
  const signInBtn = document.getElementById('sign-in-btn');
  const addFundsBtn = document.getElementById('add-funds-btn');
  const resetBtn = document.getElementById('reset-btn');

  if (createPasskeyBtn === null) {
    console.error('Create Passkey button not found!');
  } else {
    createPasskeyBtn.addEventListener('click', () => {
      createPasskey();
    });
  }
  if (authenticateBtn === null) {
    console.error('Authenticate button not found!');
  } else {
    authenticateBtn.addEventListener('click', () => {
      authenticate();
    });
  }

  if (createSmartWalletBtn === null) {
    console.error('Create smart wallet button not found!');
  } else {
    createSmartWalletBtn.addEventListener('click', () => {
      createSmartWallet();
    });
  }

  if (signInBtn === null) {
    console.error('Sign in button not found!');
  } else {
    signInBtn.addEventListener('click', () => {
      signIn();
    });
  }

  if (addFundsBtn === null) {
    console.error('Add funds button not found!');
  } else {
    addFundsBtn.addEventListener('click', () => {
      addFixedFundForSignedInContract();
    });
  }

  if (resetBtn === null) {
    console.error('Reset button not found!');
  } else {
    resetBtn.addEventListener('click', () => {
      reset();
    });
  }

});
