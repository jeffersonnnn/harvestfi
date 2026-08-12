export const pushPriceOracleAbi = [
    {
        type: "function",
        name: "postPrice",
        stateMutability: "nonpayable",
        inputs: [
            {name: "id", type: "uint256"},
            {name: "price", type: "int256"},
            {name: "timestamp", type: "uint64"},
            {name: "signature", type: "bytes"},
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "postPrices",
        stateMutability: "nonpayable",
        inputs: [
            {name: "ids", type: "uint256[]"},
            {name: "prices", type: "int256[]"},
            {name: "timestamps", type: "uint64[]"},
            {name: "signatures", type: "bytes[]"},
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "getPrice",
        stateMutability: "view",
        inputs: [{name: "id", type: "uint256"}],
        outputs: [
            {name: "price", type: "int256"},
            {name: "timestamp", type: "uint64"},
        ],
    },
    {
        type: "function",
        name: "trustedSigner",
        stateMutability: "view",
        inputs: [],
        outputs: [{type: "address"}],
    },
    {
        type: "function",
        name: "maxPriceAge",
        stateMutability: "view",
        inputs: [],
        outputs: [{type: "uint64"}],
    },
] as const;

export const commodityRegistryAbi = [
    {
        type: "function",
        name: "count",
        stateMutability: "view",
        inputs: [],
        outputs: [{type: "uint256"}],
    },
    {
        type: "function",
        name: "isListed",
        stateMutability: "view",
        inputs: [{name: "id", type: "uint256"}],
        outputs: [{type: "bool"}],
    },
] as const;
