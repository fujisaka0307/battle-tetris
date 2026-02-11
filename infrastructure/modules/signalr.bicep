// =============================================================================
// Azure SignalR Service - Free_F1, Serverless Mode
// =============================================================================

@description('Azure region for SignalR Service.')
param location string

@description('Resource name suffix.')
param name string

// -----------------------------------------------------------------------------
// Resources
// -----------------------------------------------------------------------------

resource signalR 'Microsoft.SignalRService/signalR@2024-03-01' = {
  name: 'sigr-${name}'
  location: location
  sku: {
    name: 'Free_F1'
    tier: 'Free'
    capacity: 1
  }
  kind: 'SignalR'
  properties: {
    features: [
      {
        flag: 'ServiceMode'
        value: 'Serverless'
      }
      {
        flag: 'EnableConnectivityLogs'
        value: 'True'
      }
      {
        flag: 'EnableMessagingLogs'
        value: 'True'
      }
    ]
    cors: {
      allowedOrigins: [
        '*'
      ]
    }
    tls: {
      clientCertEnabled: false
    }
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

@description('Connection string for the SignalR Service.')
output connectionString string = signalR.listKeys().primaryConnectionString

@description('Hostname of the SignalR Service.')
output hostname string = signalR.properties.hostName

@description('Resource ID of the SignalR Service.')
output resourceId string = signalR.id
