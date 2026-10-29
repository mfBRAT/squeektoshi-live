// Reads settled rounds straight from SqueekCore on Sepolia. Results never come from the API.
import { createPublicClient, fallback, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { CORE, RPCS, CONFIRMATIONS } from "./config.js";

export const CORE_EVENTS = parseAbi([
  "event RoundRecorded(uint64 indexed roundId, uint64 work, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)",
  "event BatchSettled(bytes32 indexed digest, address indexed reporter, uint64 indexed settledThroughRound, uint256 nonce, uint64 previousSettledThroughRound, uint16 activeRoundCount, uint64 cumulativeWork, uint96 cumulativeBlockUnits)",
]);

export function publicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: fallback(RPCS.map((u) => http(u, { timeout: 8_000, retryCount: 2, retryDelay: 400 }))),
  });
}

export function makeChain(client = publicClient()) {
  return {
    /** Newest block with at least CONFIRMATIONS confirmations. */
    async safeHead() { return (await client.getBlockNumber()) - CONFIRMATIONS + 1n; },
    /** Decoded RoundRecorded + BatchSettled logs in [from, to], in chain order. */
    async logs(fromBlock, toBlock) {
      const logs = await client.getLogs({ address: CORE, events: CORE_EVENTS, fromBlock, toBlock, strict: true });
      return logs
        .filter((l) => !l.removed)
        .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))
        .map((l) => ({ name: l.eventName, args: l.args, tx: l.transactionHash, block: l.blockNumber }));
    },
  };
}
