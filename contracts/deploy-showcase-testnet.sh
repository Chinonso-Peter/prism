#!/usr/bin/env bash
set -euo pipefail

SOURCE_ACCOUNT="${SOURCE_ACCOUNT:-prism-showcase}"
NETWORK="${NETWORK:-testnet}"
PRISM_URL="${PRISM_URL:-https://prism-gules.vercel.app}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! stellar keys address "$SOURCE_ACCOUNT" >/dev/null 2>&1; then
  echo "Creating and funding Stellar identity '$SOURCE_ACCOUNT' on $NETWORK..."
  stellar keys generate --global "$SOURCE_ACCOUNT" --network "$NETWORK" --fund
fi

ADMIN_ADDRESS="$(stellar keys address "$SOURCE_ACCOUNT")"

echo "Building the showcase contract..."
stellar contract build

echo "Deploying the showcase contract..."
CONTRACT_ID="$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/prism_showcase.wasm \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK")"

echo "Initializing and generating sample activity..."
stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE_ACCOUNT" --network "$NETWORK" \
  -- init --admin "$ADMIN_ADDRESS"
stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE_ACCOUNT" --network "$NETWORK" \
  -- bump --by 7
stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE_ACCOUNT" --network "$NETWORK" \
  -- put_note --author "$ADMIN_ADDRESS" --name hello --body "first revision"
stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE_ACCOUNT" --network "$NETWORK" \
  -- store_collections --values '[1,2,3]' --labels '{"environment":"testnet","purpose":"showcase"}'
stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE_ACCOUNT" --network "$NETWORK" \
  -- tally --amounts '[10,20,12]'
stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE_ACCOUNT" --network "$NETWORK" \
  -- start_session --who "$ADMIN_ADDRESS" --ledgers 200

echo
echo "Contract ID: $CONTRACT_ID"
echo "Prism URL: ${PRISM_URL%/}/contract/$CONTRACT_ID"
