// =============================================================================
// App Service Plan (Linux B1) + App Service (Node 22 LTS)
// =============================================================================

@description('Azure region for the App Service.')
param location string

@description('Resource name suffix.')
param name string

@secure()
@description('Azure SignalR Service connection string.')
param signalRConnectionString string

@description('Application Insights connection string.')
param appInsightsConnectionString string

// -----------------------------------------------------------------------------
// App Service Plan
// -----------------------------------------------------------------------------

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-${name}'
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true // Required for Linux
  }
}

// -----------------------------------------------------------------------------
// App Service
// -----------------------------------------------------------------------------

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: 'app-${name}'
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      webSocketsEnabled: true
      cors: {
        allowedOrigins: [
          'http://localhost:5173'
          'http://localhost:3000'
        ]
        supportCredentials: true
      }
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'AZURE_SIGNALR_CONNECTION_STRING'
          value: signalRConnectionString
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
      ]
    }
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

@description('Default hostname of the App Service.')
output defaultHostname string = 'https://${appService.properties.defaultHostName}'

@description('Resource ID of the App Service.')
output resourceId string = appService.id
