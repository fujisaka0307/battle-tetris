// =============================================================================
// Log Analytics Workspace + Application Insights
// =============================================================================

@description('Azure region for monitoring resources.')
param location string

@description('Resource name suffix.')
param name string

// -----------------------------------------------------------------------------
// Log Analytics Workspace
// -----------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${name}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// -----------------------------------------------------------------------------
// Application Insights
// -----------------------------------------------------------------------------

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${name}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

@description('Application Insights connection string.')
output connectionString string = appInsights.properties.ConnectionString

@description('Application Insights instrumentation key.')
output instrumentationKey string = appInsights.properties.InstrumentationKey

@description('Resource ID of the Log Analytics Workspace.')
output logAnalyticsId string = logAnalytics.id

@description('Resource ID of Application Insights.')
output appInsightsId string = appInsights.id
