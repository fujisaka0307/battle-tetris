#!/usr/bin/env bash
# =============================================================================
# Battle Tetris Online - Infrastructure Deployment Script
# =============================================================================
#
# Usage:
#   ./deploy.sh              # Deploy dev environment (default)
#   ./deploy.sh --env dev    # Deploy dev environment
#   ./deploy.sh --env prod   # Deploy prod environment
#
# Prerequisites:
#   - Azure CLI (az) installed and logged in
#   - Bicep CLI installed (or Azure CLI with Bicep extension)
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------------------

ENV="dev"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown argument '$1'"
      echo "Usage: $0 [--env dev|prod]"
      exit 1
      ;;
  esac
done

# Validate environment
if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "Error: Environment must be 'dev' or 'prod'. Got: '$ENV'"
  exit 1
fi

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

LOCATION="japaneast"
RESOURCE_GROUP="rg-battle-tetris-${ENV}-${LOCATION}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARAM_FILE="${SCRIPT_DIR}/parameters/${ENV}.bicepparam"
TEMPLATE_FILE="${SCRIPT_DIR}/main.bicep"

echo "============================================="
echo " Battle Tetris Online - Infrastructure Deploy"
echo "============================================="
echo " Environment:    ${ENV}"
echo " Resource Group: ${RESOURCE_GROUP}"
echo " Location:       ${LOCATION}"
echo " Parameter File: ${PARAM_FILE}"
echo "============================================="
echo ""

# -----------------------------------------------------------------------------
# Validate prerequisites
# -----------------------------------------------------------------------------

if ! command -v az &> /dev/null; then
  echo "Error: Azure CLI (az) is not installed or not in PATH."
  echo "Install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
  exit 1
fi

# Check Azure login status
if ! az account show &> /dev/null; then
  echo "Error: Not logged in to Azure. Run 'az login' first."
  exit 1
fi

# Check that parameter file exists
if [[ ! -f "$PARAM_FILE" ]]; then
  echo "Error: Parameter file not found: ${PARAM_FILE}"
  exit 1
fi

# -----------------------------------------------------------------------------
# Create resource group if it does not exist
# -----------------------------------------------------------------------------

echo ">> Ensuring resource group '${RESOURCE_GROUP}' exists..."

if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
  echo "   Resource group already exists."
else
  echo "   Creating resource group..."
  az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
  echo "   Resource group created."
fi

echo ""

# -----------------------------------------------------------------------------
# Deploy infrastructure (incremental mode is the default, ensuring idempotency)
# -----------------------------------------------------------------------------

DEPLOYMENT_NAME="battle-tetris-${ENV}-$(date +%Y%m%d-%H%M%S)"

echo ">> Starting deployment '${DEPLOYMENT_NAME}'..."
echo ""

az deployment group create \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$TEMPLATE_FILE" \
  --parameters "$PARAM_FILE" \
  --output table

echo ""
echo "============================================="
echo " Bicep Deployment Complete"
echo "============================================="
echo ""

# -----------------------------------------------------------------------------
# Retrieve deployment outputs
# -----------------------------------------------------------------------------

echo ">> Retrieving deployment outputs..."
echo ""

OUTPUTS=$(az deployment group show \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.outputs" \
  --output json)

STATIC_WEB_APP_URL=$(echo "$OUTPUTS" | python3 -c "import sys,json;print(json.load(sys.stdin)['staticWebAppUrl']['value'])")
APP_SERVICE_URL=$(echo "$OUTPUTS" | python3 -c "import sys,json;print(json.load(sys.stdin)['appServiceUrl']['value'])")
SIGNALR_HOSTNAME=$(echo "$OUTPUTS" | python3 -c "import sys,json;print(json.load(sys.stdin)['signalRHostname']['value'])")

echo "  Static Web App URL:  ${STATIC_WEB_APP_URL}"
echo "  App Service URL:     ${APP_SERVICE_URL}"
echo "  SignalR Hostname:    ${SIGNALR_HOSTNAME}"
echo ""

# -----------------------------------------------------------------------------
# Update App Service CORS to allow the Static Web App origin
# -----------------------------------------------------------------------------

APP_SERVICE_NAME="app-battle-tetris-${ENV}"

echo ">> Updating App Service CORS to allow frontend origin..."

az webapp cors add \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --allowed-origins "$STATIC_WEB_APP_URL" \
  --output none 2>/dev/null || true

echo "   CORS updated."
echo ""

# -----------------------------------------------------------------------------
# Retrieve Static Web App deployment token
# -----------------------------------------------------------------------------

SWA_NAME="stapp-battle-tetris-${ENV}"

echo ">> Retrieving Static Web App deployment token..."

SWA_TOKEN=$(az staticwebapp secrets list \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.apiKey" \
  --output tsv)

echo "   Token retrieved (set as AZURE_STATIC_WEB_APPS_API_TOKEN in GitHub Secrets)."
echo ""

# -----------------------------------------------------------------------------
# Retrieve App Service publish profile
# -----------------------------------------------------------------------------

echo ">> Retrieving App Service publish profile..."

PUBLISH_PROFILE=$(az webapp deployment list-publishing-profiles \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --xml)

echo "   Publish profile retrieved (set as AZURE_APP_SERVICE_PUBLISH_PROFILE in GitHub Secrets)."
echo ""

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo "============================================="
echo " Deployment Complete — Summary"
echo "============================================="
echo ""
echo " Frontend URL:       ${STATIC_WEB_APP_URL}"
echo " Backend URL:        ${APP_SERVICE_URL}"
echo " SignalR Hostname:   ${SIGNALR_HOSTNAME}"
echo ""
echo " GitHub Secrets to configure:"
echo "   AZURE_STATIC_WEB_APPS_API_TOKEN = (retrieved above)"
echo "   AZURE_APP_SERVICE_PUBLISH_PROFILE = (retrieved above)"
echo ""
echo " GitHub Variables to configure:"
echo "   API_BASE_URL       = ${APP_SERVICE_URL}"
echo "   SIGNALR_URL        = ${APP_SERVICE_URL}/hub"
echo "   AZURE_APP_SERVICE_NAME = ${APP_SERVICE_NAME}"
echo ""
echo "Done."
