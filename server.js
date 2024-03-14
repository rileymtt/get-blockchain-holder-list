const { ethers } = require("ethers");
const moment = require("moment");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const csvWriter = createCsvWriter({
  path: `logs/starnet-snapshot-${moment().format("YYYY-MM-DD_HH-mm-ss")}.csv`,
  header: [
    { id: "walletAddress", title: "wallet address" },
    { id: "amount", title: "amount" },
  ],
});

// RPC URL
const rpcURL = "https://eth.llamarpc.com";

// token contract address (you can change this to any ERC20 token)
const tokenAddress = "0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766"; // USDT

// token contract ABI
const tokenABI = [
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_from", type: "address" },
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  { payable: true, stateMutability: "payable", type: "fallback" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "spender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
];

// Create a provider
const provider = new ethers.providers.JsonRpcProvider(rpcURL);

// Create a contract
const contract = new ethers.Contract(tokenAddress, tokenABI, provider);

// Find the block number where the contract was created
async function findContractCreationBlock() {
  let high = await provider.getBlockNumber();
  let low = 0;
  let contractCreationBlock = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const code = await provider.getCode(tokenAddress, mid);

    if (code !== "0x") {
      high = mid - 1;
      contractCreationBlock = mid;
    } else {
      low = mid + 1;
    }
  }

  return contractCreationBlock;
}

// Scan a range of blocks for events
const scanBlock = async (from, to) => {
  try {
    const batchEvents = await contract.queryFilter(
      contract.filters.Transfer(),
      from,
      to
    );
    console.log({
      from,
      to,
      batchEvents: batchEvents.length,
    });
    return batchEvents;
  } catch (error) {
    console.log("Scan again...");
    return scanBlock(from, to);
  }
};

async function main() {
  console.log("Starting...");
  const startBlock = await findContractCreationBlock();
  const endBlock = await provider.getBlockNumber(); // Latest block number
  const maxRange = 100000; // Adjust based on your provider's limits
  let totalEvents = 0;

  console.log({
    startBlock,
    endBlock,
    maxRange,
  });

  const balances = {};
  for (let i = startBlock; i <= endBlock; i += maxRange) {
    const from = i;
    const to = Math.min(i + maxRange - 1, endBlock);

    const batchEvents = await scanBlock(from, to);

    totalEvents += batchEvents.length;

    batchEvents.forEach((event) => {
      const { from, to, value } = event.args;
      // Subtract from sender
      if (balances[from]) {
        balances[from] = balances[from].sub(value);
      } else {
        balances[from] = value.mul(-1);
      }
      // Add to receiver
      if (balances[to]) {
        balances[to] = balances[to].add(value);
      } else {
        balances[to] = value;
      }
    });
  }

  for (const address in balances) {
    if (balances[address].lte(0)) {
      delete balances[address];
    } else {
      balances[address] = ethers.utils.formatUnits(balances[address], 18);
    }
  }

  const list = [];
  for (const iterator of Object.entries(balances)) {
    list.push({
      walletAddress: iterator[0],
      amount: iterator[1],
    });
  }

  console.log("Total events: ", totalEvents);

  csvWriter
    .writeRecords(list) // returns a promise
    .then(() => {
      console.log("...Done");
    });
}

main();
