// =============================================================================
// Battle Tetris Online - Main Infrastructure Orchestration
// =============================================================================

targetScope = 'resourceGroup'

// -----------------------------------------------------------------------------
// Parameters
// -----------------------------------------------------------------------------

@description('Azure region for all resources.')
param location string = 'japaneast'

@allowed([
  'dev'
  'prod'
])
@description('Deployment environment.')
param environment string = 'dev'

@description('Base project name used for resource naming.')
param projectName string = 'battle-tetris'

// -----------------------------------------------------------------------------
// Variables
// -----------------------------------------------------------------------------

var suffix = '${projectName}-${environment}'

// -----------------------------------------------------------------------------
// Modules
// -----------------------------------------------------------------------------

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring-deployment'
  params: {
    location: location
    name: suffix
  }
}

module signalr 'modules/signalr.bicep' = {
  name: 'signalr-deployment'
  params: {
    location: location
    name: suffix
  }
}

// Static Web Apps は japaneast 非対応のため eastasia を使用
module staticWebApp 'modules/staticWebApp.bicep' = {
  name: 'static-web-app-deployment'
  params: {
    location: 'eastasia'
    name: suffix
  }
}

module appService 'modules/appService.bicep' = {
  name: 'app-service-deployment'
  params: {
    location: location
    name: suffix
    signalRConnectionString: signalr.outputs.connectionString
    appInsightsConnectionString: monitoring.outputs.connectionString
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

@description('URL of the Static Web App (frontend).')
output staticWebAppUrl string = staticWebApp.outputs.defaultHostname

@description('URL of the App Service (backend API).')
output appServiceUrl string = appService.outputs.defaultHostname

@description('SignalR Service hostname.')
output signalRHostname string = signalr.outputs.hostname
