
import React, { useEffect } from 'react';
 import { GetUser } from 'redux-state/selectors';
 import dataProvider from 'dataPrvider';
 import { toast } from 'react-toastify';
 import 'react-toastify/dist/ReactToastify.css';
 
 const DISPLAY_TIME = 10000;
 const ZERO_POINT_ONE = 0.5;
 
 const MonitorUserWallet: React.FC = () => {
   const user = GetUser();
 
   useEffect(() => {
     if (!user?.walletAddress) return;
 
     const interval = setInterval(() => {
       monitorWalletBalance(user.walletAddress);
     }, DISPLAY_TIME);
 
     monitorWalletBalance(user.walletAddress);
 
     return () => clearInterval(interval);
   }, [user?.walletAddress]);
 
   const monitorWalletBalance = async (walletAddress: string) => {
     try {
       const response =
         await dataProvider.monitorUserWalletBalance(walletAddress);
       if (response.balance < ZERO_POINT_ONE) {
         toast.info(
           `Your wallet balance is less than 0.1 MATIC: ${response.balance} MATIC`,
           {
             position: 'top-left',
             autoClose: 6000,
             style: {
               minWidth: '680px'
             }
           }
         );
         // eslint-disable-next-line
         console.log('Wallet balance monitoring result:', response.balance);
       }
       // eslint-disable-next-line
       console.log('Wallet balance monitoring result:', response.balance);
     } catch (error) {
       console.error('Wallet balance monitoring error:', error);
     }
   };
 
   return null;
 };
