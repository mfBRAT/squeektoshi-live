// GET /api/auth/nonce?address=0x… -> the exact Sign-In with Ethereum message for the wallet to sign.
import { randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { createSiweMessage } from "viem/siwe";
import { CHAIN_ID, NONCE_MINUTES } from "../../lib/config.js";
import { storeFor } from "../../lib/store.js";
import { json, fail } from "../../lib/http.js";

export default async (req) => {
  if (req.method !== "GET") return fail(405, "Method not allowed");
  const url = new URL(req.url);
  const address = url.searchParams.get("address") || "";
  if (!isAddress(address, { strict: false })) return fail(400, "Invalid wallet address");

  const nonce = randomBytes(12).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + NONCE_MINUTES * 60;
  await storeFor(req).setJSON(`nonces/${exp}-${nonce}`, { addr: address.toLowerCase() });

  const message = createSiweMessage({
    domain: url.host,
    address: getAddress(address),
    statement: "Sign in to Squeek or Sleep. This is free and does not send a transaction.",
    uri: url.origin,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
    issuedAt: new Date(),
    expirationTime: new Date(exp * 1000),
  });
  return json({ message });
};

export const config = { path: "/api/auth/nonce" };
